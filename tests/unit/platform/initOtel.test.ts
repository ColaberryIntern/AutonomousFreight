import { initOtel } from '../../../services/platform/src/tracing/initOtel';

describe('initOtel', () => {
  it('returns a no-op handle when OTEL_EXPORTER_OTLP_ENDPOINT is unset', async () => {
    const handle = await initOtel('test-service', {} as NodeJS.ProcessEnv);
    await expect(handle.stop()).resolves.toBeUndefined();
  });

  it('returns a no-op handle when env explicitly empty', async () => {
    const handle = await initOtel('test-service', {
      OTEL_EXPORTER_OTLP_ENDPOINT: '',
    } as NodeJS.ProcessEnv);
    await expect(handle.stop()).resolves.toBeUndefined();
  });
});
