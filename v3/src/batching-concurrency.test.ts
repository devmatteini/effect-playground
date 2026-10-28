import * as Effect from "effect/Effect"
import * as F from "effect/Function"
import * as Request from "effect/Request"
import * as RequestResolver from "effect/RequestResolver"
import type * as Array from "effect/Array"
import { describe, expect, test } from "vitest"

// v3: batching is decided by forEach/all (`batching` option or `withRequestBatching` + "inherit").
// With batching on, forEach waits until every item is done or blocked on a request (a blocked item frees
// its concurrency slot), then runs all collected requests in one round: batchN chunks run sequentially.

class Save extends Request.TaggedClass("Save")<void, never, { readonly id: number }> {}

const ids = globalThis.Array.from({ length: 12 }, (_, i) => i + 1)

type SaveFn = (id: number) => Effect.Effect<void>

// resolver records every invocation (ids of the batch) and how many invocations run at the same time.
// events: when each request is made and when each batch starts
const record = async (program: (save: SaveFn) => Effect.Effect<unknown>) => {
    const batches: number[][] = []
    const events: string[] = []
    let inFlight = 0
    let maxInFlight = 0

    const resolver = RequestResolver.makeBatched((requests: Array.NonEmptyArray<Save>) =>
        Effect.gen(function* () {
            batches.push(requests.map((x) => x.id))
            events.push(batch(...requests.map((x) => x.id)))
            inFlight++
            maxInFlight = Math.max(maxInFlight, inFlight)
            yield* Effect.sleep("10 millis")
            inFlight--
            yield* Effect.forEach(requests, (request) => Request.succeed(request, undefined), { discard: true })
        }),
    ).pipe(RequestResolver.batchN(5))

    const save = (id: number) =>
        F.pipe(
            Effect.sync(() => events.push(request(id))),
            Effect.zipRight(Effect.request(new Save({ id }), resolver)),
        )

    await F.pipe(program(save), Effect.runPromise)

    return { batches, maxInFlight, events }
}

const runScenario = async (program: (save: SaveFn) => Effect.Effect<unknown>) => {
    const { batches, maxInFlight } = await record(program)
    return { batches, maxInFlight }
}

const runTimeline = async (program: (save: SaveFn) => Effect.Effect<unknown>) => (await record(program)).events

const request = (id: number) => `request ${id}`
const requests = (...ids: number[]) => ids.map(request)
const batch = (...ids: number[]) => `batch ${ids.join(",")}`

// simulates a read (e.g. mongo find) before the save, with different durations per item
const readThenSave = (save: SaveFn) => (id: number) =>
    F.pipe(Effect.sleep(`${((id % 3) + 1) * 20} millis`), Effect.zipRight(save(id)))

// simulates requests made at different times: item N is requested after N * 30 millis
const spreadSave = (save: SaveFn) => (id: number) =>
    F.pipe(Effect.sleep(`${id * 30} millis`), Effect.zipRight(save(id)))

const batchSizes = (batches: number[][]) => batches.map((x) => x.length)

describe("when the resolver runs", () => {
    test("concurrency 3: waits for all requests, then splits them by batchN", async () => {
        const events = await runTimeline((save) => Effect.forEach(ids, save, { concurrency: 3, batching: true }))

        expect(events).toEqual([
            ...requests(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12),
            batch(1, 2, 3, 4, 5),
            batch(6, 7, 8, 9, 10),
            batch(11, 12),
        ])
    })

    test("requests spread over time: still waits for all of them", async () => {
        const events = await runTimeline((save) =>
            Effect.forEach(ids, spreadSave(save), { concurrency: "unbounded", batching: true }),
        )

        expect(events).toEqual([
            ...requests(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12),
            batch(1, 2, 3, 4, 5),
            batch(6, 7, 8, 9, 10),
            batch(11, 12),
        ])
    })
})

describe("sequential (no concurrency)", () => {
    test("no batching option: one resolver call per request", async () => {
        const result = await runScenario((save) => Effect.forEach(ids, save))

        expect(result).toEqual({
            batches: ids.map((id) => [id]),
            maxInFlight: 1,
        })
    })

    test("batching: true: all requests collected, split by batchN", async () => {
        const result = await runScenario((save) => Effect.forEach(ids, save, { batching: true }))

        expect(result).toEqual({
            batches: [
                [1, 2, 3, 4, 5],
                [6, 7, 8, 9, 10],
                [11, 12],
            ],
            maxInFlight: 1,
        })
    })
})

