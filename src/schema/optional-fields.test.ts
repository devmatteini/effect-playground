import { expect, test } from "vitest"
import * as Schema from "effect/Schema"

const Address = Schema.Struct({
    city: Schema.String,
})

const Order = Schema.Struct({
    billingAddress: Schema.optional(Address),
})

const encode = Schema.encodeSync(Order)

test("encode optional prop with value", () => {
    const encoded = encode(Order.make({ billingAddress: { city: "firenze" } }))
    expect(encoded).toEqual({ billingAddress: { city: "firenze" } })
})

test("encode optional prop is not set", () => {
    const encoded = encode(Order.make({}))
    expect(encoded).toEqual({})
})

test("encode optional prop is undefined", () => {
    const encoded = encode(Order.make({ billingAddress: undefined }))
    expect(encoded).toEqual({})
})
