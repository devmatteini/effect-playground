import { expect, test } from "vitest"
import { Duration, Effect } from "effect"

const delay = (timeout: Duration.DurationInput) => Effect.succeed("EXECUTED").pipe(Effect.delay(timeout))

const timeout = Effect.succeed("TIMEOUT" as const).pipe(Effect.delay("50 millis"))
const withTimeout50ms = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.race(effect, timeout)

test("timeout", async () => {
    const program = delay("60 millis").pipe(withTimeout50ms)

    const result = await Effect.runPromise(program)

    expect(result).toEqual("TIMEOUT")
})

test("program executes quickly", async () => {
    const program = withTimeout50ms(delay("30 millis"))

    const result = await Effect.runPromise(program)

    expect(result).toEqual("EXECUTED")
})

test("program ends same time as timeout", async () => {
    const program = withTimeout50ms(delay("60 millis"))

    const result = await Effect.runPromise(program)

    expect(result).toEqual("TIMEOUT")
})

test("concurrency - programs execute quickly", async () => {
    const program = Effect.all(
        [
            // keep new line
            withTimeout50ms(delay("20 millis")),
            withTimeout50ms(delay("30 millis")),
        ],
        { concurrency: 2 },
    )

    const result = await Effect.runPromise(program)

    expect(result).toEqual(["EXECUTED", "EXECUTED"])
})

test("concurrent - one program timeout, one execute quickly", async () => {
    const program = Effect.all(
        [
            // keep new line
            withTimeout50ms(delay("70 millis")),
            withTimeout50ms(delay("30 millis")),
        ],
        { concurrency: 2 },
    )

    const result = await Effect.runPromise(program)

    expect(result).toEqual(["TIMEOUT", "EXECUTED"])
})

test("concurrent - both program timeout", async () => {
    const program = Effect.all(
        [
            // keep new line
            withTimeout50ms(delay("63 millis")),
            withTimeout50ms(delay("55 millis")),
        ],
        { concurrency: 2 },
    )

    const result = await Effect.runPromise(program)

    expect(result).toEqual(["TIMEOUT", "TIMEOUT"])
})
