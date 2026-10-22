import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as Request from "effect/Request"
import * as RequestResolver from "effect/RequestResolver"
import * as Stream from "effect/Stream"
import * as Console from "effect/Console"
import { dataLoader } from "@effect/experimental/RequestResolver"

// Tim Smart version from discord thread https://effect.website/play#80697457d50e

const processItem = (item: number, resolver: RequestResolver.RequestResolver<SaveItem, never>) =>
    Effect.gen(function* (_) {
        const processed = pipe(
            Array.replicate(`batch-${item}`, item),
            Array.map((x, i) => `${x}-${i + 1}`),
        )

        yield* _(
            Effect.forEach(processed, (item) => Effect.request(new SaveItem({ item }), resolver), {
                batching: "inherit",
            }),
        )
    })

const program = Effect.gen(function* (_) {
    /* NOTE:
        dataLoader must be created once as it's a stateful resource (with a Scope)
        ---
        window: time frame to accumulate requests and then executes them in batch
        maxBatchSize: maximum number of requests to batch together (replace RequestResolver.batchN)
    */
    const resolver = yield* _(dataLoader(SaveItemResolver, { window: 10, maxBatchSize: 5 }))

    yield* _(
        Stream.make(1, 2, 3, 4, 5),
        // NOTE: concurrency > 1 is needed to combine items across different batches
        Stream.mapEffect((item) => processItem(item, resolver), { concurrency: 5 }),
        Stream.runDrain,
    )
}).pipe(Effect.scoped)

class SaveItem extends Request.TaggedClass("SaveItem")<void, never, { item: string }> {}

const SaveItemResolver = RequestResolver.makeBatched((requests: Array.NonEmptyArray<SaveItem>) =>
    Effect.gen(function* (_) {
        const items = requests.map((x) => x.item).join(", ")
        yield* _(Console.log(`Saving ${items}`))
        yield* _(Effect.forEach(requests, (request) => Request.completeEffect(request, Effect.void)))
    }),
)

const main = pipe(program, Effect.withRequestBatching(true))

NodeRuntime.runMain(main)
