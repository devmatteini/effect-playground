# Request batching in Effect v4 compared to Effect v3

This document explains how request batching works in Effect v4. It compares v4 with Effect v3.
It also gives the points of attention for a migration from v3 to v4.

The language of this document follows ASD-STE100 Simplified Technical English.

## Tests

The tests that show this behavior are in these files:

- v3: [`../v3/src/batching-concurrency.test.ts`](../v3/src/batching-concurrency.test.ts) (effect 3.21.0)
- v4: [`src/batching-concurrency.test.ts`](src/batching-concurrency.test.ts) (effect 4.0.5)

Each test uses the same setup:

- 12 requests, with the ids 1 to 12.
- One resolver with `RequestResolver.batchN(5)`.
- Each resolver call takes 10 ms.
- The test records the ids of each resolver call (a "batch").
- The test records the maximum number of resolver calls that run at the same time ("in flight").
- Some tests record a timeline: `request N` when a request starts, `batch ...` when a resolver call starts.

Some tests do a "read" before each request. The read is a sleep of 20, 40 or 60 ms (`(id % 3 + 1) * 20`).
The read simulates a database query.

## Summary

| Topic                        | v3                                                                   | v4                                                                        |
| ---------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| What enables batching        | `forEach`/`all` with `batching: true`, or `withRequestBatching`      | The resolver. There is no option on `forEach`/`all`.                      |
| When the resolver starts     | When all the items of the `forEach` are done or blocked on a request | When the batch window ends, or when the batch is full (`batchN`)          |
| Which requests go in a batch | All the requests of the `forEach`                                    | The requests that are pending in the same window, from all fibers         |
| Maximum batch size           | `batchN`                                                             | The smaller value of `batchN` and the number of pending requests          |
| `batchN`                     | Splits the collected requests into chunks                            | Limits the batch size, and starts a full batch immediately                |
| Batches of one round         | Run one after the other                                              | Can run in parallel                                                       |
| Sequential `forEach`         | Batches with `batching: true`                                        | Does not batch                                                            |
| Batch window                 | No window (v3 `@effect/experimental` `dataLoader` has a `window`)    | Default: one `Effect.yieldNow`. Change it with `RequestResolver.setDelay` |

In v4, the batch size depends on the concurrency of the code that calls `Effect.request`.
`batchN` is only an upper limit.

## How batching works in v3

In v3, `forEach` and `all` control batching.

- `batching: true` enables batching for this `forEach`.
- `batching: "inherit"` uses the value of `Effect.withRequestBatching`. The default value is `true`.
- If you do not set the `batching` option, batching is disabled for this `forEach`.

When an item calls `Effect.request`, the item becomes blocked. A blocked item releases its concurrency slot, and `forEach` starts the next item.
The concurrency limits only the work before the request.

`forEach` waits until all its items are done or blocked. Then it sends all the collected requests to the resolver.
`batchN` splits the requests into chunks. The chunks run one after the other.

Timeline in v3 (`concurrency: 3`, `batching: true`):

```
request 1 ... request 12, batch 1-5, batch 6-10, batch 11-12
```

The timeline is the same when the requests start at different times (item N starts after N \* 30 ms).
v3 waits for the last request. Then it starts the first batch.

### Results in v3

| Program                                                             | Batches                | In flight |
| ------------------------------------------------------------------- | ---------------------- | --------- |
| `forEach` sequential                                                | 12 batches of 1        | 1         |
| `forEach` sequential, `batching: true`                              | `[1-5] [6-10] [11-12]` | 1         |
| `concurrency: 5`                                                    | 12 batches of 1        | 5         |
| `concurrency: 5`, `batching: true`                                  | `[1-5] [6-10] [11-12]` | 1         |
| `concurrency: 5`, `batching: true`, read before request             | sizes `[5, 5, 2]`      | 1         |
| `concurrency: "unbounded"`, `batching: true` (with or without read) | sizes `[5, 5, 2]`      | 1         |
| `"inherit"` + `withConcurrency(5)` + `withRequestBatching(true)`    | `[1-5] [6-10] [11-12]` | 1         |
| `"inherit"` + `withConcurrency(5)` + `withRequestBatching(false)`   | 12 batches of 1        | 5         |
| `"inherit"` with no `withConcurrency` and no `withRequestBatching`  | `[1-5] [6-10] [11-12]` | 1         |
| `all([forEach([1,2,3]), forEach([4,5,6])], { concurrency: 2 })`     | 6 batches of 1         | 2         |
| Same `all`, with `batching: true`                                   | `[1,4] [2,5] [3,6]`    | 1         |

With a read before the request, the order of the ids in a batch changes. The order follows the end of the reads.
The batch sizes do not change.

