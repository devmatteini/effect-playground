import { expect, test, describe } from "vitest"
import * as S from "effect/Schema"
import * as AST from "effect/SchemaAST"
import * as Effect from "effect/Effect"
import * as EV from "@effect/vitest"
import * as E from "effect/Either"

const Person = S.Struct({
    name: S.String,
    age: S.Number,
})

const isPerson = S.is(Person)

test("is person", () => {
    expect(isPerson({ name: "Alice", age: 30 })).toBeTruthy()
    expect(isPerson({ name: "Alice", age: "30" })).toBeFalsy()
    expect(isPerson(null)).toBeFalsy()
})

// Typescript `asserts` keyword: https://stackoverflow.com/questions/71624824/what-does-the-typescript-asserts-operator-do
const assertsPerson = S.asserts(Person)

test("asserts", () => {
    expect(() => assertsPerson({ name: "Alice", age: 30 })).not.toThrowError()
    expect(() => assertsPerson({ name: "Alice", age: "30" })).toThrowError()
    expect(() => assertsPerson(null)).toThrowError()
})
