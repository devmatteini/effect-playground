import * as F from "effect/Function"
import * as Effect from "effect/Effect"
import * as Context from "effect/Context"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import * as Config from "effect/Config"
import * as LogLevel from "effect/LogLevel"
import * as Exit from "effect/Exit"
import * as Cause from "effect/Cause"

const customLogger = Logger.make(({ logLevel, message }) => {
    console.log(`[${logLevel.label}] ${message}`)
})

type Deps = { name: string }
const Deps = Context.GenericTag<Deps>("Deps")

const greet = Effect.map(Deps, ({ name }) => `Hello${name}`)

type Suffix = { suffix: string }
const Suffix = Context.GenericTag<Suffix>("Suffix")
const SuffixLive = Layer.succeed(Suffix, { suffix: "!" })

type Prefix = { prefix: string }
const Prefix = Context.GenericTag<Prefix>("Prefix")
const PrefixLive = Layer.effect(
    Prefix,
    Effect.map(Config.string("PREFIX"), (x) => Prefix.of({ prefix: x })),
)

const DepsLive = Layer.effect(
    Deps,
    F.pipe(
        Effect.logInfo("DepsLive init"),
        Effect.flatMap(() =>
            Effect.all({
                prefix: Effect.map(Prefix, (x) => x.prefix),
                suffix: Effect.map(Suffix, (x) => x.suffix),
                name: Config.string("NAME"),
            }),
        ),
        Effect.map(({ name, prefix, suffix }) => Deps.of({ name: `${prefix}${name}${suffix}` })),
    ),
)

const main = async (): Promise<void> => {
    const result = await F.pipe(
        greet,
        Effect.tap((message) => Effect.logInfo(message)),
        Effect.asVoid,
        Effect.provide(
            F.pipe(
                DepsLive,
                Layer.provide(PrefixLive),
                Layer.provide(SuffixLive),
                Layer.provideMerge(Logger.replace(Logger.defaultLogger, customLogger)),
            ),
        ),
        Logger.withMinimumLogLevel(LogLevel.Debug),
        Effect.runPromiseExit,
    )

    if (Exit.isFailure(result)) {
        console.error(`[APP_ERROR] ${Cause.pretty(result.cause)}`)
        throw new Error("AppError")
    }
}

main().catch(() => {
    process.exit(1)
})
