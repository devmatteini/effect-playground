import { expect, test } from "vitest"
import * as S from "effect/Schema"
import * as Arbitrary from "effect/Arbitrary"
import * as FastCheck from "effect/FastCheck"
import * as F from "effect/Function"

const Person = S.Struct({
    name: S.String,
    age: S.String.pipe(S.compose(S.NumberFromString), S.int()),
})

const isPerson = S.is(Person)

const PersonArbitraryType = Arbitrary.make(Person)
test("generate arbitrary Schema.Type", () => {
    const result = FastCheck.sample(PersonArbitraryType, 1)

    expect(result).toHaveLength(1)
    expect(isPerson(result[0])).toBeTruthy()
})

const PersonArbitraryEncoded = Arbitrary.make(S.encodedSchema(Person))
test("generate arbitrary Schema.Encoded", () => {
    const result = FastCheck.sample(PersonArbitraryEncoded, 1)

    expect(result).toHaveLength(1)
    expect(result[0]?.age).toBeTypeOf("string")
})

// NOTE: order of `pipe` matters.
// Any filter preceding the customization will be lost, only filters following the customization will be respected.
const PositiveInt = F.pipe(
    // keep new line
    S.Number,
    S.annotations({ arbitrary: () => (fc) => fc.integer() }),
    S.positive(),
)

const isPositiveInt = S.is(PositiveInt)

test("customize arbitrary data", () => {
    const result = FastCheck.sample(Arbitrary.make(PositiveInt), 1)

    expect(result).toHaveLength(1)
    expect(isPositiveInt(result[0])).toBeTruthy()
})
