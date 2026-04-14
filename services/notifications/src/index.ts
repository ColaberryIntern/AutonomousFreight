import type { Pool } from 'pg';
import type { EventBus } from '../../events/src/types';
import type { EmailDriver } from './drivers/emailDriver';
import { buildUserRegisteredHandler } from './handlers/userRegisteredHandler';
import { PreferencesRepository } from './repo/preferencesRepository';

export interface NotificationServiceDeps {
  pool: Pool;
  bus: EventBus;
  driver: EmailDriver;
}

export interface StartedNotificationService {
  stop: () => void;
}

export function startNotificationService(
  deps: NotificationServiceDeps,
): StartedNotificationService {
  const prefsRepo = new PreferencesRepository(deps.pool);
  const handler = buildUserRegisteredHandler({ driver: deps.driver, prefsRepo });
  const unsubscribe = deps.bus.subscribe('user.registered', handler);
  return { stop: unsubscribe };
}

export { CaptureEmailDriver } from './drivers/captureEmailDriver';
export { SmtpEmailDriver, type SmtpConfig } from './drivers/smtpEmailDriver';
export { GmailEmailDriver, type GmailConfig } from './drivers/gmailEmailDriver';
export type { EmailDriver, EmailMessage } from './drivers/emailDriver';
export { PreferencesRepository } from './repo/preferencesRepository';
