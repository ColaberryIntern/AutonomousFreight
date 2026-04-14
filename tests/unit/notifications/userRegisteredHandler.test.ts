import { CaptureEmailDriver } from '../../../services/notifications/src/drivers/captureEmailDriver';
import { buildUserRegisteredHandler } from '../../../services/notifications/src/handlers/userRegisteredHandler';
import type { NotificationPreferences } from '../../../services/notifications/src/repo/preferencesRepository';
import type { DomainEvent } from '../../../services/events/src/types';
import type { UserRegisteredPayload } from '../../../services/notifications/src/handlers/userRegisteredHandler';

function fakePrefs(prefs: Partial<NotificationPreferences> = {}): {
  getOrDefault: (userId: string) => Promise<NotificationPreferences>;
} {
  return {
    getOrDefault: (userId: string): Promise<NotificationPreferences> =>
      Promise.resolve({
        userId,
        emailEnabled: prefs.emailEnabled ?? true,
        inAppEnabled: prefs.inAppEnabled ?? true,
      }),
  };
}

function event(): DomainEvent<UserRegisteredPayload> {
  return {
    name: 'user.registered',
    version: 1,
    occurredAt: new Date().toISOString(),
    traceId: 'trace-abc',
    payload: {
      userId: '11111111-1111-1111-1111-111111111111',
      email: 'handler@af.test',
      roles: ['broker'],
    },
  };
}

describe('buildUserRegisteredHandler', () => {
  it('sends one email via the driver on receipt', async () => {
    const driver = new CaptureEmailDriver();
    const handler = buildUserRegisteredHandler({
      driver,
      prefsRepo: fakePrefs() as never,
    });
    await handler(event());
    expect(driver.sent).toHaveLength(1);
    expect(driver.sent[0]?.to).toBe('handler@af.test');
    expect(driver.sent[0]?.subject).toContain('Welcome');
  });

  it('skips email when the user has emailEnabled=false', async () => {
    const driver = new CaptureEmailDriver();
    const logs: string[] = [];
    const handler = buildUserRegisteredHandler({
      driver,
      prefsRepo: fakePrefs({ emailEnabled: false }) as never,
      log: (_p, m) => logs.push(m),
    });
    await handler(event());
    expect(driver.sent).toHaveLength(0);
    expect(logs.join(' ')).toContain('skipping');
  });

  it('swallows driver errors (logs, does not throw)', async () => {
    const logs: Record<string, unknown>[] = [];
    const failingDriver = {
      send: (): Promise<void> => Promise.reject(new Error('smtp down')),
    };
    const handler = buildUserRegisteredHandler({
      driver: failingDriver,
      prefsRepo: fakePrefs() as never,
      log: (p, _m) => logs.push(p),
    });
    await expect(handler(event())).resolves.toBeUndefined();
    expect(logs).toHaveLength(1);
  });
});
