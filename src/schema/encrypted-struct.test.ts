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
    keyId: string
}

class KeyVault extends Context.Tag("KeyVault")<
    KeyVault,
    {
        generateDataKey: Effect.Effect<DataKey, KeyVaultError>
        decryptDataKey: (key: Buffer, keyId: string) => Effect.Effect<Buffer, KeyVaultError>
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

const EncryptedPayload = Schema.TaggedStruct("AES_256_GCM", {
    encryptedKey: Schema.String,
    iv: Schema.String,
    authTag: Schema.String,
    keyId: Schema.String,
    encryptedData: Schema.String,
})
type EncryptedPayload = typeof EncryptedPayload.Type

const EncryptedPayloadFromJson = Schema.parseJson(EncryptedPayload)

class KeyVaultError extends Data.TaggedError("KeyVaultError")<{
    cause?: unknown
}> {
    toString(): string {
        return `KeyVaultError: ${this.cause instanceof Error ? this.cause.toString() : String(this.cause)}`
    }
}

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
        strict: true,
        encode: (userSession) =>
            Effect.gen(function* () {
                const keyVault = yield* KeyVault

                const dataKey = yield* keyVault.generateDataKey
                const payload = yield* encodeUserSession(userSession)

                const { iv, encryptedData, authTag } = yield* useCrypto(() => {
                    const iv = crypto.randomBytes(12)
                    const cipher = crypto.createCipheriv("aes-256-gcm", dataKey.plainText, iv)
                    const encryptedData = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()])
                    const authTag = cipher.getAuthTag()
                    return { iv, encryptedData, authTag }
                })

                return EncryptedPayload.make({
                    encryptedKey: dataKey.encrypted.toString("base64"),
                    keyId: dataKey.keyId,
                    iv: iv.toString("base64"),
                    authTag: authTag.toString("base64"),
                    encryptedData: encryptedData.toString("base64"),
                })
            }).pipe(
                Effect.catchTag("KeyVaultError", (e) =>
                    Effect.fail(new ParseResult.Unexpected(undefined, e.toString())),
                ),
                Effect.catchTag("CryptoError", (e) => Effect.fail(new ParseResult.Unexpected(undefined, e.toString()))),
                Effect.catchTag("ParseError", (e) =>
                    Effect.fail(new ParseResult.Unexpected(undefined, TreeFormatter.formatErrorSync(e))),
                ),
            ),
        decode: (input) =>
            Effect.gen(function* () {
                const keyVault = yield* KeyVault

                const encryptedPayload = Buffer.from(input.encryptedData, "base64")
                const encryptedDataKey = Buffer.from(input.encryptedKey, "base64")
                const iv = Buffer.from(input.iv, "base64")
                const authTag = Buffer.from(input.authTag, "base64")

                const decryptKey = yield* keyVault.decryptDataKey(encryptedDataKey, input.keyId)

                const decrypted = yield* useCrypto(() => {
                    const decipher = crypto.createDecipheriv("aes-256-gcm", decryptKey, iv)
                    decipher.setAuthTag(authTag)
                    return Buffer.concat([decipher.update(encryptedPayload), decipher.final()])
                })
                const payload = decrypted.toString("utf8")

                return yield* decodeUserSession(payload)
            }).pipe(
                Effect.catchTag("KeyVaultError", (e) =>
                    Effect.fail(new ParseResult.Unexpected(undefined, e.toString())),
                ),
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
    const program = encode(testUserSession).pipe(Effect.flatMap(decode), Effect.provide(InMemoryKeyVaultTest))

    const result = await Effect.runPromise(program)

    expect(result).toEqual(testUserSession)
})

const testUserSession = UserSession.make({
    id: "123",
    name: "John",
    lastName: "Doe",
    email: "info@example.com",
})

const FIRST_CUSTOMER_MASTER_KEY = "static-customer-master-key-tests"
const FIRST_KEY = "FIRST_KEY"

const masterKeys = {
    [FIRST_KEY]: FIRST_CUSTOMER_MASTER_KEY,
} as const
type MasterKey = keyof typeof masterKeys

const useKeyVault = <A>(f: () => A) =>
    Effect.try({
        try: () => f(),
        catch: (cause) => new KeyVaultError({ cause }),
    })

const InMemoryKeyVaultTest = Layer.succeed(KeyVault, {
    generateDataKey: useKeyVault(() => {
        const latestKey = FIRST_KEY
        const dataKey = crypto.randomBytes(32)
        const iv = crypto.randomBytes(12)
        const cipher = crypto.createCipheriv("aes-256-gcm", masterKeys[latestKey], iv)
        const encrypted = Buffer.concat([cipher.update(dataKey), cipher.final()])
        const authTag = cipher.getAuthTag()
        const ciphertextBlob = Buffer.concat([iv, authTag, encrypted])
        return { plainText: dataKey, encrypted: ciphertextBlob, keyId: latestKey }
    }),
    decryptDataKey: (ciphertextBlob, keyId) =>
        useKeyVault(() => {
            const iv = ciphertextBlob.subarray(0, 12)
            const authTag = ciphertextBlob.subarray(12, 28)
            const encrypted = ciphertextBlob.subarray(28)
            const kek = masterKeys[keyId as MasterKey]
            if (!kek) throw new Error(`Cannot find master key for ${keyId}`)
            const decipher = crypto.createDecipheriv("aes-256-gcm", kek, iv)
            decipher.setAuthTag(authTag)
            return Buffer.concat([decipher.update(encrypted), decipher.final()])
        }),
})
