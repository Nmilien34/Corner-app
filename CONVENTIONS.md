# Corner Reference Conventions

Phase 0 reconnaissance for Corner PDF Editor & PDF Reader. No Corner scaffold code existed when this document was written. This revision corrects the reference audit against the authoritative clones on 2026-08-28.

## How decisions are made

- Authoritative Pepta: `/Users/roadto1million/Developer/Pepta` (`a8bb0f726c56d72e6a5faa28e8463bfbae20bd6c`, 2026-08-28, `Release: build 46 (1.0.9) — the App Review resubmission`). A fresh `git fetch origin` showed `HEAD == origin/main` with divergence `0 0`.
- Authoritative Leanient: `/Users/roadto1million/Desktop/Programing/Repos/BoltzmanLab/Leanient` (`699e67278297b507da4c468c974da87eeed3a3bc`, 2026-07-15, `Enhance SubscriptionScreen and RevenueCat service for improved subscription management`). A fresh `git fetch origin` also showed `HEAD == origin/main` with divergence `0 0`; no second Leanient clone was found under `/Users/roadto1million` within the inspected search depth.
- Neither worktree was clean, so provenance was checked before relying on it. Pepta's tracked modification is confined to `pepta-frontend/design-lab/` and does not overlap the audited runtime. Leanient's local `App.tsx`/config changes were diffed against `699e672`; the cited onboarding switcher, bundle identifier, dependencies, API client, theme, and Render evidence were verified from `HEAD`, and the local diffs do not reverse those conclusions.
- The former Desktop Pepta peer, now named `Pepta-stale-unuse`, is excluded. The first revision incorrectly inspected that stale clone at `d055846`; no conclusion in this revision relies on it.
- Paths below use `$PEPTA` for `/Users/roadto1million/Developer/Pepta` and `$LEANIENT` for `/Users/roadto1million/Desktop/Programing/Repos/BoltzmanLab/Leanient`.
- Recency tie-break: Pepta is newer at `a8bb0f7` (2026-08-28), including the Aug 21 payment/access remediation and Aug 26 PostHog work; Leanient remains at `699e672` (2026-07-15).
- `[ADOPTED]` means the pattern exists in both repositories, or Pepta supplies the newer pattern when they disagree.
- `[NEW — proposed]` means neither repository supplies a complete convention. These items require acceptance at the Phase 0 gate.
- Repository source and checked-in configuration are treated as stronger evidence than prose in a reference repository.

## Executive decision ledger

| Area | Corner convention | Evidence |
|---|---|---|
| Repository layout | `[ADOPTED]` Root npm workspace with `corner-frontend/`, `corner-backend/`, and `shared/`. Do not add a nested `corner-app/` directory. | `$LEANIENT/package.json`, `$PEPTA/package.json` |
| Frontend | `[ADOPTED]` Expo SDK 54, React Native 0.81.5, React Navigation 7, TypeScript, `src/` layout. | Both frontend `package.json` files; `$PEPTA/pepta-frontend/src/navigation/MainTabs.tsx` |
| Navigation | `[ADOPTED]` React Navigation native stack plus bottom tabs. Expo Router is not used. | `$PEPTA/pepta-frontend/src/navigation/MainTabs.tsx` |
| Shared contracts | `[ADOPTED]` A third npm workspace, `@corner/shared`, owns Zod request/response schemas, constants, and TypeScript types used by both packages. | `$PEPTA/shared/src/index.ts`, `$PEPTA/shared/src/schemas/index.ts` |
| Frontend state | `[ADOPTED]` React Context providers and exported `use...` hooks. No Zustand, Redux, or React Query. | `$PEPTA/pepta-frontend/src/context/` |
| Frontend API | `[ADOPTED]` Pepta's typed `fetch` client: shared Zod contracts, 15-second timeout, one retry for transient GET failures only, bearer token injection, centralized 401 logout, and a distinct parse-failure type for successful writes with malformed responses. | `$PEPTA/pepta-frontend/src/services/api.ts`, `src/services/apiError.ts` |
| Backend | `[ADOPTED]` Node 20+, Express 5, Mongoose 8, Zod 3, TypeScript compiled to CommonJS. | Root/backend package manifests and `tsconfig.base.json` in both repositories |
| Backend organization | `[ADOPTED]` Thin route modules with validation and handlers, domain services, Mongoose models, cross-cutting middleware, and no separate controllers directory. | Both backend `src/` trees |
| Backend bootstrap | `[ADOPTED]` Pepta's split `src/app.ts` app factory and `src/index.ts` process entry. | `$PEPTA/pepta-backend/src/app.ts`, `$PEPTA/pepta-backend/src/index.ts` |
| Error contract | `[ADOPTED]` Success `{ data: ... }`; failure `{ error: { code, message, details? } }`; `AppError`, async wrapper, 404 middleware, central error middleware. | `$PEPTA/pepta-backend/src/lib/responses.ts`, `src/lib/errors.ts`, `src/middleware/error.middleware.ts` |
| Logging | `[ADOPTED]` Pino structured JSON, ISO timestamps, service base field, request UUID propagation through `x-request-id`. | `$PEPTA/pepta-backend/src/lib/logger.ts`, `src/middleware/request-logger.middleware.ts` |
| RevenueCat and access | `[ADOPTED]` Pepta's server-authoritative, multi-source access projection; evidence-gated RevenueCat reconciliation; user-ID linking; bounded renewal and post-purchase grace; and fail-closed premium middleware. | `$PEPTA/pepta-backend/src/services/access-decision.service.ts`, `src/services/entitlement-reconciler.service.ts`, `src/middleware/require-active-access.ts`; frontend `src/context/AccessContext.tsx`, `src/services/purchaseGrace.ts` |
| Payments/webhook | `[ADOPTED]` Timing-safe shared-secret verification, a state-changing event whitelist, retry-safe receipt-last processing, transfer isolation, and durable transaction-bearing receipts retained without a local user link after deletion. | `$PEPTA/pepta-backend/src/routes/revenuecat.routes.ts`, `src/services/revenuecat.service.ts`, `src/models/cache.model.ts` |
| Analytics | `[ADOPTED]` Pepta's dual-destination wrapper: AppsFlyer remains the attribution backbone and PostHog is the product-analytics/session-replay destination. Both receive the same lower `snake_case` events; PostHog failures never block app/auth flows and replay ships disabled unless explicitly enabled with masking. | `$PEPTA/pepta-frontend/src/services/appsflyer.ts`, `src/services/funnelEvents.ts`, `src/services/posthog.ts`, `src/components/MaskedHealthValue.tsx` |
| Background work | `[NEW — proposed]` MongoDB-backed generic job collection and separate worker. Neither reference has Redis or a general queue. Pepta does provide a useful Mongo lease/retry precedent for one cleanup concern. | `$PEPTA/pepta-backend/src/models/complimentary-access-cleanup.model.ts`, `src/services/complimentary-access-cleanup.scheduler.ts` |
| Render | Use the Leanient-only root `render.yaml` workspace build/start pattern, extended with a worker service. Pepta has no checked-in Render manifest. | `$LEANIENT/render.yaml` |

