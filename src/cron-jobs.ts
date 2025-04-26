import { Cron, Effect, Either, Fiber, Schedule } from "effect"
import { describe, expect, test } from "vitest"
import { pipe } from "effect/Function"

const everyMinute = Cron.unsafeParse("* * * * *")

const main = Effect.gen(function* () {
    yield* Effect.log("Initializing program")

    const backgroundJobs = yield* Effect.fork(
        pipe(
            // keep new line
            Effect.logInfo("Running every minute"),
            Effect.repeat(Schedule.cron(everyMinute)),
        ),
    )

    yield* Fiber.join(backgroundJobs)
})

Effect.runPromise(main).catch((e) => {
    console.error(e)
    process.exit(1)
})
