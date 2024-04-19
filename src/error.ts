import * as Effect from "effect/Effect"
import * as F from "effect/Function"
import * as O from "effect/Option"
import { match } from "ts-pattern"
import * as Match from "effect/Match"

type CustomError = {
    readonly _tag: "CustomError"
    readonly message: string
}

declare const doSomething: Effect.Effect<void, Error | CustomError>

const tsPattern = F.pipe(
    doSomething,
    Effect.catchSome((err) => {
        return (
            match(err)
                .with({ _tag: "CustomError" }, (e) => O.some(Effect.logWarning(e.message)))
                //      ^TS2353: Object literal may only specify known properties, and _tag does not exist in type...
                .otherwise(() => O.none())
        )
    }),
)

// Same error using effect/Match
const effectMatch = F.pipe(
    doSomething,
    Effect.catchSome((err) => {
        return F.pipe(
            Match.value(err),
            Match.when({ _tag: "CustomError" }, (e) => O.some(Effect.logWarning(e.message))),
            //           ^TS2353: Object literal may only specify known properties, and _tag does not exist in type...
            Match.orElse(() => O.none()),
        )
    }),
)
