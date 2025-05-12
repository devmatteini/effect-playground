import { expect, test, vitest } from "vitest"
import { Model, Repository, RepositoryError, RepositoryService, saveModels } from "./model-request-error"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as F from "effect/Function"
import * as Exit from "effect/Exit"

test("batched requests", async () => {
    const insertMany = vitest.fn(insertAllModels)

    const models = [model("1", "ragnar"), model("2", "bjorn"), model("3", "ivar")]

    const program = saveModels(models)

    await F.pipe(
        // keep new line
        program,
        Effect.provide(RepositoryTest({ insertMany })),
        Effect.runPromise,
    )

    expect(insertMany).toHaveBeenCalledExactlyOnceWith(models)
})

test("batched requests fails to insert batch with defect", { timeout: 1000 }, async () => {
    const insertMany = vitest.fn(() => Effect.dieMessage("Failed to insert batch"))

    const models = [model("1", "ragnar"), model("2", "bjorn"), model("3", "ivar")]

    const program = saveModels(models)

    const result = await F.pipe(
        // keep new line
        program,
        Effect.provide(RepositoryTest({ insertMany })),
        Effect.runPromiseExit,
    )

    expect(insertMany).toHaveBeenCalledExactlyOnceWith(models)
    expect(Exit.isFailure(result)).toBeTruthy()
    expect(result.toString()).toMatch("Failed to insert batch")
})

test("batched requests fails to insert batch with expected errors", { timeout: 1000 }, async () => {
    const insertMany = vitest.fn(() => Effect.fail(new RepositoryError({ message: "duplicate key error" })))

    const models = [model("1", "ragnar"), model("2", "bjorn"), model("3", "ivar")]

    const program = saveModels(models)

    const result = await F.pipe(
        // keep new line
        program,
        Effect.provide(RepositoryTest({ insertMany })),
        Effect.runPromiseExit,
    )

    expect(insertMany).toHaveBeenCalledExactlyOnceWith(models)
    expect(Exit.isFailure(result)).toBeTruthy()
    expect(result.toString()).toMatch("duplicate key error")
})

const insertAllModels = (values: Model[]) => Effect.succeed({ insertedIds: values.map((x) => x.id) })

const RepositoryTest = ({ insertMany }: RepositoryService) =>
    Layer.succeed(Repository, {
        insertMany: insertMany,
    })

const model = (id: string, name: string) => ({ id, name })
