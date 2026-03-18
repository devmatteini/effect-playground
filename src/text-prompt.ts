import * as Effect from "effect/Effect"
import * as Console from "effect/Console"
import * as E from "effect/Either"
import * as Doc from "@effect/printer-ansi/AnsiDoc"
import * as Ansi from "@effect/printer-ansi/Ansi"
import * as Match from "effect/Match"
import * as F from "effect/Function"
import * as NodeReadline from "node:readline"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeContext from "@effect/platform-node/NodeContext"

type TextPrompt = {
    type: "singleLine" | "multiLine"
    message: string
    validate: (value: string) => Effect.Effect<string, string>
}

// NOTE: paste from clipboard doesn't work with default Prompt.text, see https://github.com/Effect-TS/effect/issues/1810
const textPrompt = ({ type, message, validate }: TextPrompt) =>
    Effect.gen(function* () {
        while (true) {
            yield* Console.log(message)

            const input = yield* F.pipe(
                Match.value(type),
                Match.when("singleLine", () => singleLinePrompt),
                Match.when("multiLine", () => multiLinePrompt),
                Match.exhaustive,
            )
            const validated = yield* F.pipe(validate(input), Effect.either)

            if (E.isRight(validated)) return validated.right

            yield* Console.error(red(validated.left))
        }
    })

const singleLinePrompt = Effect.gen(function* () {
    const rl = NodeReadline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: "> ",
    })
    rl.prompt()
    return yield* Effect.async<string>((resume) => {
        rl.once("line", (line) => {
            rl.close()
            resume(Effect.succeed(line))
        })
        rl.once("SIGINT", () => {
            rl.close()
            resume(Effect.interrupt)
        })
        rl.once("error", (err) => {
            rl.close()
            resume(Effect.die(err))
        })
        return Effect.sync(() => rl.close())
    })
})

// DOCS: https://nodejs.org/api/readline.html#example-read-file-stream-line-by-line
const multiLinePrompt = Effect.gen(function* () {
    const rl = NodeReadline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: "",
    })
    yield* Console.log(bold("[i] Multiline prompt: CTRL+D on empty line to close>"))

    return yield* Effect.async<string>((resume) => {
        const lines: string[] = []
        rl.on("line", (line) => lines.push(line))
        rl.once("close", () => resume(Effect.succeed(lines.join("\n"))))
        rl.once("SIGINT", () => {
            rl.close()
            resume(Effect.interrupt)
        })
        rl.once("error", (err) => {
            rl.close()
            resume(Effect.die(err))
        })
        return Effect.sync(() => rl.close())
    })
})

const bold = (text: string) => Doc.text(text).pipe(Doc.annotate(Ansi.bold), Doc.render({ style: "pretty" }))
const red = (text: string) => Doc.text(text).pipe(Doc.annotate(Ansi.red), Doc.render({ style: "pretty" }))

const main = () => {
    const arg = process.argv[2]
    if (arg !== "singleLine" && arg !== "multiLine") {
        console.error("Usage: text-prompt <singleLine|multiLine>")
        process.exit(1)
    }

    const program = textPrompt({
        type: arg,
        message: "Enter your name",
        validate: (input) => (input.length > 0 ? Effect.succeed(input) : Effect.fail("Name cannot be empty")),
    }).pipe(Effect.tap((x) => Console.info(`\n--- You entered ---\n${x}`)))

    NodeRuntime.runMain(program.pipe(Effect.provide(NodeContext.layer)))
}

main()
