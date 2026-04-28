import { withRetry } from '../../../services/platform/src/reliability/withRetry';

describe('withRetry', () => {
  it('returns the value on first success without retrying', async () => {
    const fn = jest.fn(async () => 42);
    const out = await withRetry(fn, { attempts: 3, baseDelayMs: 1 });
    expect(out).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('recovers from a transient failure', async () => {
    let calls = 0;
    const fn = jest.fn(async () => {
      calls++;
      if (calls < 2) throw new Error('transient');
      return 'ok';
    });
    const out = await withRetry(fn, { attempts: 3, baseDelayMs: 1 });
    expect(out).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws the last error after exhausting attempts', async () => {
    const fn = jest.fn(async () => {
      throw new Error('persistent');
    });
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toThrow('persistent');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('skips retry when isRetryable returns false', async () => {
    const err = new Error('logical');
    const fn = jest.fn(async () => {
      throw err;
    });
    await expect(
      withRetry(fn, { attempts: 5, baseDelayMs: 1, isRetryable: () => false }),
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('invokes onAttemptFailed for each retry', async () => {
    let calls = 0;
    const fn = async (): Promise<string> => {
      calls++;
      if (calls < 3) throw new Error(`fail-${calls}`);
      return 'done';
    };
    const onAttemptFailed = jest.fn();
    const out = await withRetry(fn, { attempts: 3, baseDelayMs: 1, onAttemptFailed });
    expect(out).toBe('done');
    expect(onAttemptFailed).toHaveBeenCalledTimes(2);
    expect(onAttemptFailed).toHaveBeenNthCalledWith(1, 1, expect.any(Error));
    expect(onAttemptFailed).toHaveBeenNthCalledWith(2, 2, expect.any(Error));
  });
});
