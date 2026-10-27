import * as Effect from "effect/Effect"

let running = 0
let maxRunning = 0

const doSomething = (x: string) =>
    Effect.gen(function* () {
        running++
        maxRunning = Math.max(maxRunning, running)
        yield* Effect.log(`Doing ${x} (running: ${running})`)
        yield* Effect.sleep("50 millis")
        running--
    })
const child = (x: string[]) => Effect.forEach(x, doSomething, { concurrency: "inherit" })
const parent = Effect.forEach([1, 2, 3, 4, 5], (x) => child([`${x}-1`, `${x}-2`, `${x}-3`]), { concurrency: "inherit" })

parent.pipe(
    Effect.withConcurrency(5),
    Effect.andThen(() => Effect.log(`Max running: ${maxRunning}`)),
    Effect.runPromise,
)
