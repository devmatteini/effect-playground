import { expect, test, describe } from "vitest"
import * as S from "@effect/schema/Schema"
import * as Arbitrary from "@effect/schema/Arbitrary"
import * as fc from "fast-check"
import * as F from "effect/Function"

const Person = S.struct({
    name: S.string,
    age: S.string.pipe(S.compose(S.NumberFromString), S.int()),
})

const isPerson = S.is(Person)

const PersonArbitraryType = Arbitrary.make(Person)(fc)
test("generate arbitrary Schema.Type", () => {
    const result = fc.sample(PersonArbitraryType, 1)

    expect(result).toHaveLength(1)
    expect(isPerson(result[0])).toBeTruthy()
})

const PersonArbitraryEncoded = Arbitrary.make(S.encodedSchema(Person))(fc)
test("generate arbitrary Schema.Encoded", () => {
    const result = fc.sample(PersonArbitraryEncoded, 1)

    expect(result).toHaveLength(1)
    expect(result[0].age).toBeTypeOf("string")
})

// NOTE: order of `pipe` matters.
// Any filter preceding the customization will be lost, only filters following the customization will be respected.
const PositiveInt = F.pipe(
    // keep new line
    S.number,
    S.annotations({ arbitrary: () => (fc) => fc.integer() }),
    S.positive(),
)

const isPositiveInt = S.is(PositiveInt)

test("customize arbitrary data", () => {
    const result = fc.sample(Arbitrary.make(PositiveInt)(fc), 1)

    expect(result).toHaveLength(1)
    expect(isPositiveInt(result[0])).toBeTruthy()
})