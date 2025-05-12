import { expect, test } from "vitest"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"

const User = Schema.Struct({
    Id: Schema.String,
    Token: Schema.Redacted(Schema.String),
})

const encodeUser = Schema.encodeSync(User)
const decodeUser = Schema.decodeUnknownSync(User)

test("secret to string", () => {
    const user = User.make({
        Id: "123",
        Token: Redacted.make("my-secret"),
    })

    expect(user.Token.toString()).toStrictEqual("<redacted>")
})

test("decode secret", () => {
    const user = decodeUser({
        Id: "123",
        Token: "my-secret",
    })

    expect(user).toStrictEqual(
        User.make({
            Id: "123",
            Token: Redacted.make("my-secret"),
        }),
    )
})

test("encode secret", () => {
    const user = User.make({
        Id: "123",
        Token: Redacted.make("my-secret"),
    })

    expect(encodeUser(user)).toStrictEqual({
        Id: "123",
        Token: "my-secret",
    })
})
