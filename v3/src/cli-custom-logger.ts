import * as Effect from "effect/Effect"
import * as F from "effect/Function"
import * as Config from "effect/Config"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import { Command } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"

const cliName = "cli-custom-logger"

const rootCommand = Command.make(cliName, {}, () =>
    Effect.gen(function* (_) {
        const fakeError = yield* _(Config.boolean("FAKE_ERROR"), Config.withDefault(false))

        yield* _(Effect.logInfo("Processing..."))
        if (fakeError) return yield* _(Effect.fail("Fake error occurred!"))
        yield* _(Effect.sleep("2 seconds"))
        yield* _(Effect.logInfo("Finished!"))
    }),
)

const cli = Command.run(rootCommand, {
    name: cliName,
    version: "v1.0.0",
})

const customLogger = Logger.make(({ logLevel, message }) => {
    globalThis.console.log(`[${logLevel.label}] ${message}`)
})

const LoggerLive = Logger.replace(Logger.defaultLogger, customLogger)
const MainLive = F.pipe(NodeContext.layer, Layer.provideMerge(LoggerLive))

F.pipe(
    Effect.suspend(() => cli(process.argv)),
    Effect.provide(MainLive),
    NodeRuntime.runMain,
)
