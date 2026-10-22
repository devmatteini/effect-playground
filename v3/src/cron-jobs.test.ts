import { Cron, Either } from "effect"
import { describe, expect, test } from "vitest"

test("valid unix cron", () => {
    const cron = Cron.parse("0 10 * * 1,3")

    expect(Either.isRight(cron)).toBeTruthy()
})

describe("monday and wednesday at 10", () => {
    test.each(["2025-04-21T10:00:00.000Z", "2025-04-23T10:00:00.000Z"])("valid match %s", (date) => {
        const cron = Cron.unsafeParse("0 10 * * 1,3", "UTC")

        const today = new Date(date)

        expect(Cron.match(cron, today)).toBeTruthy()
    })

    test.each(["2025-04-21T11:00:00.000Z", "2025-04-22T10:00:00.000Z"])("invalid match %s", (date) => {
        const cron = Cron.unsafeParse("0 10 * * 1,3", "UTC")

        const today = new Date(date)

        expect(Cron.match(cron, today)).toBeFalsy()
    })
})
