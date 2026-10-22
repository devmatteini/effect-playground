import * as Effect from "effect/Effect"
import * as F from "effect/Function"
import * as Data from "effect/Data"
import * as Console from "effect/Console"
import * as Prompt from "@effect/cli/Prompt"
import * as NodeContext from "@effect/platform-node/NodeContext"

class NothingSelectedError extends Data.TaggedError("NothingSelected") {}

const selectPrompt = Effect.gen(function* (_) {
    const selected = yield* _(
        Prompt.select({
            message: "Select an option",
            choices: [
                {
                    title: "Choice 1",
                    value: 1,
                },
                {
                    title: "Choice 2",
                    value: 2,
                },
                {
                    title: "Choice 3",
                    value: 3,
                },
            ],
        }),
        Effect.catchTag("QuitException", () => new NothingSelectedError()),
    )

    yield* _(Console.log("\nSelected:"))
    yield* _(Console.log(selected))
})

const main = () => F.pipe(selectPrompt, Effect.provide(NodeContext.layer), Effect.runPromise)

main().catch((e) => {
    console.error("\n")
    console.error(e)
    process.exit(1)
})
