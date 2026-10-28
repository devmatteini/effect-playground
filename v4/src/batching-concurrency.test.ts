import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as F from "effect/Function"
import * as Request from "effect/Request"
import * as RequestResolver from "effect/RequestResolver"
import * as TestClock from "effect/testing/TestClock"
import { describe, expect, test } from "vitest"

// v4: no `batching` option, no withRequestBatching. The resolver collects the requests that are pending
// at the same time (default delay: one yieldNow) from any fiber. batchN runs a batch as soon as it is full,
// so full batches can run in parallel (v3: sequentially).

class Save extends Request.TaggedClass("Save")<{ readonly id: number }, void> {}

const ids = Array.from({ length: 12 }, (_, i) => i + 1)

type SaveFn = (id: number) => Effect.Effect<void>

type Configure = (resolver: RequestResolver.RequestResolver<Save>) => RequestResolver.RequestResolver<Save>

// resolver records every invocation (ids of the batch) and how many invocations run at the same time.
// events: when each request is made and when each batch starts
const record = async (program: (save: SaveFn) => Effect.Effect<unknown>, configure: Configure) => {
    const batches: number[][] = []
    const events: string[] = []
    let inFlight = 0
    let maxInFlight = 0

    const resolver = RequestResolver.make<Save>((entries) =>
        Effect.gen(function* () {
            batches.push(entries.map((x) => x.request.id))
            events.push(batch(...entries.map((x) => x.request.id)))
            inFlight++
            maxInFlight = Math.max(maxInFlight, inFlight)
            yield* Effect.sleep("10 millis")
            inFlight--
            for (const entry of entries) entry.completeUnsafe(Exit.void)
        }),
    ).pipe(RequestResolver.batchN(5), configure)

    const save = (id: number) =>
        F.pipe(
            Effect.sync(() => events.push(request(id))),
            Effect.andThen(Effect.request(new Save({ id }), resolver)),
        )

    await F.pipe(program(save), Effect.runPromise)

    return { batches, maxInFlight, events }
}

const runScenario = async (program: (save: SaveFn) => Effect.Effect<unknown>, configure: Configure = F.identity) => {
    const { batches, maxInFlight } = await record(program, configure)
    return { batches, maxInFlight }
}

const runTimeline = async (program: (save: SaveFn) => Effect.Effect<unknown>, configure: Configure = F.identity) =>
    (await record(program, configure)).events

const request = (id: number) => `request ${id}`
const requests = (...ids: number[]) => ids.map(request)
const batch = (...ids: number[]) => `batch ${ids.join(",")}`

// simulates a read (e.g. mongo find) before the save, with different durations per item
const readThenSave = (save: SaveFn) => (id: number) =>
    F.pipe(Effect.sleep(`${((id % 3) + 1) * 20} millis`), Effect.andThen(save(id)))

// simulates requests made at different times: item N is requested after N * 30 millis
const spreadSave = (save: SaveFn) => (id: number) => F.pipe(Effect.sleep(`${id * 30} millis`), Effect.andThen(save(id)))

// v3 for the same programs: always all 12 requests first, then batches 1-5, 6-10, 11-12
describe("when the resolver runs", () => {
    test("concurrency 3: batch = requests pending in the window (one yieldNow), at most 3", async () => {
        const events = await runTimeline((save) => Effect.forEach(ids, save, { concurrency: 3 }))

        expect(events).toEqual([
            ...requests(1, 2, 3),
            batch(1, 2, 3),
            ...requests(4, 5, 6),
            batch(4, 5, 6),
            ...requests(7, 8, 9),
            batch(7, 8, 9),
            ...requests(10, 11, 12),
            batch(10, 11, 12),
        ])
    })

    test("unbounded: same batches as v3, but a full batch starts without waiting for the other requests", async () => {
        const events = await runTimeline((save) => Effect.forEach(ids, save, { concurrency: "unbounded" }))

        expect(events).toEqual([
            ...requests(1, 2, 3, 4, 5),
            batch(1, 2, 3, 4, 5),
            ...requests(6, 7, 8, 9, 10),
            batch(6, 7, 8, 9, 10),
            ...requests(11, 12),
            batch(11, 12),
        ])
    })

    test("requests spread over time: default window, one batch per request", async () => {
        const events = await runTimeline((save) => Effect.forEach(ids, spreadSave(save), { concurrency: "unbounded" }))

        expect(events).toEqual(ids.flatMap((id) => [request(id), batch(id)]))
    })

    test("requests spread over time + setDelay: one batch per window", async () => {
        // window opens with the first pending request: 30 -> 135, 150 -> 255, 270 -> 375 millis
        const events = await runTimeline(
            (save) => Effect.forEach(ids, spreadSave(save), { concurrency: "unbounded" }),
            RequestResolver.setDelay("105 millis"),
        )

        expect(events).toEqual([
            ...requests(1, 2, 3, 4),
            batch(1, 2, 3, 4),
            ...requests(5, 6, 7, 8),
            batch(5, 6, 7, 8),
            ...requests(9, 10, 11, 12),
            batch(9, 10, 11, 12),
        ])
    })
})

