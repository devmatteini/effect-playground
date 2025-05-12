import { expect, test } from "vitest"
import * as Schema from "effect/Schema"
import * as F from "effect/Function"
import * as Match from "effect/Match"
import * as O from "effect/Option"

const A = Schema.TaggedStruct("A", {
    value: Schema.String,
})

const B = Schema.TaggedStruct("B", {
    id: Schema.String,
    value: Schema.String,
})

const C = Schema.TaggedStruct("C", {
    value: Schema.Number,
})

const ABC = Schema.Union(A, B, C)
type ABC = typeof ABC.Type

test("Match.option", () => {
    const maybeId = F.pipe(
        Match.type<ABC>(),
        Match.tag("B", (x) => x.id),
        Match.option,
    )

    const missingId = maybeId(A.make({ value: "A" }))
    expect(O.isNone(missingId)).toBeTruthy()

    const id = maybeId(B.make({ id: "B1", value: "B" }))
    expectSomeEqual("B1", id)
})

const expectSomeEqual = <A>(expected: A, actual: O.Option<A>) => {
    if (O.isNone(actual)) throw new Error("Expected Some, got None")
    expect(actual.value).toStrictEqual(expected)
}
