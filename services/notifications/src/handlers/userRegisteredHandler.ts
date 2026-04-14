import type { DomainEvent, EventHandler } from '../../../events/src/types';
import type { PayloadFor } from '../../../events/src/schema';
import { renderUserRegisteredWelcome } from '../domain/emailTemplates';
import type { EmailDriver } from '../drivers/emailDriver';
import type { PreferencesRepository } from '../repo/preferencesRepository';

interface HandlerDeps {
  driver: EmailDriver;
  prefsRepo: PreferencesRepository;
  log?: (payload: Record<string, unknown>, msg: string) => void;
}

export type UserRegisteredPayload = PayloadFor<'user.registered@1'>;

export function buildUserRegisteredHandler(deps: HandlerDeps): EventHandler<UserRegisteredPayload> {
  const log =
    deps.log ??
    ((p, m): void => {
      console.warn(`[notifications] ${m}`, p);
    });

  return async (event: DomainEvent<UserRegisteredPayload>): Promise<void> => {
    const { userId, email, roles } = event.payload;
    const prefs = await deps.prefsRepo.getOrDefault(userId);
    if (!prefs.emailEnabled) {
      log({ userId, traceId: event.traceId }, 'email disabled; skipping');
      return;
    }
    const rendered = renderUserRegisteredWelcome({ email, roles });
    try {
      await deps.driver.send({
        to: email,
        subject: rendered.subject,
        text: rendered.text,
      });
    } catch (err) {
      log({ err, userId, traceId: event.traceId }, 'email send failed');
    }
  };
}