### Re-verification of Pepta-newer tie-breaks

| Disagreement | Result against authoritative Pepta `a8bb0f7` |
|---|---|
| Direct root workspaces vs nested app directory | Unchanged: Pepta still declares `shared`, `pepta-backend`, and `pepta-frontend` as root npm workspaces. |
| Marketing/design tracking | Conclusion **corrected at the Phase 0 gate**: Pepta ignores root `marketing/`, has no root `design/`, and tracks a separately named frontend `design-lab`. Corner tracks `design/` and ignores `marketing/`; the earlier "ignore both" reading was wrong. |
| Navigation and onboarding composition | Unchanged: Pepta still provides the stronger native-stack plus bottom-tabs precedent. |
| Frontend import alias | Unchanged: Pepta still uses relative app imports plus the shared workspace; Leanient's `@/` alias is not adopted. |
| Axios vs typed `fetch` | Conclusion unchanged, evidence strengthened: Pepta still owns the selected typed-fetch/GET-only-retry pattern and now separates accepted-write response parse failures from retryable transport failures. |
| Static vs provider-driven theme | Unchanged: Pepta still has the newer modular `ThemeProvider` token system. |
| Bundle identifier suffix | Unchanged: the repositories still disagree; Corner's explicit `ai.boltzman.corner` remains a proposed product choice. |
| Backend dependency versions | Corrected drift: current Pepta uses Mongoose `^8.24.4`, while Leanient remains at `^8.14.0`; Corner now explicitly selects the current Pepta baseline. |
| Backend app entry and filename style | Unchanged: Pepta still supplies the split app/process entry and predominant kebab-case backend naming. Neither live source tree has controllers. |
| Expo/EAS release config | Extended from current Pepta: retain the production build precedent and add its production update channel/runtime-version shape once Corner has project IDs. |
| Render manifest | Unchanged: only Leanient has `render.yaml`; there is still no Pepta manifest to prefer. |
| RevenueCat client, access, webhook, and payment handling | Materially superseded by the Aug 21 remediation; the corrected conventions are documented in the dedicated sections below. |
| Analytics | Materially changed: current Pepta has PostHog behind the AppsFlyer fan-out wrapper, so the first revision's AppsFlyer-only decision was wrong. |

## Repository layout

### What the references actually do

Both applications put their three npm workspaces directly at the repository root:

```text
Leanient/
├── leanient-backend/
├── leanient-frontend/
├── shared/
├── docs/
├── design/
├── marketing/
├── package.json
├── package-lock.json
├── tsconfig.base.json
├── eslint.config.mjs
├── .env.example
└── README.md

Pepta/
├── pepta-backend/
├── pepta-frontend/
├── shared/
├── docs/
├── marketing/
├── package.json
├── package-lock.json
├── tsconfig.base.json
├── eslint.config.mjs
├── .env.example
└── README.md
```

The root `package.json` in each repo declares npm workspaces for `shared`, the backend, and the frontend. Both roots contain a README and package manifest. Neither uses a nested project folder or a separate workspace format such as pnpm, Yarn, Nx, or Turborepo.

