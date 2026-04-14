/**
 * Sprint 14 — OpenTelemetry SDK bootstrap.
 *
 * No-op when OTEL_EXPORTER_OTLP_ENDPOINT is unset (CI default + tests).
 * Avoids importing the SDK at module load to keep cold-start cost bounded.
 */

export interface OtelHandle {
  stop: () => Promise<void>;
}

const NOOP: OtelHandle = { stop: () => Promise.resolve() };

export async function initOtel(
  serviceName: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<OtelHandle> {
  const endpoint = env['OTEL_EXPORTER_OTLP_ENDPOINT'];
  if (!endpoint) return NOOP;

  type SdkCtor = new (cfg: Record<string, unknown>) => {
    start: () => Promise<void> | void;
    shutdown: () => Promise<void>;
  };
  type ExpCtor = new (cfg: Record<string, unknown>) => unknown;
  type AutoFn = () => unknown[];

  const sdkMod = (await import('@opentelemetry/sdk-node')) as unknown as {
    NodeSDK: SdkCtor;
  };
  const exporterMod = (await import('@opentelemetry/exporter-trace-otlp-http')) as unknown as {
    OTLPTraceExporter: ExpCtor;
  };
  const autoMod = (await import('@opentelemetry/auto-instrumentations-node')) as unknown as {
    getNodeAutoInstrumentations: AutoFn;
  };

  const sdk = new sdkMod.NodeSDK({
    serviceName,
    traceExporter: new exporterMod.OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    instrumentations: autoMod.getNodeAutoInstrumentations(),
  });
  await sdk.start();
  return {
    stop: async (): Promise<void> => {
      await sdk.shutdown();
    },
  };
}
