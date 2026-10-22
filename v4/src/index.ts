import * as Effect from "effect/Effect"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"

const program = Effect.log("Hello Effect v4")

NodeRuntime.runMain(program)