**Corner decision:** `[ADOPTED]` use `corner-backend/`, `corner-frontend/`, and `shared/` directly under `Corner-app/`. This overrides the brief's expected `corner-app/frontend` nesting because both references agree on the direct workspace layout.

### Marketing and design disagreement

- Leanient's root `.gitignore` does **not** ignore `design/` or `marketing/`; both contain many tracked files (`git ls-files design marketing`).
- Pepta ignores root `marketing/` and has an ignored on-disk marketing directory. It has no root `design/` directory or root `design/` ignore rule; current design work lives under the separately named, tracked `pepta-frontend/design-lab/` tree.
- Therefore the expectation that both folders are untracked in both references is not borne out by the repositories.

**Corner decision:** `[NEW — proposed]` **track `design/`, ignore `marketing/`.** Create both on disk: `design/README.md` is tracked, `marketing/README.md` is ignored along with the rest of that directory.

This deliberately departs from the original brief, which specified that both folders be untracked. The split is the better rule because the two directories hold different kinds of content: design output is small, diffable, and worth having history on, so losing its provenance costs more than it saves; marketing is heavy binaries — renders, video, store assets — which bloat the object store permanently and are recoverable from their sources. Ignoring both would have thrown away the half that benefits from version control in order to solve a problem only the other half has.

The result is closest to Leanient, which tracks `design/`, rather than a mirror of either reference: Leanient also tracks `marketing/`, and Pepta has no root `design/` at all.

### Environment files

Neither repo uses `.env.development` or `.env.production`.

- Leanient has five env-named files in the inspected tree: tracked templates at `.env.example`, `leanient-backend/.env.example`, and `leanient-frontend/.env.example`, plus ignored local files at `.env` and `leanient-frontend/.env`.
- Pepta also has five env-named files: tracked templates at `.env.example` and `pepta-frontend/.env.example`, plus ignored local files at `.env`, `.env.backup-2026-07-27`, and `pepta-frontend/.env`. There is no backend-local template.
- Both backend env loaders first call `dotenv.config()` for the current working directory, then backfill from the repository-root `.env`; see each backend's `src/config/env.ts`.
- Expo public keys use the `EXPO_PUBLIC_` prefix. Server-only keys stay unprefixed.
- Pepta's runtime env schema still contains server keys absent from its root example, including `REVENUECAT_SECRET_API_KEY`. Its frontend template includes the PostHog API key/host but omits the `EXPO_PUBLIC_POSTHOG_SESSION_REPLAY` opt-in read by the app, so neither example is a completeness precedent.

**Corner decision:** `[ADOPTED with hardening]` keep one tracked root `.env.example`, allow a root ignored `.env`, and make the root template the canonical complete inventory. Package-local examples may be generated as scoped conveniences only if they remain complete for their package. Every `process.env` key must be represented in the root template with a comment.

### Gitignore baseline

Both ignore `.env*` except `.env.example`, `node_modules/`, `dist/`, `.expo/`, and coverage output. Additional useful patterns include build output, native build artifacts, logs, `.DS_Store`, editor folders, and worktrees. Corner should combine the superset, then add a single explicit `marketing/` ignore rule. `design/` gets no ignore rule at all — it is tracked. Note the consequence for the two READMEs: `design/README.md` is committed normally, while `marketing/README.md` falls under the directory ignore and therefore exists on disk for humans only. That is intended; do not add a `!marketing/README.md` negation to force it into the index.

## Frontend conventions

### Framework and navigation

- Both use Expo SDK `^54.0.0`, React `19.1.0`, React Native `0.81.5`, and TypeScript `~5.9.2`.
- Both use React Navigation, not Expo Router. There is no file-based `app/` route tree.
- Pepta uses `@react-navigation/native`, `@react-navigation/bottom-tabs`, and `@react-navigation/native-stack` and composes a root stack around bottom tabs in `pepta-frontend/src/navigation/MainTabs.tsx`.
- Leanient's main navigation uses bottom tabs, while onboarding still has a manual state switcher in `leanient-frontend/App.tsx`.

**Corner decision:** `[ADOPTED]` use Pepta's real native-stack plus bottom-tabs structure for all navigation, including onboarding and modal flows. Place navigation definitions in `corner-frontend/src/navigation/` and screens in `src/screens/<area>/`.

### TypeScript and imports

- Both inherit strict TypeScript settings from root `tsconfig.base.json`.
- Pepta also enables `noImplicitOverride` and `noUncheckedIndexedAccess`; its frontend explicitly sets `strict: true`.
- Leanient defines a frontend `@/* -> src/*` path alias and shared-package paths. Pepta has no app-local path alias and imports relatively, while consuming `@pepta/shared` through the npm workspace.

**Corner decision:** `[ADOPTED]` use Pepta's stricter compiler settings, relative frontend imports, and the `@corner/shared` workspace package. Do not introduce an `@/` alias.

### Source folders

Both use a `src/` directory. The newer Pepta frontend contains:

```text
src/
├── components/
│   └── onboarding/
├── context/
├── data/
├── mocks/
├── navigation/
├── screens/
│   ├── access/
│   ├── app/
│   ├── auth/
│   └── onboarding/
├── services/
├── tests/
├── theme/
├── types/
└── utils/
```

