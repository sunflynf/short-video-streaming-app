# Mobile app

Expo (SDK 58) + Expo Router client. Plan and status: [`docs/plans/phase-5-mobile.md`](../../docs/plans/phase-5-mobile.md).

## Run it

```bash
cp .env.example .env     # EXPO_PUBLIC_API_URL, EXPO_PUBLIC_WEB_URL
pnpm dev                 # expo start; press i / a, or scan the QR code with Expo Go
```

On a physical device `localhost` is the phone itself: set `EXPO_PUBLIC_API_URL` to your
machine's LAN IP (e.g. `http://192.168.1.20:3000/v1`) or run `npx expo start --tunnel`.

Demo accounts come from the backend seed: `alice@example.com` … `erin@example.com`, password
`password123`. Video playback needs real Mux content (see the Phase 2 plan).

## Layout

- `src/app/` — routes (Expo Router). `(auth)` and `(tabs)` are guarded by the session in `_layout.tsx`.
- `src/components/` — `FeedList` (vertical pager), `VideoItem` (player), `ActionRail`, `ProfileView`, …
- `src/services/` — `api.ts` (typed client with token refresh), TanStack Query hooks in `queries/`,
  optimistic cache helpers in `cache-updates.ts`, `upload-file.ts` (native and web variants).
- `src/store/` — Zustand: `auth` (session in SecureStore), `player` (mute).

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm test
npx expo export --platform ios    # or android / web: proves the bundle builds
pnpm web:export && pnpm web:serve # web build on :8081, then `pnpm web:smoke` (see the plan)
```

Add native dependencies with `npx expo install <package>` so versions match the Expo SDK.
