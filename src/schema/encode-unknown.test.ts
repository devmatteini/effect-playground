import { expect, test } from "vitest"
import * as Schema from "effect/Schema"

const Person = Schema.Struct({
    name: Schema.String,
    age: Schema.NumberFromString,
})

const MyObject = Schema.Struct({
    id: Schema.String,
    data: Schema.Unknown,
})

const encodeMyObject = Schema.encodeSync(MyObject)

test("encode unknown primitive", () => {
    const encoded = encodeMyObject(MyObject.make({ id: "123", data: "Hello, World!" }))

    expect(encoded).toEqual({ id: "123", data: "Hello, World!" })
})

test("encode unknown object", () => {
    const encoded = encodeMyObject(MyObject.make({ id: "123", data: Person.make({ name: "john", age: 10 }) }))

    expect(encoded).toEqual({ id: "123", data: { name: "john", age: 10 } })
})