The two `forEach` in the `all` do not set the `batching` option. They batch together only if the outer `all` has `batching: true`.

## How batching works in v4

In v4, `forEach` and `all` have no `batching` option. `Effect.withRequestBatching` does not exist.
`Effect.withConcurrency` and `concurrency: "inherit"` do not exist. You must set the concurrency explicitly.

The resolver controls batching:

1. A fiber calls `Effect.request`. The fiber stops until the resolver completes the request.
2. If the resolver has no pending batch, the request opens a new batch. The batch window starts.
3. Other requests to the same resolver go into the same batch. These requests can come from all fibers.
4. When the window ends, the batch runs in a new fiber.
5. With `batchN(n)`, a batch that gets `n` requests runs immediately. The next request opens a new batch.

The default window is one `Effect.yieldNow`: a batch contains only the requests that start at the same time.
`RequestResolver.setDelay(duration)` makes the window longer. `RequestResolver.setDelayEffect(effect)` uses an effect as the window.

Each fiber has a maximum of one pending request. For this reason, the batch size is never more than the number of fibers that call `Effect.request`.
With `forEach`, this number is the `concurrency` value.

This model is almost the same as the v3 `dataLoader` in `@effect/experimental/RequestResolver`:

| v3 `dataLoader`            | v4                                                           |
| -------------------------- | ------------------------------------------------------------ |
| `window`                   | `RequestResolver.setDelay`                                   |
| `maxBatchSize`             | `RequestResolver.batchN`                                     |
| Scoped resource (`yield*`) | No scope. Effect keeps the state for each resolver instance. |

The `dataLoader` example in [`../v3/src/batching-with-streams.ts`](../v3/src/batching-with-streams.ts) has the same rule: you need concurrency to combine requests.

### Timelines in v4

`concurrency: 3`. The batch contains the 3 requests of the fibers in flight:

```
request 1, 2, 3, batch 1-3, request 4, 5, 6, batch 4-6, request 7, 8, 9, batch 7-9, request 10, 11, 12, batch 10-12
```

`concurrency: "unbounded"`. The batches are the same as in v3. But a full batch starts before the other requests:

```
request 1 ... 5, batch 1-5, request 6 ... 10, batch 6-10, request 11, 12, batch 11-12
```

Requests at different times (item N starts after N \* 30 ms), default window. Each request has its own batch:

```
request 1, batch 1, request 2, batch 2, ..., request 12, batch 12
```

Same requests, with `setDelay("105 millis")`. The window opens with the first pending request: 30 to 135 ms, 150 to 255 ms, 270 to 375 ms:

```
request 1 ... 4, batch 1-4, request 5 ... 8, batch 5-8, request 9 ... 12, batch 9-12
```

### Results in v4

| Program                                                         | Batches                                                    | In flight |
| --------------------------------------------------------------- | ---------------------------------------------------------- | --------- |
| `forEach` sequential                                            | 12 batches of 1                                            | 1         |
| `forEach` sequential, `setDelay("20 millis")`                   | 12 batches of 1                                            | 1         |
| `concurrency: 5`                                                | `[1-5] [6-10] [11-12]`                                     | 1         |
| `concurrency: 5`, read before request                           | Many small batches. Example sizes: `[1,1,2,1,2,1,1,1,1,1]` | 1         |
| `concurrency: "unbounded"`                                      | `[1-5] [6-10] [11-12]`                                     | **3**     |
| `concurrency: "unbounded"`, read before request                 | Usually `[3,6,9,12] [1,4,7,10] [2,5,8,11]`                 | 1         |
| `concurrency: "unbounded"`, read, `setDelay("50 millis")`       | `[3,6,9,12,1] [4,7,10,2,5] [8,11]`                         | 1         |
| `concurrency: "unbounded"`, read, `TestClock`                   | 12 batches of 1                                            | 4         |
| `all([forEach([1,2,3]), forEach([4,5,6])], { concurrency: 2 })` | `[1,4] [2,5] [3,6]`                                        | 1         |

Notes:

- A sequential `forEach` does not batch. Each request waits for the previous request. `setDelay` does not change this.
- With `concurrency: 5` and a read, the result changes at each run. It depends on which reads end at the same time.
- With unbounded concurrency and a read, each batch contains only the requests whose reads end at the same time.
  Sometimes the timers of one group run in different ticks. Then the group splits, for example `[3] [6,9,12]`.
  A batch never contains requests from two different groups.
- Requests from two independent `forEach` go into the same batch. You do not need an option for this.

## API changes