Assets live in the frontend-root `assets/` directory. Pepta now has `src/types/assets.d.ts` for asset module declarations. Neither reference has dedicated `api/`, `hooks/`, or `store/` folders. Cross-package domain types still live in `shared/src/types/`; most frontend-only types are colocated with their owning module.

**Corner decision:** `[ADOPTED]` preserve `components`, `context`, `navigation`, `screens`, `services`, `tests`, `theme`, and `utils`. `[NEW — proposed]` add domain-organized component subfolders and dedicated custom hooks only where Corner's large navigation and reader/player APIs need them. Use `context/`, not a Zustand-style `store/`. Keep transport contracts in `shared/`.

### State management

- Both apps use React Context with provider components and `use...` access hooks.
- Pepta examples include `AuthContext`, `AccessContext`, `PeptaDataContext`, `OnboardingContext`, `LogSheetsContext`, and `PepChatContext`.
- Session persistence uses AsyncStorage. There is no Zustand, Redux, TanStack Query, or React Query dependency.

**Corner decision:** `[ADOPTED]` create focused Context providers for session, document library, active reader, player, action items, and entitlement/quota state. Keep each context behind a hook and avoid one global monolith.

### Theme

- Leanient keeps static token modules in `leanient-frontend/src/theme/tokens.ts`, `inkTokens.ts`, and `fonts.ts`.
- Pepta has the more developed convention: `ThemeProvider.tsx` plus separate `colors.ts`, `fonts.ts`, `motion.ts`, `shadows.ts`, `spacing.ts`, and `typography.ts`, re-exported from `theme/index.ts`.
- Pepta supports light/dark mode through the provider. Neither reference has a sepia reading theme.

**Corner decision:** `[ADOPTED]` mirror Pepta's modular token files and barrel import. `[NEW — proposed]` extend its theme-mode union with sepia for document reading.

### API client and contracts

The references disagree:

- Leanient uses Axios in `leanient-frontend/src/services/api.service.ts`, reads the token from AsyncStorage in a request interceptor, applies a 15-second timeout, clears auth on 401, and has no retry behavior.
- Pepta uses a typed `fetch` class in `pepta-frontend/src/services/api.ts`. It holds the hydrated token in memory, injects `Authorization: Bearer ...`, aborts at 15 seconds, clears session through a registered 401 callback, and retries a transient failed GET exactly once after 400 ms. Mutating requests are never retried.
- Pepta distinguishes a successful HTTP write whose response cannot be parsed with `ResponseParseError`; its mutation outbox treats that as accepted rather than blindly retrying a possibly committed write.
- Both validate response payloads with Zod contracts from the shared workspace. Success uses `{ data }`; errors use `{ error: { code, message, details? } }`.

**Corner decision:** `[ADOPTED]` use Pepta's fetch pattern, including trailing-slash normalization in `src/config.ts`, GET-only retry, response-envelope parsing, and a typed `ApiError`. Store the session token through the session context. Corner's secure-token requirement means replacing AsyncStorage token persistence with secure storage while retaining the same in-memory client interface; this is `[NEW — proposed]` because neither reference does it.

### RevenueCat client and purchase flow

Pepta is the newer and more complete pattern:

- `src/services/revenueCat.ts` owns configuration, backend-user identification, offering lookup, per-package trial eligibility, purchase, restore, logout, and active-entitlement checks.
- It uses entitlement ID `pro`, prefers `offerings.current`, and falls back to the `default` offering. Monthly/yearly pricing and trial copy come from StoreKit/RevenueCat package data, not hard-coded entitlement claims.
- Purchase and restore return success only when `customerInfo.entitlements.active.pro` is actually active; the paywall does not fabricate local premium state.
- After RevenueCat identification or a confirmed purchase, the frontend posts the SDK's current app-user ID to `/me/access/link`. That gives the server evidence to recover a purchase whose webhook used a device/alias ID it could not yet associate.
- A confirmed purchase/restore opens a persisted, user-scoped 30-minute grace while the backend link/reconciliation catches up. It is cleared when backend access becomes active and on logout, and cannot be opened by merely viewing the paywall.
- Subscriber attributes are limited to billing-support identity such as email/display name; the paywall includes renewal disclosures, StoreKit-derived prices, terms/privacy links, visible offering failures, retry, and sign-out recovery.

**Corner decision:** `[ADOPTED]` preserve the provider-agnostic app shell around `revenueCat`, identify with Corner's backend user ID, link the SDK customer ID to server truth, require the actual entitlement after purchase/restore, and allow only a short user-scoped grace after SDK-confirmed success. Anonymous device accounts replace the references' social-auth entry flow.

### Entitlement authority and premium gating

The Aug 21 remediation supersedes the simpler pattern in the first revision:

