import type { EventBus } from '../../../events/src/types';
import type { AuditRepository } from '../../../user/src/repo/auditRepository';
import { isAutoSendable, priceRfq } from '../domain/pricing';
import type { RfqRecord, RfqRepository } from '../repo/rfqRepository';

const MAX_PER_TICK = 100;

export interface QuotingAgentDeps {
  repo: RfqRepository;
  audit: AuditRepository;
  bus?: EventBus;
}

export interface AgentTickResult {
  parsed: number;
  priced: number;
  sent: number;
  exceptions: number;
}

async function safeAudit(
  audit: AuditRepository,
  action: string,
  target: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await audit.record(metadata ? { action, target, metadata } : { action, target });
  } catch (err) {
    console.error('[quoting-agent] audit failed', err);
  }
}

async function safePublish(
  bus: EventBus | undefined,
  name: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!bus) return;
  try {
    await bus.publish({
      name,
      version: 1,
      occurredAt: new Date().toISOString(),
      payload,
    });
  } catch (err) {
    console.error(`[quoting-agent] publish ${name} failed`, err);
  }
}

/** One pass over all pending RFQs. Returns counters for visibility. */
export async function runQuotingAgentTick(deps: QuotingAgentDeps): Promise<AgentTickResult> {
  const result: AgentTickResult = { parsed: 0, priced: 0, sent: 0, exceptions: 0 };

  const received: RfqRecord[] = await deps.repo.listInStates(['received'], MAX_PER_TICK);
  for (const rfq of received) {
    try {
      await deps.repo.setStatus(rfq.id, 'parsed');
      await safeAudit(deps.audit, 'rfq.parsed', rfq.id);
      result.parsed++;
    } catch (err) {
      console.error('[quoting-agent] parse failed', { id: rfq.id, err });
    }
  }

  const parsed: RfqRecord[] = await deps.repo.listInStates(['parsed'], MAX_PER_TICK);
  for (const rfq of parsed) {
    try {
      const { priceUsd, confidence } = priceRfq({
        distanceMiles: rfq.distanceMiles,
        equipmentType: rfq.equipmentType,
      });
      const auto = isAutoSendable(confidence);
      const next = auto ? 'sent' : 'exception';
      await deps.repo.setPriced(rfq.id, priceUsd, confidence, next);
      await safeAudit(deps.audit, 'rfq.priced', rfq.id, { priceUsd, confidence });
      result.priced++;
      await safePublish(deps.bus, 'rfq.priced', {
        rfqId: rfq.id,
        priceUsd,
        confidence,
      });
      if (auto) {
        await safeAudit(deps.audit, 'rfq.sent', rfq.id);
        await safePublish(deps.bus, 'rfq.sent', { rfqId: rfq.id });
        result.sent++;
      } else {
        await safeAudit(deps.audit, 'rfq.exception', rfq.id, {
          reason: 'low_confidence',
          confidence,
        });
        await safePublish(deps.bus, 'rfq.exception', { rfqId: rfq.id, reason: 'low_confidence' });
        result.exceptions++;
      }
    } catch (err) {
      console.error('[quoting-agent] price failed', { id: rfq.id, err });
    }
  }

  return result;
}

export interface QuotingAgentLoop {
  stop: () => void;
}

/** Long-running loop. Off by default in tests (don't call from test code). */
export function startQuotingAgentLoop(deps: QuotingAgentDeps, intervalMs = 5000): QuotingAgentLoop {
  let stopped = false;
  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      await runQuotingAgentTick(deps);
    } catch (err) {
      console.error('[quoting-agent] tick error', err);
    }
    if (!stopped) setTimeout(() => void tick(), intervalMs);
  };
  setTimeout(() => void tick(), intervalMs);
  return {
    stop: (): void => {
      stopped = true;
    },
  };
}
