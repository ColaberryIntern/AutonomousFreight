import {
  resetCooldownForTest,
  runCapacityShortageTick,
} from '../../../services/carrier/src/agent/capacityShortageAgent';
import type { CarrierRepository } from '../../../services/carrier/src/repo/carrierRepository';
import type { AuditRepository } from '../../../services/user/src/repo/auditRepository';

interface ShipmentRow {
  shipmentId: string;
  origin: string;
  destination: string;
  ageMinutes: number;
  activeBidCount: number;
}

function mockDeps(rows: ShipmentRow[]): {
  deps: { carrierRepo: CarrierRepository; audit: AuditRepository };
  recorded: Array<{ action: string; target?: string; metadata: Record<string, unknown> }>;
} {
  const recorded: Array<{
    action: string;
    target?: string;
    metadata: Record<string, unknown>;
  }> = [];
  const carrierRepo = {
    listCapacityShortageShipments: async () => rows,
  } as unknown as CarrierRepository;
  const audit = {
    record: (entry: { action: string; target?: string; metadata?: Record<string, unknown> }) => {
      const e: { action: string; target?: string; metadata: Record<string, unknown> } = {
        action: entry.action,
        metadata: entry.metadata ?? {},
      };
      if (entry.target !== undefined) e.target = entry.target;
      recorded.push(e);
      return Promise.resolve();
    },
  } as unknown as AuditRepository;
  return { deps: { carrierRepo, audit }, recorded };
}

describe('runCapacityShortageTick', () => {
  beforeEach(() => resetCooldownForTest());

  it('treats fresh shipments with bids as normal — no audit emitted', async () => {
    const { deps, recorded } = mockDeps([
      {
        shipmentId: '00000000-0000-0000-0000-000000000001',
        origin: 'A',
        destination: 'B',
        ageMinutes: 1,
        activeBidCount: 2,
      },
    ]);
    const out = await runCapacityShortageTick(deps);
    expect(out.detected).toBe(0);
    expect(out.normal).toBe(1);
    expect(recorded).toHaveLength(0);
  });

  it('emits no_bids audit when zero bids past threshold', async () => {
    const { deps, recorded } = mockDeps([
      {
        shipmentId: '00000000-0000-0000-0000-000000000002',
        origin: 'A',
        destination: 'B',
        ageMinutes: 30,
        activeBidCount: 0,
      },
    ]);
    const out = await runCapacityShortageTick(deps);
    expect(out.detected).toBe(1);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.action).toBe('agent.capacity_shortage.detected');
    expect(recorded[0]?.target).toBe('00000000-0000-0000-0000-000000000002');
    expect(recorded[0]?.metadata['classification']).toBe('no_bids');
    expect(recorded[0]?.metadata['ageMinutes']).toBe(30);
  });

  it('emits stale audit for shipments past staleAfterMin with viable bids', async () => {
    const { deps, recorded } = mockDeps([
      {
        shipmentId: '00000000-0000-0000-0000-000000000003',
        origin: 'A',
        destination: 'B',
        ageMinutes: 60,
        activeBidCount: 1,
      },
    ]);
    const out = await runCapacityShortageTick(deps);
    expect(out.detected).toBe(1);
    expect(recorded[0]?.metadata['classification']).toBe('stale');
  });

  it('respects per-shipment cooldown across consecutive ticks', async () => {
    const row: ShipmentRow = {
      shipmentId: '00000000-0000-0000-0000-000000000004',
      origin: 'A',
      destination: 'B',
      ageMinutes: 30,
      activeBidCount: 0,
    };
    const { deps: deps1, recorded: rec1 } = mockDeps([row]);
    const r1 = await runCapacityShortageTick(deps1);
    expect(r1.detected).toBe(1);
    expect(rec1).toHaveLength(1);

    // Second tick on the same shipment should be on cooldown.
    const { deps: deps2, recorded: rec2 } = mockDeps([row]);
    const r2 = await runCapacityShortageTick(deps2);
    expect(r2.detected).toBe(0);
    expect(r2.cooldown).toBe(1);
    expect(rec2).toHaveLength(0);
  });

  it('processes multiple shipments independently in a single tick', async () => {
    const { deps, recorded } = mockDeps([
      {
        shipmentId: '00000000-0000-0000-0000-000000000005',
        origin: 'A',
        destination: 'B',
        ageMinutes: 30,
        activeBidCount: 0,
      },
      {
        shipmentId: '00000000-0000-0000-0000-000000000006',
        origin: 'C',
        destination: 'D',
        ageMinutes: 1,
        activeBidCount: 2,
      },
      {
        shipmentId: '00000000-0000-0000-0000-000000000007',
        origin: 'E',
        destination: 'F',
        ageMinutes: 60,
        activeBidCount: 1,
      },
    ]);
    const out = await runCapacityShortageTick(deps);
    expect(out.detected).toBe(2);
    expect(out.normal).toBe(1);
    expect(recorded.map((r) => r.metadata['classification'])).toEqual(['no_bids', 'stale']);
  });
});
