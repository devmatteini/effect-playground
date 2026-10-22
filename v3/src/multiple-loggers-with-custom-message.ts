import * as Logger from "effect/Logger"
import * as Match from "effect/Match"
import * as F from "effect/Function"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as Effect from "effect/Effect"
import * as FiberRef from "effect/FiberRef"
import * as FiberRefs from "effect/FiberRefs"

const __error = "__error" as const

type LogMeta = Record<string, unknown>
const logMetaRef = FiberRef.unsafeMake<LogMeta>({})
const logMeta = (context: FiberRefs.FiberRefs) => FiberRefs.getOrDefault(context, logMetaRef)

const Log = {
    debug: (message: string, data: LogMeta = {}) => F.pipe(Effect.logDebug(message), Effect.locally(logMetaRef, data)),
    info: (message: string, data: LogMeta = {}) => F.pipe(Effect.logInfo(message), Effect.locally(logMetaRef, data)),
    warning: (message: string, data: LogMeta = {}) =>
        F.pipe(Effect.logWarning(message), Effect.locally(logMetaRef, data)),
    error: (message: string, data: LogMeta = {}, error?: Error) =>
        F.pipe(Effect.logError(message), Effect.locally(logMetaRef, { ...data, [__error]: error })),
}

type CustomMessage = { message: string; [__error]?: Error } & Record<string, unknown>

const toJSON = (meta: Record<string, unknown>) => {
    try {
        return JSON.parse(JSON.stringify(meta))
    } catch {
        return {
            logMeta: "ERROR: cannot serialize log metadata",
        }
    }
}
const formatError = (error?: Error) => {
    if (!error) return {}
    return {
        errorName: error.name,
        errorMessage: error.message,
        errorStackTrace: error.stack,
    }
}

const unknownToCustomMessage = Logger.mapInputOptions<CustomMessage, unknown>((options) => {
    const meta = logMeta(options.context)
    const { [__error]: error, ...params } = meta

    return {
        ...options,
        message: {
            message: `${options.message}`,
            ...(error && error instanceof Error ? { [__error]: error } : {}),
            ...toJSON(params),
        },
    }
})

const obfuscateMessage = Logger.mapInput<CustomMessage, CustomMessage>((message) => ({
    ...message,
    ...(message["firstName"] ? { firstName: "****" } : {}),
    ...(message["lastName"] ? { lastName: "****" } : {}),
}))

// When mapping logger input you should read the pipeline bottom up
// 1. mapInputOptions unknownToCustomMessage: unknown message is processed into CustomMessage
// 2. mapInput obfuscateMessage: CustomMessage -> CustomMessage, no type changes, only at value level
// 3. The custom logger can finally use the CustomMessage in the implementation of Logger.make

const ConsoleLogger = Logger.make<CustomMessage, void>(({ logLevel, message }) => {
    const { [__error]: error, ...rest } = message
    const output = { ...rest, ...formatError(error) }

    F.pipe(
        Match.value(logLevel),
        Match.tag("Debug", "Trace", () => console.debug(output)),
        Match.tag("Info", () => console.debug(output)),
        Match.tag("Warning", () => console.debug(output)),
        Match.tag("Error", "Fatal", () => console.error(output)),
        Match.tag("All", "None", F.constVoid),
        Match.exhaustive,
    )
})

const externalServiceLogs: unknown[] = []
const externalService = {
    debug: (message: string, ...args: any[]) => {
        externalServiceLogs.push({ logLevel: "debug", message, args })
    },
    info: (message: string, ...args: any[]) => {
        externalServiceLogs.push({ logLevel: "info", message, args })
    },
    warn: (message: string, ...args: any[]) => {
        externalServiceLogs.push({ logLevel: "warn", message, args })
    },
    error: (message: string, error?: Error, ...args: any[]) => {
        externalServiceLogs.push({ logLevel: "error", message, args, error })
    },
}

const ExternalServiceLogger = Logger.make<CustomMessage, void>((options) => {
    const { [__error]: error, message, ...params } = options.message

    F.pipe(
        Match.value(options.logLevel),
        Match.tag("Debug", "Trace", () => externalService.debug(message, params)),
        Match.tag("Info", () => externalService.info(message, params)),
        Match.tag("Warning", () => externalService.warn(message, params)),
        Match.tag("Error", "Fatal", () => externalService.error(message, error, params)),
        Match.tag("All", "None", F.constVoid),
        Match.exhaustive,
    )
})

const program = Effect.gen(function* () {
    yield* Log.debug("Start program")
    yield* Log.info("Processing tasks", { id: "abc2025", code: 12345, firstName: "John", lastName: "Doe" })

    yield* Log.warning("Some warn message with params", { a: "a", b: true, firstName: "Jack" })
    yield* Log.error("Some error message", { code: 6788, type: "TaskFailed" }, new Error("Any error message!!"))

    yield* Log.info("Program finished!")

    console.log("\nExternal service logs dump:")
    console.dir(externalServiceLogs, { depth: 10 })
})

const AppLogger = Logger.zip(ConsoleLogger, ExternalServiceLogger).pipe(obfuscateMessage, unknownToCustomMessage)

const main = F.pipe(program, Effect.provide(Logger.replace(Logger.defaultLogger, AppLogger)))

NodeRuntime.runMain(main, { disableErrorReporting: true, disablePrettyLogger: true })
