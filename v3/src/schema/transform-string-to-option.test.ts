import * as Schema from "effect/Schema"
import * as O from "effect/Option"
import { expect, test } from "vitest"

const INVALID_ID = "999" as const

const Id = Schema.transform(
    // keep new line
    Schema.NullishOr(Schema.String),
    Schema.OptionFromSelf(Schema.NonEmptyString),
    {
        strict: true,
        decode: (input) => {
            if (!input || input === INVALID_ID) return O.none()
            return O.some(input)
        },
        encode: (input) => O.getOrNull(input),
    },
)
type Id = typeof Id.Type
type IdEncoded = typeof Id.Encoded

const Response = Schema.Struct({
    id: Id,
})
type Response = typeof Response.Type
type ResponseEncoded = typeof Response.Encoded

const decode = Schema.decodeUnknownSync(Response)

test("response with id", () => {
    const result = decode({ id: "123" })

    expect(result).toEqual({ id: O.some("123") })
})

test.each([null, undefined, "", INVALID_ID])("response with invalid/missing id %o", (input) => {
    const result = decode({ id: input })

    expect(result).toEqual({ id: O.none() })
})

test("response without id field", () => {
    const result = decode({})

    expect(result).toEqual({ id: O.none() })
})
