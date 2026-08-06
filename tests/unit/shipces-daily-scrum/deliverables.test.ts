/*
 * Unit tests for the ShipCES daily-report deliverable model + render helpers.
 * The model is plain CommonJS (runs in the accelerator-backend container under
 * bare node), so it is loaded with require(); ts-jest executes the require at
 * runtime and Node resolves the .js. Covers happy path, boundary, and the
 * outgoing-comms rule (no em-dashes / en-dashes).
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const D = require('../../../scripts/shipces-daily-scrum/deliverables');

const EM = '—';
const EN = '–';
const STATE_KEYS = ['accepted', 'verified', 'inprogress', 'blocked'];

function allStrings(obj: any): string[] {
  if (obj == null) return [];
  if (typeof obj === 'string') return [obj];
  if (Array.isArray(obj)) return obj.flatMap(allStrings);
  if (typeof obj === 'object') return Object.values(obj).flatMap(allStrings);
  return [];
}

describe('deliverable model', () => {
  it('has all nine active work streams plus Phase C', () => {
    expect(D.DELIVERABLES).toHaveLength(10);
    const nums = D.DELIVERABLES.map((d: any) => d.num);
    expect(nums).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 'C']);
  });

  it('every deliverable carries the PMBOK fields (deliverable, acceptance, value, valid state, kind, owner)', () => {
    for (const d of D.DELIVERABLES) {
      expect(typeof d.deliverable).toBe('string');
      expect(d.deliverable.length).toBeGreaterThan(20);
      expect(typeof d.acceptance).toBe('string');
      expect(d.acceptance.length).toBeGreaterThan(20);
      expect(typeof d.value).toBe('string');
      expect(d.value.length).toBeGreaterThan(10);
      expect(STATE_KEYS).toContain(d.state);
      expect(/AI|Human/.test(d.kind)).toBe(true);
      expect(d.owner.length).toBeGreaterThan(0);
    }
  });

  it('the deliverable statement is a single tangible sentence (Brett standard)', () => {
    for (const d of D.DELIVERABLES) {
      // one sentence: exactly one terminal period, no mid-string sentence breaks
      const interior = d.deliverable.trim().replace(/\.$/, '');
      expect(interior).not.toMatch(/[.!?]\s+[A-Z]/);
    }
  });

  it('every dependency references a real work-stream key', () => {
    const keys = new Set(D.DELIVERABLES.map((d: any) => d.key));
    for (const d of D.DELIVERABLES) {
      for (const dep of d.dependsOn || []) {
        if (dep === 'all') continue;
        expect(keys.has(dep)).toBe(true);
      }
      for (const f of d.feeds || []) {
        if (f === 'all') continue;
        expect(keys.has(f)).toBe(true);
      }
    }
  });

  it('the value chain has no dependency cycles on the built layers', () => {
    // SENSE -> RMS -> OMS -> TMS -> BMS must be acyclic
    const map: Record<string, string[]> = {};
    D.DELIVERABLES.forEach((d: any) => (map[d.key] = (d.dependsOn || []).filter((k: string) => k !== 'all')));
    const seen = new Set<string>();
    const stack = new Set<string>();
    const visit = (k: string): void => {
      if (stack.has(k)) throw new Error('cycle at ' + k);
      if (seen.has(k)) return;
      stack.add(k);
      (map[k] || []).forEach(visit);
      stack.delete(k);
      seen.add(k);
    };
    expect(() => D.FLOW.forEach(visit)).not.toThrow();
  });

  it('contains no em-dashes or en-dashes anywhere in the model text', () => {
    const strings = allStrings(D.DELIVERABLES).concat(allStrings(D.MILESTONES), [D.PROVENANCE]);
    const offenders = strings.filter((s) => s.includes(EM) || s.includes(EN));
    expect(offenders).toEqual([]);
  });

  it('every work stream has a Given / When / Then demo script', () => {
    for (const d of D.DELIVERABLES) {
      expect(typeof d.demoScript).toBe('string');
      expect(d.demoScript).toMatch(/\bGiven\b/);
      expect(d.demoScript).toMatch(/\bWhen\b/);
      expect(d.demoScript).toMatch(/\bThen\b/);
    }
  });

  it('every work stream lists artifacts with a valid have/need shape', () => {
    for (const d of D.DELIVERABLES) {
      expect(Array.isArray(d.artifacts)).toBe(true);
      expect(d.artifacts.length).toBeGreaterThan(0);
      for (const art of d.artifacts) {
        expect(typeof art.n).toBe('string');
        expect(art.n.length).toBeGreaterThan(0);
        expect(typeof art.have).toBe('boolean');
        expect(typeof art.where).toBe('string');
      }
    }
  });

  it('has at least one artifact still to create (drives the report backlog)', () => {
    const need = D.DELIVERABLES.flatMap((d: any) => d.artifacts).filter((x: any) => !x.have);
    expect(need.length).toBeGreaterThan(0);
  });
});

describe('render helpers', () => {
  it('renders a deliverable card per active stream with acceptance + value + no dashes', () => {
    const counts = { 3: { open: 2, done: 8, overdue: 1 } };
    const html = D.renderDeliverableCards(counts, (n: any) => `#${n}`);
    expect(html).toContain('Accepted when:');
    expect((html.match(/Accepted when:/g) || []).length).toBe(9); // 9 active, Phase C excluded
    expect(html).toContain('Value:');
    expect(html).toContain('2 open / 8 done');
    expect(html).toContain('1 overdue');
    expect(html.includes(EM)).toBe(false);
    expect(html.includes(EN)).toBe(false);
  });

  it('boundary: renders with no live counts (empty map)', () => {
    const html = D.renderDeliverableCards({}, (n: any) => `#${n}`);
    expect(html).toContain('Accepted when:');
    expect(html).not.toContain('open /'); // no counts line when data is absent
  });

  it('birds-eye renders exactly the five value-chain tiles in flow order', () => {
    const html = D.renderBirdsEye((n: any) => `#${n}`);
    const tiles = [...html.matchAll(/min-width:74px;">\s*<div[^>]*>([^<]+)<\/div>/g)].map((m) => m[1].replace('&#9203; ', '').trim());
    expect(tiles).toEqual(['SENSE', 'RMS', 'OMS', 'TMS', 'BMS']);
  });

  it('dependent layers carry the hourglass dependency icon; the source layer does not', () => {
    const html = D.renderBirdsEye((n: any) => `#${n}`);
    // SENSE has no upstream dependency, so its tile has no hourglass prefix
    expect(html).toMatch(/>SENSE<\/div>/);
    // RMS depends on SENSE, so its tile is prefixed
    expect(html).toMatch(/>&#9203; RMS<\/div>/);
  });

  it('milestones render with mandatory/optional flags and go/no-go notes', () => {
    const rows = D.renderMilestones((s: string) => s);
    expect(rows).toContain('mandatory');
    expect(rows).toContain('optional');
    expect(rows).toContain('Go/no-go:');
  });

  it('state badge maps each state to its label', () => {
    expect(D.stateBadge('verified')).toContain('Verified');
    expect(D.stateBadge('accepted')).toContain('Accepted');
    expect(D.stateBadge('blocked')).toContain('Blocked');
    expect(D.stateBadge('inprogress')).toContain('In progress');
  });

  it('renders the demo script with Given / When / Then bolded', () => {
    const rms = D.DELIVERABLES.find((d: any) => d.key === 'RMS');
    const html = D.renderDemoScript(rms);
    expect(html).toContain('Given</b>');
    expect(html).toContain('When</b>');
    expect(html).toContain('Then</b>');
  });

  it('renders artifacts with have (check) and need (ring) markers', () => {
    const rms = D.DELIVERABLES.find((d: any) => d.key === 'RMS');
    const html = D.renderArtifacts(rms);
    expect(html).toContain('&#10003;'); // have
    expect(html).toContain('&#9711;'); // need
  });

  it('artifact backlog lists only to-create items (need-only) and is non-empty', () => {
    const html = D.renderArtifactBacklog();
    expect(html).toContain('Artifact to create');
    expect(html).toContain('&#9711;');
    expect(html).not.toContain('&#10003;'); // backlog shows only need items
  });

  it('deliverable cards include the demo script and the artifacts list', () => {
    const html = D.renderDeliverableCards({}, (n: any) => `#${n}`);
    expect(html).toContain('Demo:');
    expect(html).toContain('Artifacts (things you can point to)');
  });
});
