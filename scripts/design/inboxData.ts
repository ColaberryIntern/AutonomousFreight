/**
 * inboxData.ts - turns the real ShipCES corpus into the data the RFQ intake
 * prototype renders: every email, its real parse, and the CHARACTER OFFSETS of
 * the evidence behind each extracted value.
 *
 * The offsets are the whole point. The document-AI review pattern (Rossum,
 * Docsumo, Hyperscience) is "click any field and see exactly where it came from
 * in the source, highlighted". That only works if we know where each value was
 * read from, so this locates each extracted value back in the raw email body
 * and hands the prototype a range to highlight.
 *
 * Runs the SAME parse chain as the harness (parseEml -> parseEmailToRfq), so the
 * screen shows what the system actually does, not a mock of it.
 *
 * CONFIDENTIAL: emits real customer email bodies. Consumers must keep the output
 * local, exactly like the corpus itself.
 */
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { parseEml } from '../../services/adapters/src/email/emlParser';
import { parseEmailToRfq } from '../../services/rms/src/parser/emailParser';
import type { InboundEmail } from '../../services/adapters/src/email/emailAdapter';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CORPUS_DIR = path.join(REPO_ROOT, 'tests', 'fixtures', 'corpus');
const MANIFEST = path.join(REPO_ROOT, 'tests', 'fixtures', 'corpus-manifest.json');

const WEIGHT_SENTINEL = 1;
const DEFAULTED_EQUIPMENT = new Set(['TRACTOR', 'FTL', 'VAN']);

export interface Span { start: number; end: number }
export interface Field {
  key: string;
  label: string;
  value: string;
  rule: string;
  /** null means the machine supplied this rather than reading it. */
  evidence: Span | null;
  assumed: boolean;
}
export interface InboxItem {
  id: string;
  from: string;
  fromName: string;
  subject: string;
  receivedAt: string;
  body: string;
  lang: string;
  confidence: number;
  needsHumanReview: boolean;
  status: string;
  hitl: string;
  fields: Field[];
  serviceTypes: string[];
  found: number;
  total: number;
}

/**
 * Find `needle` in `hay`, case- and whitespace-insensitively, and return the
 * range in the ORIGINAL string. Email bodies wrap mid-phrase, so a naive
 * indexOf misses most real matches; this walks a normalised copy while keeping
 * a map back to original offsets.
 */
function locate(hay: string, needle: string): Span | null {
  if (!needle || needle.length < 2) return null;
  const map: number[] = [];
  let norm = '';
  for (let i = 0; i < hay.length; i++) {
    const ch = hay[i]!;
    if (/\s/.test(ch)) {
      if (norm.length > 0 && norm[norm.length - 1] !== ' ') { norm += ' '; map.push(i); }
      continue;
    }
    norm += ch.toLowerCase();
    map.push(i);
  }
  const n = needle.replace(/\s+/g, ' ').trim().toLowerCase();
  const at = norm.indexOf(n);
  if (at < 0) return null;
  const start = map[at]!;
  const endIdx = map[Math.min(at + n.length - 1, map.length - 1)]!;
  return { start, end: endIdx + 1 };
}

/** Try several spellings of the same value; first hit wins. */
function locateAny(hay: string, candidates: (string | undefined)[]): Span | null {
  for (const c of candidates) {
    if (!c) continue;
    const s = locate(hay, c);
    if (s) return s;
  }
  return null;
}