- `access-decision.service.ts` is the single access authority. It computes an effective projection across RevenueCat/App Store and promotional sources rather than allowing the last webhook to overwrite all access.
- RevenueCat reconciliation is evidence-gated because the provider's subscriber GET can create a customer on read. Only a stored usable customer ID, linked SDK ID, or other purchase evidence permits that remote lookup; anonymous placeholder IDs are rejected.
- A renewing paid source gets a bounded 24-hour verification grace after its known period end. Promotional/non-renewing access does not. Reconciliation failure becomes `temporarily_unavailable`, never a false `inactive` downgrade.
- `requireActiveAccess` reads persisted access first, accepts active access or bounded cached/grace state, returns 503 when verification is unavailable without usable cached proof, and returns 403 only for a positive inactive decision. Production validates the RevenueCat server key rather than silently operating with an unset integration.
- Frontend `AccessContext` refreshes server truth on foreground and known expiry. `AccessGate` sends users to the paywall only on a positive inactive state, while honoring the narrowly scoped post-purchase grace above.

**Corner decision:** `[ADOPTED]` make the backend projection authoritative; merge all access sources; distinguish inactive from temporarily unverifiable; evidence-gate provider reads; use bounded renewal and confirmed-purchase grace; and fail closed for premium API work when neither current nor cached proof exists.

### Analytics

Current Pepta commit `e22a330` added PostHog and `5310aef` completed its replay-masking pass:

- AppsFlyer remains the attribution backbone. PostHog is the second destination for product analytics and optional session replay.
- `src/services/funnelEvents.ts` is the single fan-out point. It sends the same lower `snake_case` event name and string properties to AppsFlyer and PostHog; tracking call sites do not know about either provider.
- Analytics is fire-and-forget. PostHog initialization, capture, identify, and reset swallow provider failures, and authentication side effects have a bounded budget so analytics cannot fail sign-in.
- PostHog identity is the backend user ID with minimal non-clinical properties; logout/account deletion resets it. Events avoid PII, clinical values, and raw user input, with per-install or per-session de-duplication where appropriate.
- Two tests enforce the above rather than leaving it to reviewer discipline. Both are **required carry-overs**, not optional precedent:
  - `$PEPTA/pepta-frontend/src/context/AuthContext.posthogIdentity.test.tsx` — the person-property **allowlist**. It asserts exact set equality on the identify payload's keys (`Object.keys(props).sort()` equals `["platform"]`), then separately asserts the serialized payload contains neither the user's email nor display name. The mechanism matters: it is an allowlist, not a denylist, so a future edit that adds a person property fails this assertion and has to come back through it deliberately. A denylist of banned keys would silently pass anything nobody thought to ban. It also covers identify-on-sign-in and reset-on-sign-out.
  - `$PEPTA/pepta-frontend/src/services/posthogFanOut.test.ts` — **two-way parity** plus blast-radius containment. It asserts the same event name and identical properties reach both destinations and that names are not renamed between them, and that a throwing or never-initialised PostHog leaves the AppsFlyer send intact and does not consume the once-per-install token.
- The allowlist carries more weight in Corner than in Pepta. Pepta's risk is clinical values; Corner's documents are contracts and medical records, so document titles, filenames, extracted text, action-item content, and chat messages are all user content that must never become an event property or person property. Corner's allowlist test must cover document and action-item event payloads, not just identity.
- Session replay is off unless `EXPO_PUBLIC_POSTHOG_SESSION_REPLAY === "true"`; its sample rate is otherwise zero. When enabled, all text inputs, images, and sandbox views are globally masked, health-value surfaces opt into `MaskedHealthValue`/`ph-no-capture`, and log capture is disabled. Build 46 explicitly shipped replay off.

**Corner decision:** `[ADOPTED]` use Pepta's provider-neutral dual fan-out: AppsFlyer for attribution and PostHog for product analytics/replay, with identical `snake_case` events, minimal identity, non-blocking calls, and replay disabled by default behind global plus health-surface masking. Port both tests named above as a required part of this adoption, extending the allowlist to Corner's document, action-item, and chat payloads.

### App Tracking Transparency

Corner inherits AppsFlyer for attribution, so iOS ATT is a required convention with a shipped precedent, not a nice-to-have. Pepta's committed implementation at `a8bb0f7` is the one to follow: `$PEPTA/pepta-frontend/src/services/attPrompt.ts` and `src/services/attPrompt.test.ts`, with `expo-tracking-transparency` `~6.0.8` and a single `attLaunchPrompt.start()` call from the app root (`App.tsx:44`).

This convention was written against a real rejection. Pepta's own source header records it: **Guideline 2.1, 2026-07-20, version 1.0.1 (13)**. The only ATT request lived inside AppsFlyer initialization, which runs after sign-in — and auth sits at the *end* of the onboarding funnel, so a reviewer on a fresh install never authenticated and the prompt never appeared. The two rules that follow are the fix:

- **Fire at launch, independent of auth.** The request must not be reachable only through a code path that requires a signed-in user. Corner's anonymous device-ID-first account does not make this safe by itself — the prompt still belongs at the root, not behind onboarding.
- **Wait for foreground-active, then retry.** iOS silently drops the ATT dialog when it is requested while the app is still launching, resolving `undetermined` with no UI and no error. Pepta subscribes to `AppState`, waits for `active`, allows a short settle delay (400 ms) so the first screen paints under the dialog, then requests. An `undetermined` result *back from a request* means iOS suppressed it, so the subscription stays open and retries on the next foreground; any determined status unsubscribes. Permission plumbing failures leave the subscription in place rather than giving up.
- Supporting details worth preserving: `start()` is idempotent and no-ops off iOS; a single in-flight guard prevents overlapping attempts; `isAvailable()` is checked before either call and an unavailable module ends cleanly; AppsFlyer's own pre-init request stays as a harmless no-op safety net, since iOS never re-prompts once status is determined. The class takes its platform, app-state, permission, and delay collaborators as injectable options, which is what makes `attPrompt.test.ts` able to drive the suppression-and-retry path without a simulator.