describe("concurrency 5", () => {
    test("no batching option: one resolver call per request, 5 in flight", async () => {
        const result = await runScenario((save) => Effect.forEach(ids, save, { concurrency: 5 }))

        expect(result).toEqual({
            batches: ids.map((id) => [id]),
            maxInFlight: 5,
        })
    })

    test("batching: true: same as sequential", async () => {
        const result = await runScenario((save) => Effect.forEach(ids, save, { concurrency: 5, batching: true }))

        expect(result).toEqual({
            batches: [
                [1, 2, 3, 4, 5],
                [6, 7, 8, 9, 10],
                [11, 12],
            ],
            maxInFlight: 1,
        })
    })

    test("batching: true, read before save: still all 12 requests in one round", async () => {
        const result = await runScenario((save) =>
            Effect.forEach(ids, readThenSave(save), { concurrency: 5, batching: true }),
        )

        // order inside batches depends on read durations
        expect(batchSizes(result.batches)).toEqual([5, 5, 2])
        expect(result.maxInFlight).toEqual(1)
    })
})

describe("concurrency unbounded", () => {
    test("batching: true", async () => {
        const result = await runScenario((save) =>
            Effect.forEach(ids, save, { concurrency: "unbounded", batching: true }),
        )

        expect(result).toEqual({
            batches: [
                [1, 2, 3, 4, 5],
                [6, 7, 8, 9, 10],
                [11, 12],
            ],
            maxInFlight: 1,
        })
    })

    test("batching: true, read before save", async () => {
        const result = await runScenario((save) =>
            Effect.forEach(ids, readThenSave(save), { concurrency: "unbounded", batching: true }),
        )

        expect(batchSizes(result.batches)).toEqual([5, 5, 2])
        expect(result.maxInFlight).toEqual(1)
    })
})

// concurrency and batching set once on the whole program, forEach inherits them
describe("inherit", () => {
    test("withConcurrency(5) + withRequestBatching(true)", async () => {
        const result = await runScenario((save) =>
            F.pipe(
                Effect.forEach(ids, save, { concurrency: "inherit", batching: "inherit" }),
                Effect.withConcurrency(5),
                Effect.withRequestBatching(true),
            ),
        )

        expect(result).toEqual({
            batches: [
                [1, 2, 3, 4, 5],
                [6, 7, 8, 9, 10],
                [11, 12],
            ],
            maxInFlight: 1,
        })
    })

    test("withConcurrency(5) + withRequestBatching(true), read before save", async () => {
        const result = await runScenario((save) =>
            F.pipe(
                Effect.forEach(ids, readThenSave(save), { concurrency: "inherit", batching: "inherit" }),
                Effect.withConcurrency(5),
                Effect.withRequestBatching(true),
            ),
        )

        expect(batchSizes(result.batches)).toEqual([5, 5, 2])
        expect(result.maxInFlight).toEqual(1)
    })

    test("withConcurrency(5) + withRequestBatching(false): no batching", async () => {
        const result = await runScenario((save) =>
            F.pipe(
                Effect.forEach(ids, save, { concurrency: "inherit", batching: "inherit" }),
                Effect.withConcurrency(5),
                Effect.withRequestBatching(false),
            ),
        )

        expect(result).toEqual({
            batches: ids.map((id) => [id]),
            maxInFlight: 5,
        })
    })

    test("defaults: request batching is on by default", async () => {
        const result = await runScenario((save) =>
            Effect.forEach(ids, save, { concurrency: "inherit", batching: "inherit" }),
        )

        expect(result).toEqual({
            batches: [
                [1, 2, 3, 4, 5],
                [6, 7, 8, 9, 10],
                [11, 12],
            ],
            maxInFlight: 1,
        })
    })
})

describe("batching across fibers", () => {
    test("independent forEach, outer all without batching", async () => {
        const result = await runScenario((save) =>
            Effect.all([Effect.forEach([1, 2, 3], save), Effect.forEach([4, 5, 6], save)], { concurrency: 2 }),
        )

        expect(result).toEqual({
            batches: [[1], [4], [2], [5], [3], [6]],
            maxInFlight: 2,
        })
    })

    test("independent forEach, outer all with batching: true", async () => {
        const result = await runScenario((save) =>
            Effect.all([Effect.forEach([1, 2, 3], save), Effect.forEach([4, 5, 6], save)], {
                concurrency: 2,
                batching: true,
            }),
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