export function buildInbox(limit = 12): InboxItem[] {
  if (!fs.existsSync(MANIFEST) || !fs.existsSync(CORPUS_DIR)) return [];
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as {
    files: { localFile: string; sha256: string; kind: string; language: string | null }[];
  };

  const items: InboxItem[] = [];
  for (const f of manifest.files) {
    const p = path.join(CORPUS_DIR, f.localFile);
    if (!fs.existsSync(p)) continue;
    const buf = fs.readFileSync(p);
    if (createHash('sha256').update(buf).digest('hex') !== f.sha256) continue;

    const e = parseEml(buf.toString('latin1'), { fallbackReceivedAt: '2026-01-01T00:00:00.000Z' });
    const body = e.body.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!body || !e.subject) continue;

    const email: InboundEmail = {
      messageId: e.messageId || `corpus-${f.localFile}`,
      from: e.from,
      to: e.to.length > 0 ? e.to : ['quotes@shipces.com'],
      subject: e.subject,
      body,
      receivedAt: e.receivedAt,
      hasAttachments: e.hasAttachments,
    };
    const res = parseEmailToRfq(email);
    if (!res.ok) continue;

    const rfq = res.value.rfq;
    const stops = [...rfq.shipment.stops].sort((a, b) => a.sequence - b.sequence);
    const pu = stops[0];
    const dr = stops[stops.length - 1];
    const com = rfq.shipment.commodities[0];
    const equip = String(rfq.shipment.equipmentOptions[0]?.equipmentType ?? '');
    const weight = typeof com?.weightLb === 'number' && com.weightLb > WEIGHT_SENTINEL ? com.weightLb : null;
    const date = pu?.timing?.windows?.[0]?.timeStart ?? null;
    const equipReal = rfq.shipment.equipmentOptions.length > 1 || !DEFAULTED_EQUIPMENT.has(equip);

    const mk = (key: string, label: string, value: string | null, rule: string, ev: Span | null): Field => ({
      key, label,
      value: value ?? 'not found',
      rule,
      evidence: value === null ? null : ev,
      assumed: value === null || ev === null,
    });

    const oCity = pu?.location?.city ?? null;
    const dCity = dr?.location?.city ?? null;

    const fields: Field[] = [
      mk('origin', 'Origin', oCity ? [oCity, pu?.location?.state].filter(Boolean).join(', ') : null,
         'D7 location grammar', locateAny(body, [oCity ?? undefined])),
      mk('destination', 'Destination', dCity ? [dCity, dr?.location?.state].filter(Boolean).join(', ') : null,
         'D7 location grammar', locateAny(body, [dCity ?? undefined])),
      mk('equipment', 'Equipment', equipReal ? equip : null, 'D5 smallest-fit',
         locateAny(body, [equip, equip.toLowerCase().replace('_', ' ')])),
      mk('weight', 'Weight', weight ? `${weight.toLocaleString()} lb` : null, 'D3 extraction',
         locateAny(body, weight ? [weight.toLocaleString(), String(weight)] : [])),
      mk('pickupDate', 'Pickup date', date ? date.slice(0, 10) : null, 'D8 urgency',
         locateAny(body, date ? [date.slice(0, 10)] : [])),
      mk('commodity', 'Commodity', com?.description ?? null, 'D3 extraction',
         locateAny(body, [com?.description])),
    ];

    const found = fields.filter((x) => !x.assumed).length;
    const nameMatch = e.from.match(/^"?([^"<]+?)"?\s*</);
    items.push({
      id: `RFQ-${createHash('sha256').update(f.localFile).digest('hex').slice(0, 5).toUpperCase()}`,
      from: e.from.replace(/.*<|>.*/g, '') || e.from,
      fromName: (nameMatch?.[1] ?? e.from.split('@')[0] ?? 'Unknown').trim(),
      subject: e.subject,
      receivedAt: e.receivedAt,
      body,
      lang: rfq.language ?? f.language ?? 'en',
      confidence: rfq.rawExtraction?.overallConfidence ?? 0,
      needsHumanReview: res.value.needsHumanReview,
      status: String(rfq.status),
      hitl: String(rfq.rawExtraction?.hitlReason ?? 'none'),
      fields,
      serviceTypes: (rfq.serviceTypes ?? []).slice(0, 5).map(String),
      found,
      total: fields.length,
    });
  }

  // Stratified sample, then triage order.
  //
  // A pure worst-first cut returns nothing but total misses, because the regex
  // baseline scores 0.05 on most of this corpus. That is the honest headline
  // number but it makes a useless screen: with no successful extraction there is
  // nothing to drill through to. So take the best few AND the worst few, which
  // is also the truthful picture of a real morning's inbox.
  const byConf = [...items].sort((a, b) => b.confidence - a.confidence);
  const wins = byConf.slice(0, Math.ceil(limit / 2));
  const winIds = new Set(wins.map((w) => w.id));
  const misses = byConf.filter((i) => !winIds.has(i.id)).reverse().slice(0, limit - wins.length);
  const sample = [...wins, ...misses];

  // Display order is the Drumkit insight: the operator sees what needs them
  // first, not what arrived last.
  sample.sort((a, b) => {
    if (a.needsHumanReview !== b.needsHumanReview) return a.needsHumanReview ? -1 : 1;
    return a.confidence - b.confidence;
  });
  return sample;
}