describe("sequential (no concurrency)", () => {
    test("one resolver call per request", async () => {
        const result = await runScenario((save) => Effect.forEach(ids, save))

        expect(result).toEqual({
            batches: ids.map((id) => [id]),
            maxInFlight: 1,
        })
    })

    test("setDelay does not help: each request waits for the previous one", async () => {
        const result = await runScenario((save) => Effect.forEach(ids, save), RequestResolver.setDelay("20 millis"))

        expect(result).toEqual({
            batches: ids.map((id) => [id]),
            maxInFlight: 1,
        })
    })
})

// replaces v3 withConcurrency(5) + withRequestBatching(true) + "inherit"
describe("concurrency 5", () => {
    test("batch = requests in flight together", async () => {
        const result = await runScenario((save) => Effect.forEach(ids, save, { concurrency: 5 }))

        expect(result).toEqual({
            batches: [
                [1, 2, 3, 4, 5],
                [6, 7, 8, 9, 10],
                [11, 12],
            ],
            maxInFlight: 1,
        })
    })

    test("read before save: only requests pending in the same tick are batched", async () => {
        const result = await runScenario((save) => Effect.forEach(ids, readThenSave(save), { concurrency: 5 }))

        // non deterministic, e.g. sizes [1, 1, 2, 1, 2, 1, 1, 1, 1, 1]: depends on which reads end together.
        // v3 with batching: always [5, 5, 2]
        expect(result.batches.length).toBeGreaterThan(3)
        expect(result.batches.flat().toSorted((a, b) => a - b)).toEqual(ids)
    })
})

describe("concurrency unbounded", () => {
    test("full batches run in parallel", async () => {
        const result = await runScenario((save) => Effect.forEach(ids, save, { concurrency: "unbounded" }))

        expect(result).toEqual({
            batches: [
                [1, 2, 3, 4, 5],
                [6, 7, 8, 9, 10],
                [11, 12],
            ],
            maxInFlight: 3,
        })
    })

    test("read before save: one batch per group of reads ending together", async () => {
        const result = await runScenario((save) =>
            Effect.forEach(ids, readThenSave(save), { concurrency: "unbounded" }),
        )

        // reads of 20 (3, 6, 9, 12), 40 (1, 4, 7, 10), 60 (2, 5, 8, 11) millis.
        // Usually [[3, 6, 9, 12], [1, 4, 7, 10], [2, 5, 8, 11]], but timers of the same group can fire
        // in different ticks (e.g. [[3], [6, 9, 12], ...]): a batch never mixes groups
        const readGroupsPerBatch = result.batches.map((batch) => new Set(batch.map((id) => id % 3)).size)
        expect(readGroupsPerBatch.every((x) => x === 1)).toBe(true)
        expect(result.batches.flat().toSorted((a, b) => a - b)).toEqual(ids)
    })

    test("read before save + setDelay: wider window collects more requests", async () => {
        const result = await runScenario(
            (save) => Effect.forEach(ids, readThenSave(save), { concurrency: "unbounded" }),
            RequestResolver.setDelay("50 millis"),
        )

        // batch opens at 20 millis, full at 40 (runs immediately), next one opens at 40, full at 60,
        // last one runs when its window ends
        expect(result).toEqual({
            batches: [
                [3, 6, 9, 12, 1],
                [4, 7, 10, 2, 5],
                [8, 11],
            ],
            maxInFlight: 1,
        })
    })
})

// TestClock (default in @effect/vitest `it.effect`) wakes one sleep at a time and waits until the woken
// fiber suspends: the batch runs before the next sleep is woken
describe("TestClock", () => {
    test("read before save: no batching", async () => {
        const result = await runScenario((save) =>
            Effect.gen(function* () {
                const fiber = yield* Effect.forkChild(
                    Effect.forEach(ids, readThenSave(save), { concurrency: "unbounded" }),
                )
                yield* TestClock.adjust("1 second")
                yield* Fiber.join(fiber)
            }).pipe(Effect.provide(TestClock.layer())),
        )

        // with real timers: batches grouped by read duration (see "concurrency unbounded")
        expect(result).toEqual({
            batches: [[3], [6], [9], [12], [1], [4], [7], [10], [2], [5], [8], [11]],
            maxInFlight: 4,
        })
    })
})

describe("batching across fibers", () => {
    test("requests from independent forEach share batches", async () => {
        const result = await runScenario((save) =>
            Effect.all([Effect.forEach([1, 2, 3], save), Effect.forEach([4, 5, 6], save)], { concurrency: 2 }),
        )

        expect(result).toEqual({
            batches: [
                [1, 4],
                [2, 5],
                [3, 6],
            ],
            maxInFlight: 1,
        })
    })
})
