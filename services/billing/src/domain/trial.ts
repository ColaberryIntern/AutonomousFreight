import { PLANS } from './plans';

const TRIAL_DAYS = PLANS.trial.trialDays ?? 14;

export interface TrialStatus {
  active: boolean;
  daysRemaining: number;
  endsAt: string;
}

/** Returns the number of days remaining in a trial that started at `trialStartIso`. */
export function trialDaysRemaining(trialStartIso: string): number {
  const start = Date.parse(trialStartIso);
  if (Number.isNaN(start)) return 0;
  const endsAt = start + TRIAL_DAYS * 86_400_000;
  const remaining = Math.ceil((endsAt - Date.now()) / 86_400_000);
  return Math.max(0, remaining);
}

/** True when the trial period has elapsed. */
export function isTrialExpired(trialStartIso: string): boolean {
  return trialDaysRemaining(trialStartIso) <= 0;
}

/** Full trial status object for API responses. */
export function getTrialStatus(trialStartIso: string): TrialStatus {
  const start = Date.parse(trialStartIso);
  const endsAt = new Date(start + TRIAL_DAYS * 86_400_000).toISOString();
  const daysRemaining = trialDaysRemaining(trialStartIso);
  return { active: daysRemaining > 0, daysRemaining, endsAt };
}