| v3                                                            | v4                                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `Request.TaggedClass(tag)<Success, Error, Fields>`            | `Request.TaggedClass(tag)<Fields, Success, Error, Services>`                      |
| `RequestResolver.makeBatched((requests) => ...)`              | `RequestResolver.make((entries) => ...)`. Use `entry.request` to get the request. |
| `Request.succeed(request, value)`                             | `entry.completeUnsafe(Exit.succeed(value))` or `Request.succeed(entry, value)`    |
| `RequestResolver.batchN(n)`                                   | `RequestResolver.batchN(n)`. Same name, different behavior.                       |
| `batching` option of `forEach`/`all`                          | Removed                                                                           |
| `Effect.withRequestBatching`                                  | Removed                                                                           |
| `Effect.withConcurrency`, `concurrency: "inherit"`            | Removed. Set `concurrency` explicitly.                                            |
| `@effect/experimental` `dataLoader({ window, maxBatchSize })` | `RequestResolver.setDelay(window)` + `RequestResolver.batchN(maxBatchSize)`       |

v4 also has `RequestResolver.makeGrouped` and `RequestResolver.makeWith`. They put requests into different batches by a key.

## How to get large batches in v4

There is no exact equivalent of the v3 behavior, because v4 cannot wait until all the items of a `forEach` are blocked.

These values come from a separate run. They are not in the test files.
The setup is 12 requests, `batchN(10)`, and a read of 20, 40 or 60 ms before each request.

| Program                                                                          | Batches         | Duration |
| -------------------------------------------------------------------------------- | --------------- | -------- |
| `concurrency: 3`                                                                 | 12 batches of 1 | 225 ms   |
| `concurrency: 3`, `setDelay("50 millis")`                                        | 4 batches of 3  | 325 ms   |
| `concurrency: "unbounded"`, `Semaphore(3)` on the read, `setDelay("50 millis")`  | 3 batches of 4  | 202 ms   |
| `concurrency: "unbounded"`, `Semaphore(3)` on the read, `setDelay("200 millis")` | `[10, 2]`       | 375 ms   |

`setDelay` alone does not give large batches. The batch size stays at the concurrency value or less.
Also, each batch that is not full waits for the full window, and the program is slower.

You can use one of these procedures:

1. Use `concurrency: "unbounded"` (or a value that is equal to or more than `batchN`) for the `forEach` that calls `Effect.request`.
   Use a `Semaphore` to limit the concurrency of the work before the request.
   Use `setDelay` to make the window longer than the time between two requests.
    - The program has one fiber for each item.
    - You must find a good window value.
    - Full batches can run in parallel. If necessary, use a `Semaphore` in the resolver to limit them.
2. Collect the values explicitly. Use a `forEach` with `concurrency` to calculate all the values.
   Then use `Array.chunksOf(n)`. Then write each chunk in a sequential `forEach`.
   This procedure has the same behavior as v3. The result is deterministic.
3. Use a `Stream`: `Stream.mapEffect(f, { concurrency })`, then `Stream.groupedWithin(n, duration)`, then `Stream.mapEffect(write)`.

## Points of attention

### Migration from v3

- Remove the `batching` option and `Effect.withRequestBatching`. The type check shows these locations.
- Replace `Effect.withConcurrency` and `concurrency: "inherit"` with an explicit `concurrency` value.
- A sequential `forEach` with `batching: true` batches in v3. In v4, it does not batch. There is no type error for this change.
- In v3, a `forEach` with low concurrency and `batching: true` can make batches of size `batchN`.
  In v4, the batch size is the concurrency value or less. The resolver gets more calls.
- In v4, full batches can run in parallel. In v3, they run one after the other.
  Make sure that the resolver target (for example, a database) accepts more calls at the same time.
- Use the same resolver instance for all requests. v4 keeps the pending batches for each resolver instance.
  Requests to two different resolver instances do not go into the same batch.
  This information comes from the v4 source code (`internal/request.js`). The tests do not check it.
- The resolver must complete all the requests that it gets. If the resolver ends and a request is not complete,
  that request fails with a defect.

### Tests

- Do not use `TestClock` in batching tests that have a sleep before the request.
  `TestClock` wakes one sleep at a time. It waits until the woken fiber stops. Then it wakes the next sleep.
  As a result, each batch runs before the next request starts and has only 1 request.
  `it.effect` of `@effect/vitest` uses `TestClock` by default. Use the live clock in these tests.
- With real timers, the batch contents depend on time. Do not compare the exact batches.
  Compare properties that are always true. For example: all ids are present, or a batch does not mix two groups.
- Do not use a sleep of 0 ms in these tests. In Node.js, the order of `setTimeout(0)` and `setImmediate` is not deterministic.
  A sleep of 0 ms made the tests fail at random.
