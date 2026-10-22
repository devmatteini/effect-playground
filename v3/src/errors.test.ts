import { expect, test } from "vitest"
import { NoSuchElementException, RuntimeException, UnknownException } from "effect/Cause"
import * as Data from "effect/Data"

class MyCustomError extends Data.TaggedError("MyCustomError")<{
    id: string
}> {}

interface HandmadeError {
    readonly _tag: "HandmadeError"
    readonly id: string
}
const HandmadeError = Data.tagged<HandmadeError>("HandmadeError")

test("Effect errors extends native Error", () => {
    expect(new NoSuchElementException()).toBeInstanceOf(Error)
    expect(new RuntimeException()).toBeInstanceOf(Error)
    expect(new UnknownException("any")).toBeInstanceOf(Error)
    expect(new MyCustomError({ id: "1234" })).toBeInstanceOf(Error)
})

test("Data.tagged NOT extends native Error", () => {
    expect(HandmadeError({ id: "1234" })).not.toBeInstanceOf(Error)
})
