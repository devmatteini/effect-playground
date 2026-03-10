import * as Effect from "effect/Effect"
import * as Context from "effect/Context"
import * as Schema from "effect/Schema"
import * as ParseResult from "effect/ParseResult"
import { TreeFormatter } from "effect/ParseResult"
import crypto from "node:crypto"
import { expect, test } from "vitest"
import * as Layer from "effect/Layer"
import * as Data from "effect/Data"

type DataKey = {
    plainText: Buffer
    encrypted: Buffer
}

class KeyManager extends Context.Tag("KeyManager")<
    KeyManager,
    {
        generateDataKey: Effect.Effect<DataKey>
        decryptDataKey: (key: Buffer) => Effect.Effect<Buffer>
    }
>() {}

const UserSession = Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    lastName: Schema.String,
    email: Schema.String,
})
type UserSession = typeof UserSession.Type

const UserSessionFromJson = Schema.parseJson(UserSession)
const encodeUserSession = Schema.encode(UserSessionFromJson)
const decodeUserSession = Schema.decode(UserSessionFromJson)

const EncryptedPayload = Schema.Struct({
    encryptedKey: Schema.String,
    iv: Schema.String,
    authTag: Schema.String,
    encryptedData: Schema.String,
})
type EncryptedPayload = typeof EncryptedPayload.Type

const EncryptedPayloadFromJson = Schema.parseJson(EncryptedPayload)

class CryptoError extends Data.TaggedError("CryptoError")<{
    cause?: unknown
}> {
    toString(): string {
        return `CryptoError: ${this.cause instanceof Error ? this.cause.toString() : String(this.cause)}`
    }
}

const useCrypto = <A>(f: () => A) =>
    Effect.try({
        try: () => f(),
        catch: (cause) => new CryptoError({ cause }),
    })

const EncryptedUserSession = Schema.transformOrFail(
    // keep new line
    EncryptedPayloadFromJson,
    UserSession,
    {
        encode: (userSession) =>
            Effect.gen(function* () {
                const keyManager = yield* KeyManager

                const dataKey = yield* keyManager.generateDataKey

                const iv = crypto.randomBytes(12)
                const cipher = yield* useCrypto(() => crypto.createCipheriv("aes-256-gcm", dataKey.plainText, iv))

                const payload = yield* encodeUserSession(userSession)
                const encryptedData = yield* useCrypto(() =>
                    Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]),
                )
                const authTag = cipher.getAuthTag()

                return {
                    encryptedKey: dataKey.encrypted.toString("base64"),
                    iv: iv.toString("base64"),
                    authTag: authTag.toString("base64"),
                    encryptedData: encryptedData.toString("base64"),
                }
            }).pipe(
                Effect.catchTag("CryptoError", (e) => Effect.fail(new ParseResult.Unexpected(undefined, e.toString()))),
                Effect.catchTag("ParseError", (e) =>
                    Effect.fail(new ParseResult.Unexpected(undefined, TreeFormatter.formatErrorSync(e))),
                ),
            ),
        decode: (input) =>
            Effect.gen(function* () {
                const keyManager = yield* KeyManager

                const encryptedPayload = Buffer.from(input.encryptedData, "base64")
                const encryptedDataKey = Buffer.from(input.encryptedKey, "base64")
                const iv = Buffer.from(input.iv, "base64")
                const authTag = Buffer.from(input.authTag, "base64")

                const decryptKey = yield* keyManager.decryptDataKey(encryptedDataKey)

                const decipher = yield* useCrypto(() => crypto.createDecipheriv("aes-256-gcm", decryptKey, iv))

                yield* useCrypto(() => decipher.setAuthTag(authTag))

                const decrypted = yield* useCrypto(() =>
                    Buffer.concat([decipher.update(encryptedPayload), decipher.final()]),
                )
                const payload = decrypted.toString("utf8")

                return yield* decodeUserSession(payload)
            }).pipe(
                Effect.catchTag("CryptoError", (e) => Effect.fail(new ParseResult.Unexpected(undefined, e.toString()))),
                Effect.catchTag("ParseError", (e) =>
                    Effect.fail(new ParseResult.Unexpected(undefined, TreeFormatter.formatErrorSync(e))),
                ),
            ),
    },
)
type EncryptedUserSession = typeof EncryptedUserSession.Type
type EncryptedUserSessionEncoded = typeof EncryptedUserSession.Encoded

const encode = Schema.encode(EncryptedUserSession)
const decode = Schema.decode(EncryptedUserSession)

// ------------ TEST ------------

test("encode and decode user session", async () => {
    const program = encode(testUserSession).pipe(Effect.flatMap(decode), Effect.provide(InMemoryKeyManagerTest))

    const result = await Effect.runPromise(program)

    expect(result).toEqual(testUserSession)
})

const testUserSession = UserSession.make({
    id: "123",
    name: "John",
    lastName: "Doe",
    email: "info@example.com",
})

const STATIC_CUSTOMER_MASTER_KEY = Buffer.from("static-customer-master-key-tests")

const InMemoryKeyManagerTest = Layer.succeed(KeyManager, {
    generateDataKey: Effect.sync(() => {
        const dataKey = crypto.randomBytes(32)
        const iv = crypto.randomBytes(12)
        const cipher = crypto.createCipheriv("aes-256-gcm", STATIC_CUSTOMER_MASTER_KEY, iv)
        const encrypted = Buffer.concat([cipher.update(dataKey), cipher.final()])
        const authTag = cipher.getAuthTag()
        const ciphertextBlob = Buffer.concat([iv, authTag, encrypted])
        return { plainText: dataKey, encrypted: ciphertextBlob }
    }),
    decryptDataKey: (ciphertextBlob) =>
        Effect.sync(() => {
            const iv = ciphertextBlob.subarray(0, 12)
            const authTag = ciphertextBlob.subarray(12, 28)
            const encrypted = ciphertextBlob.subarray(28)
            const decipher = crypto.createDecipheriv("aes-256-gcm", STATIC_CUSTOMER_MASTER_KEY, iv)
            decipher.setAuthTag(authTag)
            return Buffer.concat([decipher.update(encrypted), decipher.final()])
        }),
})
