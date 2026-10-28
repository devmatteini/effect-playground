import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as Array from "effect/Array"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { pipe } from "effect/Function"
import * as Request from "effect/Request"
import * as RequestResolver from "effect/RequestResolver"
import * as Stream from "effect/Stream"

// Port of ../../v3/src/batching-with-streams.ts. No dataLoader in v4: the resolver itself has the window
// (setDelay = dataLoader `window`) and the max batch size (batchN = dataLoader `maxBatchSize`).
//
// node src/batching-with-streams.ts             -> 3 batches of 5, same output as v3
// node src/batching-with-streams.ts sequential  -> 5 batches (5, 4, 3, 2, 1): no `batching` option in v4,
//                                                  a sequential forEach sends one request at a time

// v3 used `batching: "inherit"` here: all requests of one item were collected together
const innerConcurrency = process.argv[2] === "sequential" ? 1 : "unbounded"

const processItem = (item: number) =>
    Effect.gen(function* () {
        const processed = pipe(
            Array.replicate(`batch-${item}`, item),
            Array.map((x, i) => `${x}-${i + 1}`),
        )

        yield* Effect.forEach(processed, (item) => Effect.request(new SaveItem({ item }), SaveItemResolver), {
            concurrency: innerConcurrency,
        })
    })

const program = pipe(Stream.make(1, 2, 3, 4, 5), Stream.mapEffect(processItem, { concurrency: 5 }), Stream.runDrain)

class SaveItem extends Request.TaggedClass("SaveItem")<{ item: string }, void> {}

const SaveItemResolver = RequestResolver.make<SaveItem>((entries) =>
    Effect.gen(function* () {
        const items = entries.map((x) => x.request.item).join(", ")
        yield* Console.log(`Saving ${items}`)
        for (const entry of entries) entry.completeUnsafe(Exit.void)
    }),
).pipe(RequestResolver.batchN(5), RequestResolver.setDelay("10 millis"))

NodeRuntime.runMain(program)
