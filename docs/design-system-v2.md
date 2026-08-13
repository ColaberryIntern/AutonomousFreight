# Design System v2: the Autonomy Cockpit

Status: proposed, 2026-08-06. Supersedes the ad-hoc tokens in
`services/web/src/styles.ts`. Reference implementation:
`scripts/design/buildDesignReference.ts` renders the whole system as one page.

---

## 1. What the competition actually does

Researched 2026-08-06 against the platforms ShipCES and our buyers already know.
Marketing pages describe features, not pixels, so this is an information
architecture and interaction read, not a pixel teardown. Sources at the bottom.

| Product | Its bet | What is worth taking |
|---|---|---|
| **Rose Rocket** | Configurable boards + three named AI agents (Rocky, TED, Rosie) driven by plain-language commands, no-code WHEN/THEN workflow builder | Reviewers call it *"Apple-esque, beautiful to look at, but it directs the eyes where they need to be."* Color-coded rows carry operational meaning (*"every row that's red is delivering today"*). Agents are named and personified, not a checkbox called "AI". |
| **Alvys** | One window for carrier + broker ops | *"At-a-glance status buttons"*; alerts pull the loads that need attention to the top instead of making you hunt |
| **Turvo** | Multi-party collaboration | *"Consumer-grade UI/UX"* as an explicit goal; *"google-like search"* as the primary navigation, not a nav tree |
| **Vooma** | AI agents over inbox, phone, text | The **autonomy ladder**: copilot, auto-draft, or fully autonomous, chosen per workflow. Exception-first review: agents work overnight and *"hand reps a short list of real exceptions."* |
| **McLeod LoadMaster** | The incumbent, roots in the 1980s | What to avoid. Reviewers: interface *"very outdated"*, *"steep learning curve"*, *"intimidating"*, needs a *"trained key user"* for internal help desk. |

**The evaluation principle we should design against**, from a 2026 buyer guide:
> "A polished dashboard should not outweigh a broken quote-to-cash path."

Buyers evaluate by driving one load from quote through settlement. Our RMS to OMS
to TMS to BMS forward track **is** that path. The IA should be that path, so the
demo script and the navigation are the same thing.

## 2. The gap nobody fills

Every AI-native competitor sells autonomy. **Not one of them documents how the
operator sees why the machine decided what it decided.** Across Rose Rocket,
Vooma, Alvys and Turvo, the published material has no confidence display, no
decision transparency, no approval or audit surface. Vooma's own model is "here
is a short list of exceptions" with the reasoning left off-screen.

That is the wedge, and it is not a marketing wedge, it is the actual adoption
blocker. A broker will not let software quote unattended until they can see why
it wants to. We already compute everything needed: `overallConfidence`, the D4
validator diagnostic, D6 firing rules with citations, D14 HITL routing reasons,
the audit trail, and the two-gate approval model.

**So the design thesis is one sentence: we show our work.**

Three patterns carry it, and they are the only genuinely novel things here.
Everything else is competent table stakes borrowed from the list above.

### 2.1 The Reason Strip

Every autonomous decision renders with its evidence attached, inline, never
behind a click:

- **a confidence meter**, on the same ordinal ramp everywhere so 0.9 always looks
  like 0.9
- **the rule that fired**, cited (`D6.3`, `D4 must-have`, `D14`), because a cited
  rule is auditable and a vibe is not
- **the evidence span**, the literal text from the customer email that produced
  the value, so an operator verifies by reading, not by trusting

A field with no evidence span is a field the machine invented, and it renders
differently. This is what makes the 1 lb weight sentinel visible instead of
silent.

### 2.2 The Autonomy Ladder

Vooma's copilot / auto-draft / autonomous, taken further: **per agent**, visible
on one screen, with the graduation criteria stated.

| Rung | The agent may | Shown as |
|---|---|---|
| **Suggest** | propose, never write | outline chip |
| **Draft** | prepare, a human sends | half-filled chip |
| **Act** | execute inside stated limits | solid chip + the limit |

Every rung shows its promotion criterion ("Act at 95% agreement over 200 quotes";
currently 34.3% over 35). An operator can always see what the machine is allowed
to do and what it would have to earn to do more. Nobody ships this.

### 2.3 Exception-first, with the why

