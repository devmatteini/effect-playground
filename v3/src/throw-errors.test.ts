import { expect, test } from "vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as F from "effect/Function"

test("throw error inside Effect.gen", () => {
    const program = Effect.gen(function* (_) {
        throw new Error("Error inside Effect.gen")
        return 1
    })

    const result = Effect.runSyncExit(program)

    expectFailureContains("Error inside Effect.gen", result)
})

test("throw error Effect pipeline", () => {
    const program = F.pipe(
        Effect.succeed(1),
        Effect.map((x) => {
            throw new Error("Error inside Effect pipe")
            return x + 1
        }),
    )

    const result = Effect.runSyncExit(program)

    expectFailureContains("Error inside Effect pipe", result)
})

const expectFailureContains = <A, E>(expected: string, actual: Exit.Exit<A, E>) => {
    if (Exit.isSuccess(actual)) throw new Error(`Expected Failure, got Success ${actual.value}`)
    expect(actual.cause.toString()).toMatch(expected)
}
