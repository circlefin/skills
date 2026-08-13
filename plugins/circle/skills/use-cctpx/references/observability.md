# CCTPx observability

The CCTPx provider (and Bridge Kit) emit on three channels at every degrade or operator-action site: a `logger.warn` line, an `events.emit({ name, data })` event, and a `metrics.counter(name).inc()` increment. All three default to no-ops -- emissions are dropped unless you wire a runtime backend.

## Wiring the runtime backends

Pass a runtime with your backends via the kit's invocation metadata, or construct the provider directly with `logger` / `events` / `metrics`.

```ts
import { CCTPXBridgingProvider } from "@circle-fin/provider-cctpx";

// Node -- e.g. pino logs + an OpenTelemetry counter + your event bus.
const provider = new CCTPXBridgingProvider({
  logger: { warn: (msg, fields) => pino.warn(fields, msg) /* ...rest */ },
  metrics: { counter: (name) => ({ inc: () => otelCounter(name).add(1) }) },
  events: { emit: (event) => myBus.publish(event.name, event.data) },
});
```

```ts
// Browser -- e.g. forward warnings to Sentry and events to Datadog RUM.
const provider = new CCTPXBridgingProvider({
  logger: { warn: (msg, fields) => Sentry.captureMessage(msg, { extra: fields }) },
  events: { emit: (event) => datadogRum.addAction(event.name, event.data) },
});
```

Wiring `Runtime.{ logger, events, metrics }` on the kit once captures every site below.

## Emission sites

| Event name | Metric name | Source | Fires when |
|---|---|---|---|
| `cctpx.registry.failed` | `cctpx.registry.errors` | provider · `fetchTokenRegistry` | Token-registry fetch fails (network / non-OK HTTP / unusable body); carries an `errorType`. |
| `cctpx.registry.invalidpayload` | `cctpx.registry.invalidpayload` | provider · `fetchTokenRegistry` | Registry 200 body fails JSON parse / schema validation (alarmable separately from transient blips). |
| `cctpx.feequote.failed` | `cctpx.feequote.errors` | provider · `fetchCCTPxFeeQuote` | Fee-quote fetch fails (network / non-OK HTTP / unusable body). |
| `cctpx.feequote.invalidpayload` | `cctpx.feequote.invalidpayload` | provider · `fetchCCTPxFeeQuote` | Fee-quote 200 body invalid / unparseable. |
| `cctpx.allowance.failed` | `cctpx.allowance.errors` | provider · `fetchCCTPxAllowances` | Fast-burn allowance probe fails. |
| `cctpx.allowance.degraded` | `cctpx.allowance.degraded` | provider · `fetchCCTPxAllowances` | Probe failure forced fast-burn -> unavailable (so the bridge takes SLOW). |
| `cctpx.quote.refetched` | `cctpx.quote.refetched` | provider · bridge orchestrator | Signed quote was stale at submit time -> transparently re-fetched + calldata rebuilt. |
| `cctpx.fastburn.unavailable` | `cctpx.fastburn.degraded` | provider · bridge orchestrator | Fast-burn allowance exhausted -> transfer degraded FAST -> SLOW before signing. |
| `cctpx.customfee.skipped` | `cctpx.customfee.skipped` | bridge-kit · `resolveFee` | A custom-fee policy is configured but the token is non-USDC -> fee skipped, bridge proceeds. |

Channel coverage: for the IRIS read families (registry / feequote / allowance), `*.failed` fires on all three channels (logger + event + metric) while incrementing the `*.errors` counter; the remaining member (`*.invalidpayload`, or `*.degraded` for the allowance probe) fires on event + metric. These paths also throw typed errors; a read failure with a cold cache makes the route check return `false`.

All names are dot-namespaced (`cctpx.<area>.<event>`). A few metric names differ from their event name -- the `*.failed` events increment `*.errors`, and `cctpx.fastburn.unavailable` increments `cctpx.fastburn.degraded` -- so wire each event/metric exactly as listed above.

> There is no longer a `cctpx.forward.insufficient_gas` signal -- a relayer gas-pause now surfaces as `forwardState: PENDING` (the poll continues), not a distinct signal.
