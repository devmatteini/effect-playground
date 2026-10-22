import * as Effect from "effect/Effect"
import { expect, test } from "vitest"

test("it works", async () => {
    const result = await Effect.runPromise(Effect.succeed(42))

    expect(result).toEqual(42)
})
