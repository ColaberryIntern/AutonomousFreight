import { selectVehicle, normalizeVehicle, rpmFor, rpmBand } from '../../../services/rms/src/evaluate/vehicleSelect';
import { KARUN_FLEET } from '../../../services/rms/src/vendor/karun/fleetConfig';
import { composePrompt } from '../../../services/rms/src/vendor/karun/extractorPrompt';
import { LlmExtractorEngine, extractJsonBlock, type LlmClient } from '../../../services/rms/src/extract/extractorEngine';
import type { InboundEmail } from '../../../services/adapters/src/email/emailAdapter';

describe("D5 vehicle selection (Karun's fleet data)", () => {
  it('selects the smallest vehicle that fits the weight', () => {
    expect(selectVehicle({ weightLb: 500 }).vehicle).toBe('Cargo Van'); // <= 3400
    expect(selectVehicle({ weightLb: 3450 }).vehicle).toBe('Sprinter'); // 3400 < w <= 3500
    expect(selectVehicle({ weightLb: 3900 }).vehicle).toBe('Cube'); // <= 4000
    expect(selectVehicle({ weightLb: 8000 }).vehicle).toBe('Straight Truck'); // <= 9000
    expect(selectVehicle({ weightLb: 42000 }).vehicle).toBe('Tractor'); // <= 46000
  });

  it("defaults to Tractor/FTL when no cargo details (his business rule)", () => {
    const r = selectVehicle({});
    expect(r.vehicle).toBe('Tractor');
    expect(r.equipmentType).toBe('VAN');
    expect(r.source).toBe('from_fallback_ftl');
  });

  it('respects dimension limits, not just weight', () => {
    // Light but very long freight cannot fit a Cargo Van (140in) -> larger vehicle.
    const r = selectVehicle({ weightLb: 500, dims: { lengthIn: 200 } });
    expect(r.vehicle).not.toBe('Cargo Van');
  });

  it('marks the source as a fallback inference', () => {
    expect(selectVehicle({ weightLb: 500 }).source).toBe('from_fallback_dims_weight');
  });
});

describe("vehicle alias normalization (Karun's EN/ES tables)", () => {
  it('maps English aliases', () => {
    expect(normalizeVehicle('need a sprinter')).toBe('SPRINTER');
    expect(normalizeVehicle('box truck 24ft')).toBe('STRAIGHT_TRUCK');
    expect(normalizeVehicle('53 dry van')).toBe('VAN');
  });
  it('maps Spanish aliases (Rabon, tres y media, Nissan)', () => {
    expect(normalizeVehicle('un rabon por favor')).toBe('STRAIGHT_TRUCK');
    expect(normalizeVehicle('necesito tres y media')).toBe('CUBE_VAN');
    expect(normalizeVehicle('Nissan')).toBe('CARGO_VAN');
  });
});

describe("RPM pricing (Karun's fleet rate-per-mile bands)", () => {
  it('bands distance correctly', () => {
    expect(rpmBand(250)).toBe('under_300');
    expect(rpmBand(800)).toBe('under_900');
    expect(rpmBand(2000)).toBe('over_1200');
  });
  it('returns his rate-per-mile for a vehicle + distance', () => {
    expect(rpmFor('VAN', 250)).toBe(3.0); // Tractor under_300
    expect(rpmFor('CARGO_VAN', 2000)).toBe(1.1); // Cargo Van over_1200
  });
  it('every fleet vehicle carries a full RPM curve', () => {
    for (const v of KARUN_FLEET) expect(Object.keys(v.rpm)).toHaveLength(6);
  });
});

describe("extractor prompt (Karun's vendored prompt)", () => {
  it('composes the base prompt with the en-US locale fragment', () => {
    const p = composePrompt('en-US');
    expect(p).toContain('MM/DD/YYYY');
    expect(p).not.toContain('{{LOCALE_DATE_FORMAT}}'); // substituted
    expect(p).toContain('city/state OR zip');
  });
  it('composes the es-MX fragment with Spanish aliases', () => {
    const p = composePrompt('es-MX');
    expect(p).toContain('DD/MM/YYYY');
    expect(p).toContain('Rabon');
  });
});

describe('LlmExtractorEngine (his prompt, our model, mocked client)', () => {
  const email: InboundEmail = { messageId: 'x', from: 'a@b.com', to: ['q@x.com'], subject: 'Quote', body: 'Dallas to Chicago', receivedAt: '2026-05-21T12:00:00Z' };

  it('extractJsonBlock pulls JSON out of a fenced/prose response', () => {
    expect(extractJsonBlock('Here you go:\n```json\n{"weightLb": 42000}\n```')).toBe('{"weightLb": 42000}');
    expect(extractJsonBlock('no json here')).toBeNull();
  });

  it('runs the composed prompt through the client and parses fields', async () => {
    let sawPrompt = '';
    const mock: LlmClient = {
      async complete(system) {
        sawPrompt = system;
        return '{"origin":{"city":"Dallas","state":"TX"},"weightLb":42000,"equipmentType":"VAN"}';
      },
    };
    const engine = new LlmExtractorEngine(mock, 'en-US');
    const r = await engine.extract(email);
    expect(sawPrompt).toContain('MM/DD/YYYY'); // his prompt was used
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fields.weightLb).toBe(42000);
  });

  it('returns a typed error when the client fails', async () => {
    const mock: LlmClient = { async complete() { throw new Error('rate limit'); } };
    const r = await new LlmExtractorEngine(mock).extract(email);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/rate limit/);
  });
});
