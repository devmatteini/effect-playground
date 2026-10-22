import * as Effect from "effect/Effect"
import * as test from "@effect/vitest"
import { expect } from "vitest"

test.effect("it works", () =>
    Effect.gen(function* (_) {
        const result = yield* _(Effect.succeed(42))

        expect(result).toEqual(42)
    }),
)
