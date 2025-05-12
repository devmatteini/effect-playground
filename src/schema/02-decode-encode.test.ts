import { expect, test, describe } from "vitest"
import * as S from "effect/Schema"
import * as AST from "effect/SchemaAST"
import * as Effect from "effect/Effect"
import * as EV from "@effect/vitest"
import * as E from "effect/Either"
import { ParseError } from "effect/ParseResult"

const Person = S.Struct({
    name: S.String,
    age: S.Number,
}).pipe(S.annotations({ identifier: "Person" }))

test("decode either", () => {
    const decode = S.decodeUnknownEither(Person)

    const result = decode({ name: "John", age: 42 })

    expect(result).toEqual(E.right({ name: "John", age: 42 }))
})

test("decode either fails", () => {
    const decode = S.decodeUnknownEither(Person)

    const result = decode({ name: 42, age: "John" })

    expect(E.isLeft(result)).toBeTruthy()
    const error = (result as E.Left<ParseError, never>).left
    expect(error.message).toMatch(/Person/)
    expect(error.message).toMatch(/name/)
    expect(error.message).toMatch(/string/)
    expect(error.message).toMatch(/42/)
})

EV.effect("excess properties are removed", () =>
    Effect.gen(function* (_) {
        const decode = S.decodeUnknown(Person)
        const encode = S.encode(Person)

        const result = yield* _(decode({ name: "John", age: 42, surname: "Doe" }))

        expect(result).toEqual({ name: "John", age: 42 })

        const encoded = yield* _(encode(result))
        expect(encoded).toEqual({ name: "John", age: 42 })
    }),
)

EV.effect("excess properties are preserved", () =>
    Effect.gen(function* (_) {
        const options: AST.ParseOptions = { onExcessProperty: "preserve" }
        const decode = S.decodeUnknown(Person, options)
        const encode = S.encode(Person, options)

        const input = { name: "John", age: 42, surname: "Doe" }

        const result = yield* _(decode(input))
        expect(result).toEqual({ name: "John", age: 42, surname: "Doe" })

        const encoded = yield* _(encode(result))
        expect(encoded).toEqual(input)
    }),
)

describe("encode", () => {
    const Age = S.NumberFromString

    const Person = S.Struct({
        name: S.NonEmptyString,
        age: Age,
    })

    test("encode errors", () => {
        const encode = S.encodeSync(Person)

        expect(() => encode({ name: "", age: 42 })).toThrowError(/NonEmptyString/)
    })
})
