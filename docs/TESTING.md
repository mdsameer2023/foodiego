# Testing FoodieGo

From the repository root, use separate terminals as needed. Do not run destructive tests against an existing production database.

## Local quality gates

```powershell
cd backend
npm run typecheck
npm run lint
npm test
npm run build
```

Backend integration tests create temporary MongoDB replica sets with `mongodb-memory-server`; they do not use the configured Atlas database for their test records.

```powershell
cd frontend
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Normal browser tests can reuse existing local servers. Most new AI/dashboard tests use route fixtures to check UI and authorization states; those fixtures do not verify a real Gemini call or a real payment provider. The explicit Atlas commerce test remains opt in and creates/removes only its uniquely named temporary account.

## Fully isolated browser tests, including signup and COD

Stop other test/dev services using localhost:3000 and :5000 yourself. The runner refuses to replace an existing service.

Alternatively, preserve existing services by setting `FOODIEGO_E2E_FRONTEND_PORT=3001`, `FOODIEGO_E2E_API_PORT=5001` and `NEXT_PUBLIC_API_URL=http://localhost:5001/api` before both the frontend build and browser run. For a separate build directory, set `FOODIEGO_BUILD_DIR=.next-phase7` for both commands. Public API configuration is compiled into the frontend, so changing it only at server startup is insufficient.

```powershell
cd frontend
$env:FOODIEGO_E2E_ISOLATED='1'
npm run build
npm run test:e2e
Remove-Item Env:FOODIEGO_E2E_ISOLATED
```

This mode starts a temporary MongoDB replica set, seeds sample restaurants into that temporary database and starts a test backend with AI/payments disabled. The live-commerce browser test runs against the temporary database. Cleanup destroys the isolated database at shutdown, not existing Atlas records. Do not set a production connection string for this mode; it is ignored by the isolated backend.

Windows sandbox restrictions may prevent launching MongoDB or Edge and require the appropriate local execution permission. Report such a run as blocked, not failed application behavior and not a pass.

## AI and provider verification

```powershell
cd backend
npx tsx --test tests/phase7.test.ts
$env:GEMINI_LIVE_TEST='1'
npm run ai:verify
Remove-Item Env:GEMINI_LIVE_TEST
```

The first command uses an injected provider for timeout, schema, privacy and budget tests. The second requires the actual SDK, backend key and model; it is the separate live Gemini verification step. Do not equate mocked provider tests with live provider access.

## Performance

If Lighthouse is installed, record its version, target URL and environment and retain its report. Otherwise the optional Playwright lab run records browser LCP/CLS observations, navigation timing and assistant opening time:

```powershell
cd frontend
$env:FOODIEGO_MEASURE_PERFORMANCE='1'
$env:FOODIEGO_PERFORMANCE_LABEL='after'
npx playwright test e2e/performance.spec.ts
Remove-Item Env:FOODIEGO_MEASURE_PERFORMANCE
Remove-Item Env:FOODIEGO_PERFORMANCE_LABEL
```

Output: `frontend/test-results/performance-after.json`. Assistant opening time is a lab interaction timing, not field INP. Without a saved equivalent baseline, do not claim a percentage performance improvement or a Lighthouse score. Browser lab observations are not a WCAG or Core Web Vitals field certification.

Responsive checks cover 320, 375, 430, 768, 1024, 1440 and 1920 pixels. Assistant tests cover focus, Escape, reset, retry, fallback cards, opt-in personalization and no page overflow. Existing customer/dashboard/tracking tests remain regression gates.

## Dependency audit and CI

Run `npm audit --audit-level=high` in both packages and review actionable advisories; do not blindly apply breaking `--force` updates. GitHub Actions installs locked dependencies, checks types/lint/tests/builds, audits dependencies and runs isolated browser tests. No production deployment step is included. A prepared workflow is not a successful remote CI run.

The isolated Playwright backend runs with `backend` as its working directory and uses asynchronous seeding so MongoDB log pipes remain drained. Readiness checks remain bounded at 180 seconds. Performance measurements create a fresh browser context for each viewport, use CLS session windows and record layout-shift sources before opening the assistant. They are local observations without CPU/network throttling, not field certification.


## Phase 8 release checks

- From backend: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Tests now include five isolated production-mode index/cookie/origin/logging checks.
- From frontend: `npx next typegen`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, then the isolated browser commands above. Hosted environment guard unit tests do not contact Vercel.
- From backend: `npm run release:database` performs read-only ping/listIndexes against the configured database, with autoIndex/autoCreate disabled. It does not run the migration. The resulting report contains model statuses only.
- From root: `python backend/scripts/validate-release-config.py` checks public provider/workflow schemas and deployment-disable invariants. It requires the existing Python audit environment with PyYAML/jsonschema and network access to public schemas; neither is a production app dependency.
- Locked install planning can be checked without replacing installed packages using `npm ci --dry-run --ignore-scripts --no-audit --no-fund`. This is not proof of a clean lifecycle/native install; remote CI still needs to run.

Phase 8 browser verification used FOODIEGO_BUILD_DIR=.next-phase8, frontend port 3002, API port 5002 and a frontend build-time NEXT_PUBLIC_API_URL=http://localhost:5002/api. Performance was explicitly enabled with FOODIEGO_MEASURE_PERFORMANCE=1; its report is saved in docs/phase8/performance.json. Hosted staging results remain NOT VERIFIED; do not aim the fixture-based suite at production.
