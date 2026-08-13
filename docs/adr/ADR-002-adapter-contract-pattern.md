# ADR-002: Engine-swappable adapter contract for the Sense Layer

- Status: Accepted
- Date: 2026-07-02
- Deciders: Ali, Karun (Gate 1 review pending), Brett (advisory)

## Context

"Own the brain, rent the senses." The system depends on external vendors (DAT,
FMCSA, Sylectus, Email) whose access model and cost vary and change: DAT starts
as a browser-in-session scrape (ToS-safe, operator-attached) and may later
become a paid API; FMCSA is a direct public OpenAPI; Sylectus is post-only via a
UI session with replies arriving out of band. If the core imports vendor SDKs or
scraped-page shapes directly, every vendor change ripples through the core.

## Decision

Every vendor lives behind a typed adapter contract in `services/adapters/src`.
The core imports only the contract interface (for example `DatEngine`,
`FmcsaEngine`), never a vendor SDK. Concrete engines implement the contract:

- A `mock` engine (deterministic, no network) drives unit and integration tests
  so CI never touches a live vendor.
- A real engine (browser-in-session, direct API) implements the same interface
  and drops in with zero core changes.

Every operation returns an `AdapterResult<T>` (never throws across the boundary)
and classifies failures by category (`transient`, `validation`, `auth`,
`external_api`, `internal_bug`) so the caller's retry policy is driven by
category, not string matching. Each carries an `OpMeta` with a correlation id.

## Consequences

- Swapping DAT from scrape to paid API, or FMCSA from free to QCMobile, is a new
  engine file, not a core rewrite.
- Tests are hermetic and deterministic (mock engines, seeded hashing).
- Sylectus deliberately has no reply surface; carrier replies are caught by the
  Email adapter and cross-linked by load id, matching how the vendor behaves.
- We accept writing and maintaining a mock engine per adapter as the price of
  hermetic tests. That is a feature, not overhead.

## Alternatives considered

- Call vendor SDKs directly from OMS/TMS: rejected, couples the core to vendor
  churn and makes CI depend on live external systems.
- One giant vendor client module: rejected, violates one-responsibility and
  makes engine swaps entangled.
