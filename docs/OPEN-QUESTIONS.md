# Corner — Open Questions

Decisions that are **not** settled. Nothing here is resolved; each entry records
the tradeoff, the candidate answers, and when the decision is actually needed.

Rule of this file: never invent a convention silently. If the reference apps do
not answer something, guess, mark the guess `[NEW — proposed]` in
`CONVENTIONS.md`, and log the open question here.

Status values: `OPEN` (no decision), `DECIDED` (record the outcome and date
inline, do not delete the entry).

---

## OQ-001 — ATT prompt timing for Corner

**Status:** OPEN
**Needed by:** before the first TestFlight build. **Not** a scaffold-time decision.
**Depends on:** [OQ-002](#oq-002--whether-corner-needs-att-at-launch-at-all) — if AppsFlyer is deferred, this question is moot.

### What is already settled

Pepta's ATT fix is correct and Corner inherits it (`CONVENTIONS.md` §App Tracking
Transparency). Two properties are not up for debate:

- The prompt is **auth-independent** — it must not sit behind a code path that
  requires a signed-in user.
- The prompt is **foreground-active gated with retry** — iOS silently drops the
  dialog if it is requested before the app is fully active, resolving
  `undetermined` with no UI and no error.

Both came out of a real Guideline 2.1 rejection on Pepta (2026-07-20, 1.0.1 (13)).
Neither is in question here.

### What is open

*When* within a correct implementation the prompt fires. Corner's first-run shape
differs from Pepta's in a way that changes the answer:

- **Pepta**: the user enters an onboarding funnel. There is a natural stretch of
  screens before any payoff, and the prompt can sit in it.
- **Corner**: the user opens a PDF. The value is delivered almost immediately,
  and there is no funnel to hide a prompt inside.

The tradeoff is direct and has no free option:

| Option | App Review risk | Opt-in rate |
|---|---|---|
| Fire on cold start, before any value is delivered | **Lowest** — a reviewer on a fresh install always sees it | **Worst** — the ask lands before the user knows what the app is |
| Fire after first value delivered | Higher — a reviewer who never opens a document never sees it, which is exactly how the Pepta rejection happened | Better — the ask lands in context |

Opt-in rate is not a soft metric here. It determines whether IDFA-based
attribution works at all, which determines whether Meta postbacks are usable,
which is the reason AppsFlyer is in the stack. A technically-correct prompt with
a poor opt-in rate buys the review surface without the attribution.

### Candidate

Fire after the first document opens, with a **pre-prompt** explaining why the
permission is being asked, **but** guaranteed to fire on a fresh install with no
auth and no document opened, provided the app has been foregrounded long enough.

The guarantee is the load-bearing part. It is what separates this from the
pattern that got Pepta rejected: the deferred path is the common case, and the
unconditional timer is the backstop that ensures a reviewer who only launches the
app and puts it down still sees the dialog. If the candidate is adopted, the
backstop needs a defined threshold and its own test, in the same style as
`attPrompt.test.ts` — the existing test drives the suppression-and-retry path
through injected collaborators, so a time-based backstop must be injectable too
rather than reaching for a real timer.

### Open sub-questions if the candidate is taken

- What is the backstop threshold, and is it wall-clock foreground time or
  session count?
- Does the pre-prompt suppress the real dialog if declined, or is it purely
  explanatory? A pre-prompt that can permanently prevent the system dialog
  reintroduces the reviewer-never-sees-it failure.
- Does opening a document from a share intent or file handler count as
  "first document opened"?

---

## OQ-002 — Whether Corner needs ATT at launch at all

**Status:** OPEN
**Needed by:** before AppsFlyer is wired, because it decides whether it is wired.
**Blocks:** [OQ-001](#oq-001--att-prompt-timing-for-corner).

### Framing

ATT is not required by Corner's own feature set. It is required *only* because
AppsFlyer wants IDFA. Remove the IDFA dependency and the entire ATT surface —
prompt timing, the rejection risk, the usage-description string, and the tracking
section of the privacy label — leaves the day-one review surface.

So the real question is upstream of OQ-001: does Corner ship with paid
acquisition on day one?

### Both sides

**Defer AppsFlyer.**

- Removes ATT from the review surface entirely. No prompt, no timing question, no
  repeat of the Guideline 2.1 failure mode on a first submission.
- Simplifies the App Privacy label: no "Data Used to Track You" section, which is
  the section that requires the most care to fill in correctly.
- Less first-submission surface generally, which matters most on a first
  submission where the app has no review history.

**Ship AppsFlyer now.**

- Attribution has no backfill. Installs that happen before the SDK is integrated
  are permanently unattributed, so the first paid campaign runs without a clean
  organic baseline to measure lift against.
- Integrating later means shipping ATT into an app that already has users, where
  the prompt arrives on an update rather than on a fresh install — a different
  and less-tested path than the one Pepta's implementation was built for.

### Constraint if AppsFlyer is scaffolded now

Not a decision, a condition on one of the outcomes: if AppsFlyer is scaffolded
before this is settled, it must sit **behind a flag that can ship off**. Off must
mean the SDK does not initialise and the ATT prompt does not fire — not merely
that events are dropped after the fact. A flag that still triggers the permission
dialog does not remove the review surface and therefore does not buy anything
this question is asking for.

Note that this interacts with the analytics fan-out in `CONVENTIONS.md`:
`funnelEvents.ts` is the single fan-out point to both AppsFlyer and PostHog, and
`posthogFanOut.test.ts` asserts a broken PostHog cannot break the AppsFlyer send.
The inverse needs to hold too — a disabled AppsFlyer must not break the PostHog
send, and PostHog carries no IDFA dependency, so product analytics should be
unaffected by whichever way this lands.

### What this does not decide

Whether Corner uses PostHog. It does — that is settled in `CONVENTIONS.md` and is
independent of IDFA and ATT.

---

## Backlog not yet migrated

`CONVENTIONS.md` §"Conventions absent from both references" carries a list of
`[NEW — proposed]` items accepted at the Phase 0 gate (job queue, vector search,
quotas, provider interfaces, R2, retention, sepia theme, and others). Those are
approved directions rather than open questions, but any that turn out to need a
real decision should be promoted into this file as they are hit.
