import * as RequestResolver from "effect/RequestResolver"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Request from "effect/Request"
import * as F from "effect/Function"
import * as Context from "effect/Context"

type InsertManyResult = {
    insertedIds: string[]
}

export type Model = {
    id: string
    name: string
}

export type RepositoryService = {
    insertMany: (items: Model[]) => Effect.Effect<InsertManyResult>
}

export class Repository extends Context.Tag("Repository")<Repository, RepositoryService>() {}

class SaveModelRequest extends Request.TaggedClass("SaveModelRequest")<void, never, { model: Model }> {}

const saveModel = (model: Model) =>
    Effect.request(
        // keep new line
        new SaveModelRequest({ model }),
        SaveModelResolver.pipe(RequestResolver.contextFromServices(Repository)),
    )

const SaveModelResolver = RequestResolver.makeBatched((requests: Array.NonEmptyArray<SaveModelRequest>) =>
    Effect.gen(function* () {
        const repository = yield* Repository
        const response = yield* repository.insertMany(requests.map((x) => x.model))
        yield* Effect.forEach(requests, succeedIfIdIsIn(response.insertedIds))
    }).pipe(
        // keep new line
        Effect.catchAllCause((error) => Effect.forEach(requests, (request) => Request.failCause(request, error))),
    ),
).pipe(RequestResolver.batchN(5))

const succeedIfIdIsIn = (insertedIds: readonly string[]) => (request: SaveModelRequest) =>
    Request.completeEffect(
        request,
        F.pipe(
            request.model.id,
            Effect.liftPredicate(
                (id) => insertedIds.includes(id),
                () => new Error(`Failed to insert model`),
            ),
            Effect.orDie,
            Effect.asVoid,
        ),
    )

export const saveModels = (models: readonly Model[]) =>
    Effect.gen(function* () {
        yield* Effect.forEach(models, (model) => saveModel(model), { batching: true })
    })