Leanient has an uncommitted `leanient-frontend/src/services/attPrompt.service.ts` in its working tree. It is **not** the precedent to copy — it is untracked work that this audit deliberately does not treat as convention, and its `.service` suffix also conflicts with the frontend naming used here. Follow Pepta's committed `attPrompt.ts`.

**Corner decision:** `[ADOPTED]` port Pepta's `AttLaunchPrompt` shape verbatim — launch-time, auth-independent, foreground-gated, retry-on-suppression, idempotent, iOS-only — together with its test. Add `expo-tracking-transparency` and the `NSUserTrackingUsageDescription` string at scaffold time rather than at submission time.

### Expo config, identifiers, and EAS

- Both use `app.config.js`, not `app.json`, and read public build-time configuration from `process.env`.
- Bundle/package IDs share the `ai.boltzman` prefix but disagree on suffix style: `ai.boltzman.leanient` versus `ai.boltzman.peptaapp`.
- Both enable tablets, automatic UI style, Metro for web, and a production EAS store profile.
- Both `eas.json` files use `cli.version >= 20.4.0`, local app-version source, a `production` store build, and production iOS submission metadata. Current Pepta additionally binds that build to the `production` EAS Update channel.
- Current Pepta config also declares the Expo owner/project ID, an updates URL, and a literal marketing-version runtime version; its release preflight checks native/Expo version parity.

**Corner decision:** `[NEW — proposed]` use `ai.boltzman.corner`, the explicit brief default and the cleaner Leanient suffix convention. Mirror current Pepta's production channel/runtime-version shape, but leave Corner's Expo project and App Store Connect IDs unset/documented until they exist. File handlers and background audio are Corner-specific additions.

## Backend conventions

### Runtime and module system

- Both root manifests require Node `>=20`.
- Both use TypeScript 5.9, Express 5.1, Mongoose 8, Zod 3.25, and Pino 9.6. Current Pepta has advanced to Mongoose `^8.24.4`; Leanient remains on `^8.14.0`.
- Root TypeScript targets ES2022 and compiles modules as CommonJS with Node resolution.
- Neither backend package sets `"type": "module"`; process entry checks use `require.main === module`.

**Corner decision:** `[ADOPTED]` use current Pepta's Node/TypeScript/Express/Mongoose/Zod/Pino baseline, including Mongoose `^8.24.4`, and CommonJS backend output unless Expo compatibility requires only frontend-specific settings.

### Source organization and naming

The current source trees use:

```text
src/
├── auth/
├── config/
├── db/
├── lib/
├── middleware/
├── models/
├── routes/
├── scripts/
├── services/
├── tests/
├── types/
├── app.ts       # Pepta
└── index.ts     # Pepta process entry
```

Pepta also has `seeds/` and an on-disk `jobs/` directory, although no general job-handler implementation is tracked there. Leanient adds `data/` and keeps app creation plus process start together in `server.ts`.

Despite `$LEANIENT/AGENTS.md` describing a `controllers/` folder, neither actual backend source tree has one. Handlers live in route modules and delegate domain work to services. Actual source wins.

Pepta generally uses kebab-case backend filenames (`async-handler.ts`, `request-logger.middleware.ts`, `weekly-retention.routes.ts`); Leanient frequently uses camelCase filenames. Frontend components and screens are PascalCase in both.

**Corner decision:** `[ADOPTED]` use Pepta's kebab-case backend filenames and suffixes such as `.model.ts`, `.routes.ts`, and `.middleware.ts`. Use thin inline route handlers plus services; do not add a controllers layer.

### Express bootstrap and routing

- Pepta's `src/app.ts` exports `createApp()` for tests and mounts security, CORS, no-cache, request logging, body parsing, health, public routes, authenticated routes, not-found handling, then central errors.
- `src/index.ts` connects Mongo, calls `createApp()`, starts listening, starts schedulers outside tests, and handles `SIGINT`/`SIGTERM` by stopping background work, closing HTTP, and disconnecting Mongo.
- Route modules use `Router()`, validation middleware, `asyncHandler`, and `sendData`; business behavior lives in services.
- Existing references mount unversioned routes. Corner's `/v1` prefix is not a reference convention.

**Corner decision:** `[ADOPTED]` use Pepta's split app/process entry. `[NEW — proposed]` mount Corner's product API below `/v1`, with `/healthz` remaining unversioned for Render.

### Mongoose model style

The common pattern is:

