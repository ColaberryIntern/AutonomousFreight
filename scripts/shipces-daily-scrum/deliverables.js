/*
 * ShipCES Autonomous Brokerage - the deliverable model (the PM spine).
 *
 * One source of truth for the daily email report AND the Gantt export, so both
 * speak the same language. That language is deliberately three-in-one:
 *
 *   - PMBOK 8th edition (Brett's own standard): every work stream is a
 *     verifiable DELIVERABLE with ACCEPTANCE CRITERIA, a state on the
 *     verify -> accept chain, linked dependencies, a milestone, and a
 *     Deliverable -> Outcome -> Benefit -> Value line.
 *   - Brett's call ask (2026-07-09): one tangible sentence per work stream, a
 *     definition of success, dependency icons on the bars, and deliverables that
 *     double as the Thursday demo agenda and his sign-off.
 *   - Story-Driven Build (Ali's kit): the AI / Human split, a Given/When/Then
 *     DEMO SCRIPT that doubles as the acceptance test, and a list of tangible
 *     ARTIFACTS (have vs need) Brett can open and point to.
 *
 * No em-dashes or en-dashes anywhere in this file (outgoing-comms rule).
 * Pure data + pure render helpers; no I/O, so it is unit-testable.
 */

const COL = {
  green: '#38a169', blue: '#2b6cb0', amber: '#dd6b20', red: '#e53e3e',
  gray: '#718096', navy: '#1a365d', slate: '#4a5568', bgAlt: '#f7fafc', border: '#e2e8f0',
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const STATE = {
  accepted:   { label: 'Accepted',    color: COL.green, blurb: 'signed off by the client (Validate Scope)' },
  verified:   { label: 'Verified',    color: COL.blue,  blurb: 'correctness confirmed by tests + tsc; pending client acceptance' },
  inprogress: { label: 'In progress', color: COL.amber, blurb: 'work under way' },
  blocked:    { label: 'Blocked',     color: COL.red,   blurb: 'held on a named dependency or client input' },
};

const FLOW = ['SENSE', 'RMS', 'OMS', 'TMS', 'BMS'];

// artifact helper: a(name, have?, where?) -> tangible thing Brett can open.
function a(n, have, where) { return { n, have: !!have, where: where || '' }; }

/*
 * The nine active work streams (+ Phase C), keyed to the daily-scrum list `num`.
 * Each carries a Given/When/Then demoScript (doubles as the demo agenda + the
 * acceptance test) and an artifacts[] list (have = it exists now; need = it must
 * be created). Grounded in the Jul 2 forward-track build + the email-to-invoice demo.
 */
const DELIVERABLES = [
  {
    num: 1, key: 'CADENCE', name: 'Cadence + Weekly Demo Prep', layer: null,
    owner: 'Ali', kind: 'Human', state: 'inprogress',
    deliverable: 'Every Thursday 10:00 CST demo is pre-scoped by a deliverable-anchored status report Brett receives beforehand, so the call runs to an agenda and ends in a sign-off.',
    acceptance: 'A PMBOK-style work-performance report goes out before each call listing the week’s deliverables and acceptance criteria; the demo shows them; Brett approves or requests changes.',
    value: 'Two-way accountability: Brett knows what he is approving each week and the team knows what "done" means.',
    demoScript: 'Given it is the day before a Thursday call; When the delivery report is generated; Then Brett receives a deliverable-anchored agenda; And the demo covers exactly those deliverables and ends in approve or request-changes.',
    artifacts: [
      a('Delivery report (HTML email)', true, 'ShipCES-Delivery-Report-preview.html'),
      a('Delivery Gantt (dependency icons)', true, 'ShipCES-Delivery-Gantt-v2.html'),
      a('One-page weekly demo script / agenda', false, 'per call'),
      a('Recording of the report walkthrough', false, 'Jul 16'),
    ],
    dependsOn: [], feeds: ['all'],
    evidence: 'This report redesign; weekly Thursday cadence confirmed on the Jul 9 call.',
    demo: 'This report itself, sent ahead of each Thursday call as the agenda.',
    milestone: 'Weekly demo (Thu)',
  },
  {
    num: 2, key: 'ARCH', name: 'Architecture + Documentation', layer: null,
    owner: 'Karun', kind: 'AI', state: 'verified',
    deliverable: 'The four-layer RMS/OMS/TMS/BMS architecture is documented as ADRs and canonical contracts a junior developer can follow.',
    acceptance: 'ADR-001 (four-layer + path mapping), ADR-002 (adapter contract), and ADR-003 (canonical RFQ) exist, diagrams match the code, and tsc -b is green across the monorepo.',
    value: 'The build stays coherent and hand-off-able as it grows, so ShipCES is not locked to a single author.',
    demoScript: 'Given the four-layer architecture; When a reviewer opens the ADRs; Then each layer’s decision and path mapping is traceable to code; And tsc -b is green across the monorepo.',
    artifacts: [
      a('ADR-001..003', true, 'docs/adr/'),
      a('Canonical RFQ schema + 3 worked examples', true, 'docs/dat-rfq-payload-*.json'),
      a('C4 / architecture diagram refreshed to match code', false, ''),
      a('Agent map diagram', false, ''),
    ],
    dependsOn: [], feeds: ['all'],
    evidence: 'docs/adr/ADR-001..003; tsc -b --noEmit exit 0.',
    demo: 'The ADR set and the one-line-per-layer architecture map.',
    milestone: 'Gate 1 design review (Karun)',
  },
  {
    num: 3, key: 'RMS', name: 'RMS - Email + RFQ intake (W1)', layer: 'RMS',
    owner: 'Ali + Karun', kind: 'AI', state: 'verified',
    deliverable: 'An inbound broker email becomes one canonical, validated RFQ, with duplicate emails rejected and low-confidence intake routed to a human before any quote goes out.',
    acceptance: 'The same email ingested twice yields exactly one RFQ (no duplicate quote), a vague email routes to human review instead of a bad quote, and Karun’s D1-D33 rules infer the service-type options.',
    value: 'Quote requests stop getting lost or double-handled, so more clean RFQs reach pricing faster.',
    demoScript: 'Given the "URGENT sprinter" email; When it is ingested; Then one canonical RFQ is created (El Paso to Detroit, sprinter, multi-option service types); And re-ingesting the identical email returns the same RFQ with no duplicate.',
    artifacts: [
      a('Deterministic email-to-invoice demo run', true, 'scripts/shipces-demo/forwardTrackDemo.ts'),
      a('Canonical RFQ JSON sample', true, 'docs/dat-rfq-payload-examples.json'),
      a('Parser test report (70 tests)', true, 'tests/unit/rms/'),
      a('60-sec screen recording of email to RFQ', false, ''),
      a('RFQ card one-screen render', false, ''),
    ],
    dependsOn: ['SENSE'], feeds: ['OMS'],
    evidence: '70 unit tests green; tsc clean; D1-D33 Evaluate-Opportunity ported; idempotency + dead-letter proven.',
    demo: 'The URGENT sprinter email parsed live into a canonical RFQ with multi-option service types.',
    milestone: 'Jul 16 forward demo (replicate Karun’s piece)',
  },
  {
    num: 4, key: 'OMS', name: 'OMS - Order staging + tender', layer: 'OMS',
    owner: 'Ali', kind: 'AI', state: 'verified',
    deliverable: 'A won RFQ becomes a staged shipment that walks a guarded lifecycle and emits an EDI-910 load tender to transportation.',
    acceptance: 'The shipment walks RECEIVED to TENDERED, illegal state transitions are rejected, the lose and exception branches behave, and a tender is emitted only from WON.',
    value: 'Every won quote turns into a trackable order automatically, with no order lost between quoting and execution.',
    demoScript: 'Given a won RFQ; When OMS stages and prices it at $2,400 and marks it won; Then the shipment walks RECEIVED to TENDERED; And an EDI-910 tender is emitted only from WON, never from an illegal state.',
    artifacts: [
      a('Demo run OMS stage (staged, priced, won, tendered)', true, 'scripts/shipces-demo/forwardTrackDemo.ts'),
      a('EDI-910 tender payload sample', false, ''),
      a('OMS test report', true, 'tests/unit/oms/'),
      a('Shipment lifecycle state diagram', false, ''),
    ],
    dependsOn: ['RMS'], feeds: ['TMS'],
    evidence: 'OMS unit suite green (happy path to TENDERED, illegal transitions, handoff dedup).',
    demo: 'The RFQ staged, priced at $2,400, won, and tendered as EDI-910.',
    milestone: 'Gate 1 design review (Karun)',
  },
  {
    num: 5, key: 'TMS', name: 'TMS - Transportation lifecycle', layer: 'TMS',
    owner: 'Ali / Jen', kind: 'AI', state: 'verified',
    deliverable: 'A tendered load is sourced on capacity, the carrier is vetted, dispatched, and tracked by EDI-214 milestones through to Delivered.',
    acceptance: 'A carrier is vetted on FMCSA authority + insurance before booking, unknown milestone codes are rejected, exceptions recover, and Delivered is required before billing opens.',
    value: 'Loads move from tender to delivered with carrier vetting and live tracking, without a human babysitting each step.',
    demoScript: 'Given a tendered load; When TMS sources capacity on DAT and vets on FMCSA; Then only carriers with authority + insurance are bookable; And EDI-214 milestones drive state to Delivered before billing opens.',
    artifacts: [
      a('Demo run TMS stage (sourcing, vetting, 214 tracking)', true, 'scripts/shipces-demo/forwardTrackDemo.ts'),
      a('TMS test report', true, 'tests/unit/tms/'),
      a('EDI-214 milestone trace sample', false, ''),
      a('FMCSA vetting result sample', false, ''),
      a('Load tracking screen', false, ''),
    ],
    dependsOn: ['OMS', 'SENSE'], feeds: ['BMS'],
    evidence: 'TMS unit suite green (state walks, FMCSA vetting, exception/recover, 214 milestones, Delivered gate).',
    demo: 'DAT sourcing + FMCSA vetting, then 214 milestones driving state to Delivered.',
    milestone: 'Gate 1 design review (Karun)',
  },
  {
    num: 6, key: 'BMS', name: 'BMS - Billing + invoice', layer: 'BMS',
    owner: 'Brett + Karun', kind: 'AI', state: 'blocked',
    deliverable: 'A delivered shipment produces a line-itemized, EDI-210 customer invoice that fails closed if it cannot be priced.',
    acceptance: 'POD matches the billable shipment, the invoice totals correctly with fuel surcharge and accessorials, and it refuses to issue with no linehaul.',
    value: 'Delivered freight bills itself accurately and on time, protecting margin and cash flow.',
    demoScript: 'Given a delivered shipment with a POD; When BMS runs on fake data; Then invoice AF-INV-0001 is produced (linehaul + 18% fuel + $150 detention = $2,982); And with no linehaul it refuses to issue.',
    artifacts: [
      a('Rendered invoice AF-INV-0001 (HTML/PDF) [flagship]', false, ''),
      a('BMS demo screen on fake data (Jul 16)', false, ''),
      a('BMS test report', true, 'tests/unit/bms/'),
      a('Rate-confirmation template PDF', true, 'docs/shipcs-rate-confirmation-template-v1.pdf'),
      a('Accessorial + FSC model (from Brett walkthrough)', false, 'blocked on Brett'),
    ],
    dependsOn: ['TMS'], feeds: [],
    evidence: 'BMS unit suite green (invoice totals, determinism, fail-closed; POD validate/match). Accessorial/FSC field detail pending Brett’s invoice-anatomy walkthrough.',
    demo: 'Delivered load producing invoice AF-INV-0001 for $2,982 (linehaul + fuel + detention), on fake data.',
    milestone: 'Jul 16 backward demo (BMS on fake data)',
  },
  {
    num: 7, key: 'SENSE', name: 'Sense Layer - Adapters', layer: 'SENSE',
    owner: 'Ali', kind: 'AI', state: 'verified',
    deliverable: 'DAT, FMCSA, Sylectus, and Email are all reachable behind one engine-swappable adapter contract with typed results and retry classification.',
    acceptance: 'Each adapter returns a typed result, DAT flattens to its posting schema, FMCSA authority + insurance gates bookability, Sylectus is post-only, and errors are classified for retry.',
    value: 'We own the brain and rent the senses, so any data source can be swapped or can degrade without touching the core.',
    demoScript: 'Given the four adapters; When each is called through the contract; Then each returns a typed result with a retry classification; And DAT flattens to its posting schema while Sylectus stays post-only.',
    artifacts: [
      a('Adapter contract', true, 'services/adapters/src/contract.ts'),
      a('4 deterministic mock engines', true, 'services/adapters/src/'),
      a('Adapters test report', true, 'tests/unit/adapters/'),
      a('DAT Chrome-extension demo clip', false, ''),
      a('Live DAT sample response (pending API)', false, 'blocked on DAT API'),
    ],
    dependsOn: [], feeds: ['RMS', 'TMS'],
    evidence: 'Adapters unit suite green; 4 deterministic mock engines. Live DAT pending Brett’s API provisioning; Starboard held on Mike’s decision.',
    demo: 'The four adapters behind one contract, plus Karun’s DAT Chrome-extension as the mitigation path.',
    milestone: 'DAT API provisioned (Brett/Jen)',
  },
  {
    num: 8, key: 'GOV', name: 'Governance + Mgmt Integration', layer: 'GOV',
    owner: 'Ali / Ram', kind: 'AI+Human', state: 'verified',
    deliverable: 'Every build ticket passes two named approval gates before it is Accepted, and gated tickets halt for their gatekeeper instead of self-closing.',
    acceptance: 'Gate 1 (Karun, design/doc) clears before Gate 2 (Ram + Ali, scope/contract); a gated ticket posts evidence and stays open; no automated closure of a gated ticket.',
    value: 'Nothing biased or half-built ships to ShipCES, and every acceptance is a real sign-off Brett can point to.',
    demoScript: 'Given a built ticket that names a gate; When it reaches Definition of Done; Then it posts a ready-for-Gate-1 evidence comment and halts for Karun; And no gated ticket is auto-closed.',
    artifacts: [
      a('Approval-gates doc', true, 'docs/approval-gates.md'),
      a('Escalation-protocol doc', true, 'docs/escalation-protocol.md'),
      a('Managing-project integration doc', true, 'docs/managing-project-integration.md'),
      a('Gate-1 review ticket (forward-track build)', true, 'BC 10081574109'),
    ],
    dependsOn: [], feeds: ['all'],
    evidence: 'approval-gates.md, escalation-protocol.md, managing-project-integration.md shipped; closure guardrail enforced.',
    demo: 'The two-gate model and the closure guardrail that leaves built tickets open for Karun.',
    milestone: 'Customer acceptance gates live',
  },
  {
    num: 9, key: 'BACKLOG', name: 'Backlog Audit + Cleanup', layer: null,
    owner: 'Ali', kind: 'Human', state: 'inprogress',
    deliverable: 'The ticket backlog is kept honest, so the open/overdue counts in this report reflect real remaining scope (the WBS 100 percent rule).',
    acceptance: 'No orphan or stale tickets; every open ticket maps to a work stream and a deliverable; overdue items surface on the watch list.',
    value: 'The status report can be trusted because the underlying task list is complete and current.',
    demoScript: 'Given the live Basecamp backlog; When the report is generated; Then every open ticket maps to a work stream and a deliverable; And overdue items surface on the watch list with no orphan or stale tickets.',
    artifacts: [
      a('Per-list work-package table', true, 'on the report'),
      a('Overdue watch list', true, 'on the report'),
      a('Backlog reconciliation pass log', false, ''),
    ],
    dependsOn: [], feeds: ['all'],
    evidence: 'Backlog reconciled against the nine active lists.',
    demo: 'The per-list detail table and the overdue watch list in this report.',
    milestone: 'Continuous',
  },
  {
    num: 'C', key: 'PHASEC', name: 'Phase C - Execution + Billing Polish', layer: null,
    owner: 'TBD', kind: 'AI', state: 'inprogress',
    deliverable: 'Execution polish and billing hardening once the forward and backward tracks meet in the middle.',
    acceptance: 'Forward (RMS to OMS) and backward (BMS) tracks converge on real data with accepted invoices end to end.',
    value: 'The autonomous brokerage runs a real load from email to paid invoice with no manual steps.',
    demoScript: 'Given the forward and backward tracks; When they converge on one real load; Then that load runs email to paid invoice with no manual steps; And the invoice is accepted end to end.',
    artifacts: [
      a('End-to-end real-data run recording', false, ''),
      a('Converged forward + backward demo', false, ''),
    ],
    dependsOn: ['RMS', 'BMS'], feeds: [],
    evidence: 'Planned; opens after the Jul 16 parallel demo.',
    demo: 'Deferred to a later demo.',
    milestone: 'Post Jul 16',
  },
];

const MILESTONES = [
  { on: '2026-07-16', name: 'Weekly demo: forward (replicate Karun’s email piece) + backward (BMS on fake data), in parallel', mandatory: true },
  { on: null, name: 'Gate 1 design review (Karun) of the Jul 2 forward-track build', mandatory: true, note: 'exit criteria: diagrams match code, junior-dev-followable, docs consistent' },
  { on: null, name: 'DAT API provisioned to Colaberry (Brett via Jen), scope verified', mandatory: true, note: 'unblocks live Sense sourcing + the pricing module' },
  { on: null, name: 'Brett sends the PMBOK 8th-edition PDF (password-free copy)', mandatory: false, note: 'agent knowledge base for planning' },
];

// ---- pure render helpers (HTML fragments; email-client-safe, inline styles) ----

function stateMeta(s) { return STATE[s] || STATE.inprogress; }

function stateBadge(s) {
  const m = stateMeta(s);
  return `<span style="background:${m.color};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:9px;white-space:nowrap;">${m.label}</span>`;
}

function kindTag(kind) {
  const isHuman = /Human/.test(kind);
  const isAi = /AI/.test(kind);
  const parts = [];
  if (isAi) parts.push('<span title="AI builds, owner approves" style="font-size:10px;font-weight:700;color:#2b6cb0;">&#129302; AI</span>');
  if (isHuman) parts.push('<span title="a person owns this call" style="font-size:10px;font-weight:700;color:#dd6b20;">&#129485; Human</span>');
  return parts.join(' <span style="color:#cbd5e0;">+</span> ');
}

function nameFor(key) {
  const d = DELIVERABLES.find((x) => x.key === key);
  return d ? (d.layer || d.name.split(' - ')[0]) : key;
}

function depLine(d) {
  const dep = (d.dependsOn || []).filter((k) => k !== 'all');
  const feeds = (d.feeds || []).filter((k) => k !== 'all');
  const feedsAll = (d.feeds || []).includes('all');
  const bits = [];
  if (dep.length) bits.push(`<span style="color:${COL.amber};">&#9203; depends on ${dep.map(nameFor).map(esc).join(', ')}</span>`);
  if (feeds.length) bits.push(`<span style="color:${COL.slate};">feeds ${feeds.map(nameFor).map(esc).join(', ')}</span>`);
  if (feedsAll) bits.push('<span style="color:' + COL.slate + ';">underpins every layer</span>');
  if (!bits.length) bits.push('<span style="color:#a0aec0;">no upstream dependency</span>');
  return bits.join(' <span style="color:#cbd5e0;">&middot;</span> ');
}

// Given/When/Then demo script with the keywords bolded (doubles as the demo agenda).
function renderDemoScript(d) {
  if (!d.demoScript) return '';
  return esc(d.demoScript).replace(/\b(Given|When|Then|And)\b/g, `<b style="color:${COL.navy};">$1</b>`);
}

// Artifact list: green check = exists now (have), amber ring = must be created (need).
function renderArtifacts(d) {
  const arts = d.artifacts || [];
  if (!arts.length) return '<span style="color:#a0aec0;">none listed</span>';
  const items = arts.map((art) => {
    const mark = art.have
      ? `<span style="color:${COL.green};font-weight:700;">&#10003;</span>`
      : `<span style="color:${COL.amber};font-weight:700;">&#9711;</span>`;
    const where = art.where ? ` <span style="color:#a0aec0;">${esc(art.where)}</span>` : '';
    return `<li style="margin-top:2px;">${mark} ${esc(art.n)}${where}</li>`;
  }).join('');
  return `<ul style="margin:4px 0 0;padding-left:2px;list-style:none;">${items}</ul>`;
}

// Report-level rollup: every artifact still to be created (need), grouped by stream.
function renderArtifactBacklog() {
  const rows = [];
  DELIVERABLES.forEach((d) => {
    (d.artifacts || []).filter((art) => !art.have).forEach((art) => {
      rows.push({ layer: d.layer || d.name.split(' - ')[0], name: art.n, owner: d.owner, where: art.where });
    });
  });
  if (!rows.length) return `<div style="font-size:12px;color:${COL.green};">All listed artifacts exist.</div>`;
  const body = rows.map((r, i) => `<tr style="background:${i % 2 ? COL.bgAlt : '#fff'};">
    <td style="padding:5px 8px;border:1px solid ${COL.border};font-weight:700;color:${COL.navy};width:70px;vertical-align:top;">${esc(r.layer)}</td>
    <td style="padding:5px 8px;border:1px solid ${COL.border};vertical-align:top;"><span style="color:${COL.amber};font-weight:700;">&#9711;</span> ${esc(r.name)}${r.where ? ` <span style="color:#a0aec0;">(${esc(r.where)})</span>` : ''}</td>
    <td style="padding:5px 8px;border:1px solid ${COL.border};vertical-align:top;width:110px;">${esc(r.owner)}</td>
  </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:11.5px;">
    <tr><td style="background:${COL.navy};color:#fff;font-weight:700;padding:6px 8px;">Layer</td><td style="background:${COL.navy};color:#fff;font-weight:700;padding:6px 8px;">Artifact to create</td><td style="background:${COL.navy};color:#fff;font-weight:700;padding:6px 8px;">Owner</td></tr>
    ${body}
  </table>`;
}

function renderBirdsEye(listUrlFor) {
  const tiles = FLOW.map((key) => {
    const d = DELIVERABLES.find((x) => x.key === key);
    const m = stateMeta(d.state);
    const dep = (d.dependsOn || []).filter((k) => k !== 'all').length > 0;
    const href = listUrlFor ? listUrlFor(d.num) : '#';
    return `<td style="padding:0 2px;" valign="middle"><a href="${href}" style="display:block;text-decoration:none;background:${m.color};color:#fff;border-radius:8px;padding:10px 8px;text-align:center;min-width:74px;">
      <div style="font-size:12px;font-weight:800;color:#fff;">${dep ? '&#9203; ' : ''}${esc(key)}</div>
      <div style="font-size:9px;color:#fff;opacity:.92;margin-top:2px;">${esc(m.label)}</div>
    </a></td>`;
  });
  const arrow = '<td style="padding:0 1px;color:#a0aec0;font-size:16px;font-weight:700;" valign="middle">&#8594;</td>';
  const row = tiles.join(arrow);
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr>${row}</tr></table>
    <div style="font-size:11px;color:#718096;margin-top:8px;">&#9203; = has an upstream dependency (the bar cannot land until the one before it does). Foundation under all layers: <b>Architecture</b> + <b>Governance gates</b>. Color is the delivery state, not ticket count.</div>`;
}

function renderDemoAgenda(nextDemoPretty) {
  const focus = DELIVERABLES.filter((d) => /Jul 16/.test(d.milestone || ''));
  const rows = focus.map((d) => {
    return `<tr>
      <td style="padding:7px 10px;border:1px solid ${COL.border};vertical-align:top;width:70px;"><b style="color:${COL.navy};">${esc(d.layer || d.key)}</b></td>
      <td style="padding:7px 10px;border:1px solid ${COL.border};vertical-align:top;">${renderDemoScript(d)}</td>
      <td style="padding:7px 10px;border:1px solid ${COL.border};text-align:center;vertical-align:top;">${stateBadge(d.state)}</td>
    </tr>`;
  }).join('');
  return `<div style="font-size:16px;font-weight:800;color:${COL.navy};">This week’s demo = these deliverables</div>
    <div style="font-size:12px;color:#718096;margin:2px 0 10px;">What you will see on ${esc(nextDemoPretty)}, as a Given / When / Then you can check live. Forward and backward tracks run in parallel.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;">${rows}</table>`;
}

function renderDeliverableCards(countsByNum, listUrlFor) {
  countsByNum = countsByNum || {};
  const cards = DELIVERABLES.filter((d) => d.key !== 'PHASEC').map((d) => {
    const m = stateMeta(d.state);
    const c = countsByNum[d.num] || null;
    const href = listUrlFor ? listUrlFor(d.num) : '#';
    const counts = c
      ? `${c.open} open / ${c.done} done${c.overdue ? `, <b style="color:${COL.red};">${c.overdue} overdue</b>` : ''}`
      : '';
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${COL.border};border-left:5px solid ${m.color};border-radius:8px;margin-bottom:12px;background:#fff;">
      <tr><td style="padding:12px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:top;"><a href="${href}" style="color:${COL.navy};text-decoration:none;font-size:14px;font-weight:800;">${esc(d.name)}</a>
            <span style="color:#a0aec0;font-size:11px;">&nbsp; ${esc(d.owner)} &nbsp;</span> ${kindTag(d.kind)}</td>
          <td style="vertical-align:top;text-align:right;white-space:nowrap;">${stateBadge(d.state)}</td>
        </tr></table>
        <div style="font-size:13px;color:${COL.navy};margin-top:8px;font-weight:600;">${esc(d.deliverable)}</div>
        <div style="font-size:12px;color:${COL.slate};margin-top:7px;"><b style="color:${COL.navy};">Accepted when:</b> ${esc(d.acceptance)}</div>
        <div style="font-size:12px;color:${COL.slate};margin-top:5px;"><b style="color:${COL.navy};">Demo:</b> ${renderDemoScript(d)}</div>
        <div style="font-size:12px;color:${COL.slate};margin-top:5px;"><b style="color:${COL.green};">Value:</b> ${esc(d.value)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:7px;"><tr>
          <td style="vertical-align:top;width:50%;padding-right:8px;"><div style="font-size:11.5px;color:${COL.navy};font-weight:700;">Artifacts (things you can point to)</div><div style="font-size:11.5px;color:${COL.slate};">${renderArtifacts(d)}</div></td>
          <td style="vertical-align:top;width:50%;font-size:11px;color:#718096;border-left:1px dashed ${COL.border};padding-left:10px;">${depLine(d)}<div style="margin-top:6px;"><b>Evidence:</b> ${esc(d.evidence)}${counts ? ` <span style="color:#cbd5e0;">&middot;</span> <b>Tickets:</b> ${counts}` : ''}</div></td>
        </tr></table>
      </td></tr>
    </table>`;
  }).join('');
  return cards;
}

function renderMilestones(prettyFn) {
  const rows = MILESTONES.map((mi) => {
    const when = mi.on ? esc(prettyFn ? prettyFn(mi.on) : mi.on) : 'scheduling';
    const flag = mi.mandatory
      ? `<span style="background:${COL.navy};color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;">mandatory</span>`
      : `<span style="background:#edf2f7;color:${COL.slate};font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;">optional</span>`;
    return `<tr>
      <td style="padding:6px 10px;border:1px solid ${COL.border};width:110px;font-weight:700;color:${COL.navy};vertical-align:top;">${when}</td>
      <td style="padding:6px 10px;border:1px solid ${COL.border};vertical-align:top;">${esc(mi.name)}${mi.note ? `<div style="color:#718096;font-size:10.5px;margin-top:2px;">Go/no-go: ${esc(mi.note)}</div>` : ''}</td>
      <td style="padding:6px 10px;border:1px solid ${COL.border};text-align:center;vertical-align:top;">${flag}</td>
    </tr>`;
  }).join('');
  return rows;
}

const PROVENANCE =
  'Structured as a PMBOK 8th-edition work-performance report: each work stream is a verifiable deliverable with acceptance criteria on the verify-to-accept chain, viewed through the Scope, Schedule, Governance, Stakeholders and Risk performance domains, with a Deliverable to Outcome to Benefit to Value line. Each deliverable carries a Given / When / Then demo script and a list of tangible artifacts (have vs need) from the Story-Driven Build kit, plus the AI / Human split. Deliverable statements follow Brett’s standard: one tangible, checkable sentence.';

module.exports = {
  COL, STATE, FLOW, DELIVERABLES, MILESTONES, PROVENANCE,
  esc, stateMeta, stateBadge, kindTag, depLine, nameFor,
  renderDemoScript, renderArtifacts, renderArtifactBacklog,
  renderBirdsEye, renderDemoAgenda, renderDeliverableCards, renderMilestones,
};
