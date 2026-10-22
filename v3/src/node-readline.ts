import * as readline from "node:readline"
import * as Effect from "effect/Effect"
import * as fs from "node:fs"
import * as Stream from "effect/Stream"
import * as Chunk from "effect/Chunk"
import * as F from "effect/Function"

// DOCS: https://nodejs.org/api/readline.html#example-read-file-stream-line-by-line
const readLines = (rl: readline.Interface) =>
    F.pipe(
        Stream.fromAsyncIterable(rl, (e) => new Error(`Error iterating readline interface: ${e}`)),
        Stream.runCollect,
        Effect.map((lines) => Chunk.join(lines, "\n")),
        Effect.orDie,
    )

const main = Effect.gen(function* (_) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: "Write multiline value (CTRL+D on empty line to close, otherwise use CTRL+C)>\n",
    })

    yield* _(Effect.sync(() => rl.prompt()))

    const value = yield* _(readLines(rl))

    console.log("\nRead from STDIN!")
    // console.log(value)
    yield* _(Effect.sync(() => fs.writeFileSync("input.txt", value)))
})

Effect.runPromise(main).catch((e) => {
    console.error(e)
    process.exit(1)
})