- Export an `XDocument extends Document<Types.ObjectId>` interface.
- Create `const xSchema = new Schema<XDocument>(...)`.
- Use PascalCase singular model names such as `mongoose.model<UserDocument>("User", userSchema)`; Mongoose derives plural collection names.
- Set `{ timestamps: true, versionKey: false }` on top-level schemas.
- Use `{ _id: false }` for embedded value-object schemas.
- Put references in `Schema.Types.ObjectId` fields with a singular PascalCase `ref`.
- Declare compound and partial unique indexes explicitly with `schema.index(...)`.
- Pepta applies `applyApiTransforms()` to models that serialize directly, converting `_id` to `id`, removing `__v`, and serializing dates/ObjectIds.
- Pepta's log models use shared helpers for soft-delete query middleware and standard owner/time indexes.

Concrete examples: `$PEPTA/pepta-backend/src/models/user.model.ts`, `model-utils.ts`, `log.model.ts`; `$LEANIENT/leanient-backend/src/models/weightLog.model.ts`.

**Corner decision:** `[ADOPTED]` use Pepta's schema options, naming, API transforms, and explicit index style. Corner's hard-delete document requirement must not reuse the log-model soft-delete helper for documents or derived artifacts.

### Authentication

- Both references issue JWTs with `jsonwebtoken`, algorithm HS256, a `sub` user ID, and configurable expiry (`30d` default).
- Pepta requires a 64-character secret; Leanient requires 32. Corner enforces the same strength as Pepta but measures it correctly: **32 bytes of key material after decoding**, plus a floor of 8 distinct characters.

  A character count answers the wrong question. Pepta's 64 characters was really "32 bytes of hex" wearing a character count, so the byte rule is identical in strength for hex secrets. It differs in two places, both improvements: `openssl rand -base64 32` carries a full 32 bytes in 44 characters and was wrongly rejected by the old rule, and 64 repeated `a`s are valid hex that decode to a real 32 bytes — length alone accepts them, which is why the distinct-character floor exists. Any generated secret clears both bounds; only typed ones fail.
- `requireAuth` reads a bearer token, verifies it, and sets `req.user = { id: payload.sub }`.
- The current middleware does not load the full Mongoose user document. Services query it when needed.
- The references authenticate with Google/Apple and have a review-only demo account. Corner's anonymous device-ID-first account is absent.

**Corner decision:** `[ADOPTED]` keep the JWT shape and bearer middleware. `[NEW — proposed]` add anonymous device identity issuance. Loading a complete user for quota/entitlement middleware is also a Corner-specific extension and should be typed explicitly on `Express.Request`.

### Validation and shared schemas

- Zod schemas live centrally in `shared/src/schemas/index.ts` and are imported by backend routes and the frontend client.
- `validateBody` and `validateQuery` use `safeParse` and return structured validation details through `ValidationError`.
- Pepta handles Express 5's read-only `req.query` getter with `Object.defineProperty` after parsing.

**Corner decision:** `[ADOPTED]` put public request/response contracts in `shared/`, not route-local schema files. Private provider payload schemas may stay next to their adapter if they are never a client contract.

### Errors and response envelopes

- `AppError` carries `code`, `statusCode`, optional `details`, and an `expose` flag.
- Specialized classes cover validation, auth, not-found, and internal errors.
- `sendData(res, value)` returns `{ data: value }`; `sendNoContent` returns 204.
- `notFoundHandler` turns missing routes into the standard envelope.
- `errorHandler` hides unexpected 500 details, logs with the request ID, and returns `{ error: { code, message, details? } }`.

**Corner decision:** `[ADOPTED]` preserve this envelope exactly, including for `501 Not Implemented` stubs and quota/paywall errors.

### Logging and rate limiting

- Pino emits structured records with an ISO timestamp and `service` base field.
- Request middleware accepts or creates an `x-request-id`, returns it in the response, and logs method, path, status, and duration on finish.
- Both use a local in-memory rate limiter. Pepta can key by IP or authenticated user ID and mounts tighter limits around AI-like routes.

**Corner decision:** `[ADOPTED]` keep request logging. Reuse the AI-route limiting shape for the scaffold, while documenting that in-memory limits are per process and will need a shared store when horizontally scaled.

### Render deployment

- Leanient has a root `render.yaml`; Pepta does not.
- Leanient defines one Node web service on `main`, auto-deploy, `/healthz`, `npm install --include=dev`, builds shared then backend, and starts the backend workspace.
- `GET /healthz` checks Mongo reachability and returns it inside the success data envelope.
- Neither reference defines a separate worker service.

**Corner decision:** use the Leanient root manifest as the available deployment precedent. `[NEW — proposed]` add a second Render worker using the same build and a distinct backend worker start command.

### Tests

- Both use Vitest 3 and Supertest 7.
- Backend tests live under `src/tests/**/*.test.ts` and run in the Node environment.
- Pepta enables Vitest globals and now runs `src/tests/setup-env.ts` first to strip developer-local RevenueCat/HMAC secrets so tests cannot accidentally call the live provider. Leanient uses a setup file and a test-time alias to shared source.
- Both expose root workspace scripts for `build`, `lint`, `typecheck`, and `test`.

**Corner decision:** `[ADOPTED]` mirror Pepta's colocated `src/tests` layout, root workspace commands, and test-env isolation for provider credentials, adding a shared-source alias only when tests require it.

### RevenueCat webhook