Steal Vooma's short list of real exceptions. Add the reason, the confidence, and
a one-keystroke approve or override. The queue is the home screen, because on a
good day an autonomous system's home screen should be nearly empty, and an empty
queue is a feature, not a blank state to apologise for.

## 3. Tokens

All values validated with the dataviz validator, not chosen by eye. Both modes
are selected, not auto-flipped.

### Pipeline ramp (RMS to OMS to TMS to BMS)

The four layers are **ordered stages, not categories**, so they take a single-hue
ordinal ramp. Intensity increases with progress through quote-to-cash. This is
semantically truer than four arbitrary hues and it sidesteps the four-slot
colorblindness cap that a categorical set would hit.

| Stage | Light | Dark |
|---|---|---|
| RMS | `#86b6ef` | `#184f95` |
| OMS | `#5598e7` | `#256abf` |
| TMS | `#2a78d6` | `#3987e5` |
| BMS | `#1c5cab` | `#6da7ec` |

Validator: monotone lightness, adjacent ΔL ≥ 0.06, light end clears the surface,
single hue (3° spread). ALL PASS in both modes.

### Status

Reserved, never reused for a series. **Always glyph + label**, never color alone.
Badges use a tinted surface with same-family dark ink so text clears contrast
even where the raw hue does not.

| Role | Ink (light) | Ink (dark) |
|---|---|---|
| good / auto-cleared | `#0a7a37` | `#4ade80` |
| attention / needs a human | `#8a5a00` | `#fbbf24` |
| blocked / failed closed | `#a32020` | `#f87171` |
| idle / not applicable | `#64748b` | `#8b98a9` |

Note: the project's existing `--color-secondary` red `#e53e3e` and
`--color-accent` amber `#dd6b20` measure ΔE 9.2 for **normal** vision, under the
15 floor. They are hard to tell apart before colorblindness enters the picture.
They must never appear as adjacent states. Fixed here by replacing both.

### Surfaces, ink, geometry

| Role | Light | Dark |
|---|---|---|
| page plane | `#f4f6f9` | `#0f1319` |
| surface | `#ffffff` | `#171c24` |
| raised | `#fbfcfd` | `#1e242e` |
| hairline | `#e3e8ef` | `#2a323e` |
| ink primary | `#0f1729` | `#e8eef6` |
| ink secondary | `#4a5568` | `#a7b3c4` |
| ink muted | `#7b8794` | `#7b8794` |

Radius 10 cards / 6 controls / 4 badges. Hairlines 1px, low contrast; the grid
recedes so data leads. Type: 13px data, 15px prose, tabular numerals on every
figure. Row height 38px, dense enough for a working board, loose enough to scan.

## 4. Rules

1. **Quote-to-cash is the navigation.** The primary nav is the forward track, not
   a feature list. A buyer's demo script and our IA are the same object.
2. **Confidence is never a bare number.** It is a meter on the shared ramp plus a
   cited rule plus an evidence span.
3. **An invented value must look invented.** Defaults and fallbacks render in
   muted ink with a dashed underline and the word "assumed". The 1 lb weight
   sentinel is the worked example of what goes wrong otherwise.
4. **Status is glyph plus label plus color, in that order of importance.** Remove
   the color and the screen still works.
5. **Every autonomous action is reversible from where it is shown.** Override
   lives next to the decision, not in a settings page.
6. **Empty is a success state.** An empty exception queue gets a confident empty
   state, never a spinner or an apology.
7. **Dark mode is selected, not flipped.** Both palettes are validated against
   their own surface.

## Sources

- [Best Freight Broker Software: 11 Platforms Compared (2026), ARK TMS](https://arktms.com/blog/best-tms-platforms-freight-brokers-2026)
- [Rose Rocket](https://www.roserocket.com/)
- [Alvys](https://alvys.com/)
- [Turvo](https://turvo.com/)
- [Vooma Quote](https://www.vooma.com/solutions/quote)
- [How Vooma Works for Freight Brokers (2026)](https://www.isometrik.ai/blog/how-vooma-works-for-freight-brokers/)
- [LoadMaster reviews, Capterra](https://www.capterra.com/p/16847/LoadMaster/reviews/)
- [McLeod LoadMaster pros and cons, Software Connect](https://softwareconnect.com/reviews/mcleod-loadmaster/)
