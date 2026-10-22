import { expect, test } from "vitest"
import * as S from "effect/Schema"

const Person = S.Struct({
    name: S.String,
    age: S.NumberFromString,
})

const PersonEquivalence = S.equivalence(Person)

test("same person", () => {
    const john = { name: "John", age: 23 }

    const result = PersonEquivalence(john, john)

    expect(result).toBeTruthy()
})

test("different persons", () => {
    const john = { name: "John", age: 23 }
    const alice = { name: "Alice", age: 30 }

    const result = PersonEquivalence(john, alice)

    expect(result).toBeFalsy()
})

const Floor = S.String.annotations({
    equivalence: () => (a, b) => a.at(0) === b.at(0),
})
const FloorEquivalence = S.equivalence(Floor)

test("custom equivalence", () => {
    const firstFloorSectionA = "1A"
    const firstFloorB = "1B"

    const result = FloorEquivalence(firstFloorSectionA, firstFloorB)

    expect(result).toBeTruthy()
})