Pepta's implementation is the stronger precedent:

- `POST /webhooks/revenuecat` accepts a bearer token or `x-revenuecat-webhook-secret` and compares it with `timingSafeEqual`. This is shared-secret verification, not a provider-signed request scheme.
- Missing server configuration fails closed with 503; an invalid secret returns 403.
- The payload is validated with a shared Zod schema that accepts provider-nullable IDs and preserves forward-compatible fields used for payment provenance.
- A whitelist is the only path allowed to mutate entitlement state. Unknown event types are acknowledged, logged, and receipted as no-ops instead of defaulting the user to free.
- Existing receipts are checked first, but a new receipt is committed only after entitlement work completes. A mid-purchase failure therefore leaves RevenueCat's retry able to apply the event; the unique event index resolves concurrent duplicates.
- App user IDs, original IDs, aliases, and transfer IDs are considered for lookup. `transferred_from` IDs are deliberately excluded from the winner's stored identifiers so later loser events cannot downgrade the winner.
- Only usable customer IDs are persisted. Known users are updated with stale-downgrade protection, then reconciled from the complete RevenueCat subscriber view; unknown-user events are retained as receipts for later investigation.

Leanient accepts only the bearer form and, if no secret is configured, currently skips verification. Pepta is newer and safer.

**Corner decision:** `[ADOPTED]` use Pepta's fail-closed, timing-safe, validated, explicit-event, receipt-last, transfer-safe pattern under Corner's specified `/v1/webhooks/revenuecat` path.

### Payments and durable receipts

- `ProcessedWebhookEvent` is both the RevenueCat idempotency record and the durable payment receipt. It has a unique provider/event key and no TTL.
- Receipts capture the resolved local user when available plus provider customer ID, event/product/transaction IDs, price, currency, environment, store, period type, and processing time. Trial-period purchase/renewal events are represented as `trialing`, not falsely counted as paid `active` conversions.
- Account deletion does not erase payment evidence needed for later refunds, disputes, and chargebacks. It clears `userId`, marks the receipt `detached`, and retains the provider customer/transaction core.
- A receipt proves that processing completed; it is never used as a pre-work reservation. This ordering is part of correctness, not merely logging.

**Corner decision:** `[ADOPTED]` retain minimal provider transaction receipts without a TTL, write them last, keep trial versus paid state explicit, and detach the local user reference on account deletion while preserving the financial-record core.

## Conventions absent from both references

The following are product architecture, not conventions that can be copied. They remain `[NEW — proposed]` until this Phase 0 gate is accepted:

- Anonymous device-ID account creation and later email/provider upgrade.
- `/v1` API versioning.
- PDF rendering, annotation, import/share-intent, document picker, OCR, conversion, background audio, secure storage, biometric lock, and scan-to-PDF dependencies.
- A PDF renderer choice and evaluation criteria.
- A general MongoDB-backed job queue, atomic leasing, visibility timeout, exponential backoff, and a separate worker process. Pepta's complimentary-access cleanup queue is only a partial precedent.
- MongoDB Atlas Vector Search and its manually created vector index.
- Content-hash deduplication across users.
- Page, TTS, and chat quotas with pre-handler enforcement.
- AI usage/cost accounting.
- Provider interfaces for PDF parsing, embeddings, LLM, TTS, narration, and object storage.
- Cloudflare R2 as the S3-compatible default.
- Retention and hard-delete behavior for source blobs and derived artifacts.
- Sepia reading theme and the full Corner navigation graph.

These decisions are tracked in `docs/OPEN-QUESTIONS.md`. That file was created after the Phase 0 gate and now also carries `OQ-001`/`OQ-002` on ATT. An earlier revision of this line claimed the Phase 0 gate contained the only target-repository change; that stopped being true once `docs/` was created, and the claim is withdrawn here rather than left to mislead.

## Phase 0 gate: proposed Corner baseline

If this document is approved, later phases will follow this baseline:

1. Root npm workspaces: `shared`, `corner-backend`, `corner-frontend`.
2. Expo 54 plus React Navigation native stack/bottom tabs and Pepta-style Context state.
3. Shared Zod contracts in `@corner/shared`.
4. Pepta-style fetch API client, modular theme, RevenueCat access context, and strict TypeScript settings.
5. Express 5 app factory/process split, thin routes, services, Mongoose models, shared validation, Pino, and standard envelopes.
6. Mongo-backed background jobs with a separate Render worker as a clearly marked new Corner pattern.
7. `ai.boltzman.corner` identifiers.
8. `design/` tracked (with a tracked `README.md`); `marketing/` ignored (with an ignored `README.md`). A deliberate departure from the brief's "both untracked" — small diffable design output earns its history, heavy marketing binaries do not.
9. Analytics uses Pepta's dual fan-out: AppsFlyer for attribution and PostHog for product analytics/session replay, with replay disabled by default and health-data masking enforced.
10. Pepta's PostHog allowlist test and fan-out parity test are ported as required carry-overs, with the allowlist extended to Corner's document, action-item, and chat payloads.
11. Pepta's committed launch-time ATT prompt is ported with its test — fired at the app root independent of auth, gated on foreground-active, retried on iOS suppression.
