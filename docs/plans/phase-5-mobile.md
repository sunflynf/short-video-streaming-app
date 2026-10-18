# Phase 5 — Mobile App Shell & Video UI (Days 36–45)

**Status:** ✅ built and verified on the **web build** (Playwright, 13 steps against the live API) plus iOS/Android bundle exports. ⏳ **On-device QA pending**: real video playback, the gallery picker, and 60 fps scrolling need a simulator or phone and real Mux content (see *Device QA checklist*).

## Goal
The Expo app delivers the core loop: sign up, swipe a smooth vertical feed, like, comment, follow, upload a clip and see it on your profile.

## Scope
- **In:** auth screens, navigation, the vertical feed player, upload flow, profile and creator screens, comments sheet, notifications list, deep links.
- **Out:** in-app camera recording with effects (use the system picker or recorder), search (post-MVP), web admin.

## Prerequisites
- Phase 1 (auth) to start. Phases 2–4 APIs for the matching screens. This phase can run alongside Phases 2–4.

## App structure (`apps/mobile`)
```text
app/
  _layout.tsx                 QueryClientProvider, auth gate, Sentry
  (auth)/welcome.tsx, login.tsx, signup.tsx
  (tabs)/_layout.tsx          Home · Upload · Inbox · Profile
  (tabs)/index.tsx            Feed (For You / Following toggle)
  (tabs)/upload.tsx
  (tabs)/inbox.tsx            Notifications
  (tabs)/profile.tsx          Own profile
  user/[id].tsx               Creator profile
  video/[id].tsx              Single video (deep link target)
  comments/[videoId].tsx      Modal / bottom sheet
  edit-profile.tsx
src/
  services/api.ts             fetch client, auth header, 401 → refresh → retry once
  services/queries/*.ts       TanStack Query hooks per resource
  store/auth.ts               Zustand: session, tokens (persisted in expo-secure-store)
  store/player.ts             Zustand: activeIndex, muted
  components/VideoItem.tsx, FeedList.tsx, ActionRail.tsx, CommentSheet.tsx, ...
```

## Tasks

### Days 36–37 — Shell & auth
- [x] Install `@tanstack/react-query`, `zustand`, `expo-secure-store`, `expo-video`, `expo-image-picker`, `expo-file-system`, `@expo/vector-icons` (SDK 58 versions). `@shopify/flash-list` and `@gorhom/bottom-sheet` were left out (see notes).
- [x] `services/api.ts`: typed with `@app/shared`. On a 401, run a single-flight refresh, then retry the request once; if the refresh fails, log out.
- [x] `store/auth.ts`: tokens in SecureStore, hydrate on boot. `_layout.tsx` redirects to `(auth)` or `(tabs)`.
- [x] Welcome, login and signup screens with inline validation (same rules as the backend DTOs)

### Days 38–40 — Feed & player (most important)
- [x] `FeedList.tsx`: vertical full-screen pager (`FlatList` rather than `FlashList`, with `pagingEnabled`, `snapToInterval = windowHeight`, `decelerationRate="fast"`) and `useInfiniteQuery` on `/videos/feed`
- [x] `onViewableItemsChanged` (itemVisiblePercentThreshold 80) sets `player.activeIndex`
- [x] `VideoItem.tsx`: `useVideoPlayer(playbackUrl)`. Play when the item is active, pause and seek to 0 when it isn't. Loop. `contentFit="cover"` for 9:16, `contain` otherwise. Show the thumbnail via `expo-image` until the first frame renders.
- [x] Preload: mount players only for `activeIndex ± 1` (render the thumbnail for everything else) to limit memory
- [x] Tap toggles pause; double-tap likes (heart animation); mute toggle (global)
- [x] Pause when the app goes to the background or the tab loses focus (`useIsFocused`, `AppState`)
- [x] Report a view: after 3 s of active playback, send `POST /videos/:id/view` once per mount
- [x] `ActionRail.tsx`: author avatar (with a follow `+`), like, comment, share buttons with counts

### Day 41 — Interactions
- [x] Like, follow: optimistic updates with `queryClient.setQueryData` on every cached page containing the video or user, rolled back on error
- [x] Share: `POST /videos/:id/share` → `Share.share({ url })`
- [x] `comments/[videoId].tsx`: a modal route (iOS `formSheet`) rather than a bottom-sheet library, with infinite comments, reply expand, composer with keyboard avoidance, delete own comment (long-press)

### Days 42–43 — Upload flow
- [x] `upload.tsx`: pick a video (`ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], videoMaxDuration: 60 })`). Recording with the system camera isn't built yet.
- [x] Client-side checks: duration ≤ 60 s, size ≤ 500 MB
- [x] Caption input → `POST /videos/upload` → `createUploadTask` from `expo-file-system/legacy` (binary PUT; XHR on web) with a progress bar
- [x] After the upload, show "Processing…" and poll `GET /videos/:id` every 3 s until `READY` or `FAILED`, then go to the video
- [x] Handle cancel and retry, with friendly messages for 503 (uploads not configured) and 429 (limits). ⏳ Being backgrounded mid-upload shows an error with a retry option; true resumable uploads are not built.

### Day 44 — Profiles & inbox
- [x] `profile.tsx` / `user/[id].tsx`: header (avatar, name, bio, counts, follow button) and a 3-column thumbnail grid from `/users/:id/videos`. Tapping a thumbnail opens a feed pager starting at that video.
- [x] `edit-profile.tsx`: display name, username, bio. Avatar: presigned R2 PUT (add a backend `POST /users/me/avatar-upload-url` endpoint, D6).
- [x] `inbox.tsx`: notifications list with mark-all-read on focus and an unread badge on the tab (poll `unread-count` every 60 s while foregrounded)

### Day 45 — Deep links & polish
- [x] Scheme `shortvid://`; `video/[id].tsx` handles `shortvid://video/:id`, and `+native-intent.tsx` rewrites `${EXPO_PUBLIC_WEB_URL}/v/:id` to it. ⏳ Universal/app links also need associated domains configured with the real domain (Phase 7).
- [x] Empty, loading and error states on every screen; pull-to-refresh on the feed and profiles
- [ ] Test on a low-end Android device: feed scroll at 60 fps, no audio overlap between videos. ⏳ **Needs a device.**

## Contracts
- Uses the endpoints from Phases 1–4. New backend endpoint:
  - `POST /users/me/avatar-upload-url` returns `{ uploadUrl, publicUrl }` (R2 presigned PUT, `image/jpeg|png|webp`, ≤ 5 MB)
- New backend env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`
- Mobile env: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL`

## Done when
- [ ] Fresh install → signup → feed plays immediately → swipe 20 videos without stutter or overlapping audio. ⏳ Needs a device and real Mux videos; signup, login and the feed rendering were verified on web.
- [x] Like, comment and follow update the UI instantly and survive a refresh (verified on web)
- [ ] Upload a clip from the gallery and see it on your profile once it's READY. ⏳ Needs Mux keys; the picker → API path and the "not configured" message were verified on web.
- [x] Notifications from another account's actions appear in the inbox (verified on web; the badge clears)
- [ ] Works on both an iOS simulator and a physical Android device. ⏳ Both bundles build (`expo export`); not run on a device yet.

## Tests
- **Unit (jest-expo, 29 tests):**
  - `services/api.test.ts`: bearer token, a single-flight refresh on 401 shared by concurrent requests, sign-out when the refresh fails, anonymous requests, error messages.
  - `store/auth.test.ts`: hydration, persisting the session, sign-out revoking the refresh token, corrupt storage.
  - `services/cache-updates.test.ts`: optimistic like and follow across every cached list, the profile and single videos; no double counting; rollback.
  - `lib/lib.test.ts`: count and time formatting, clip validation.
- **Web smoke** (`apps/mobile/e2e/web-smoke.mjs`, Playwright, 13 steps) against the real API:
  - welcome, login validation, the API's wrong-password error, login → feed
  - optimistic like, and the like surviving a reload
  - posting a comment
  - creator profile
  - inbox content, and the badge clearing
  - own profile, editing the bio
  - the Following tab
  - the upload picker hitting the "not configured" message (no Mux keys)
- **Bundles:** `expo export` builds for iOS, Android and web.
- **Backend:** `followingAuthor` on `VideoDto`, and avatar presigning (3 e2e tests and unit tests), for 91 e2e tests in total.

### Running the web smoke test
```bash
# API with demo data (needs a fresh dev DB: seed videos + activity)
SEED_MUX_PLAYBACK_IDS=demo1,demo2,demo3,demo4,demo5,demo6 pnpm --filter backend prisma:seed
pnpm --filter backend dev            # or build + node dist/main.js
pnpm --filter backend demo:activity  # bob and dave like and comment on alice's video
# Web build
cd apps/mobile && pnpm web:export && pnpm web:serve &   # http://localhost:8081
CHROMIUM_PATH=/path/to/chrome pnpm web:smoke ./smoke-shots
```

## Device QA checklist (not verifiable without a simulator or phone)
- [ ] Real HLS playback starts within about 1 s; only one clip has audio at a time; swiping 20 clips doesn't stutter
- [ ] Backgrounding the app pauses playback; switching tabs pauses it
- [ ] Double-tap like shows the heart; single tap pauses and resumes; mute applies to every clip
- [ ] Gallery picker → upload progress → "Processing…" → opens the READY video (needs Mux keys and a webhook tunnel; see Phase 2)
- [ ] Avatar upload (needs R2 keys)
- [ ] Comments sheet with the keyboard open on iOS and Android
- [ ] `shortvid://video/<id>` opens the video; a shared `/v/<id>` link opens it once associated domains are set up
- [ ] Low-end Android: scroll at 60 fps, memory stays flat over 50 clips

## Implementation notes (where the build differs from the original plan)
- **No `@shopify/flash-list` or `@gorhom/bottom-sheet`.** `FlatList` with `pagingEnabled` and `getItemLayout` is enough for a full-screen pager (the original plan's fallback). Comments are a modal route with iOS sheet presentation. That's two fewer native dependencies to keep in step with the SDK; revisit them if device QA shows jank.
- **Players are mounted only for the active item ±1**, with the thumbnail shown underneath. Pausing works per tab (`useIsFocused`) and per app state (`AppState`).
- **`/` redirects by session** (`app/index.tsx`), and Home lives at `/home`. Without this, a signed-out user opening `/` hit "Unmatched Route", because `/` was inside the protected tabs group. The web smoke test caught it.
- **Session handling:** tokens live in SecureStore (localStorage on web). `api.ts` refreshes on 401 with one shared refresh, and ends the session if that fails. The query cache is cleared whenever the signed-in user changes.
- **New backend fields and endpoints:**
  - `VideoDto.followingAuthor`, so the rail's follow `+` knows its state. It's batch-hydrated like `likedByMe`.
  - `POST /users/me/avatar-upload-url`: an R2 presigned PUT bound to the content type and size, optional like Mux (503 without keys). With R2 configured, `PATCH /users/:id` only accepts avatar URLs under `R2_PUBLIC_URL`.
- **Anonymous browsing isn't offered**: the app requires sign-in, even though the API serves an anonymous For You feed. Easy to open up later.
- **`expo install` can't reach Expo's API from this environment**, so versions were taken from the SDK's `bundledNativeModules.json`.

## Risks & notes
- **Player memory:** too many mounted `VideoPlayer`s crash low-end Android devices. Keep the ±1 window strict.
- **Upload size on cellular:** show the file size and warn when not on Wi-Fi.
- `FlashList` paging can feel off on Android. If it does, fall back to `FlatList` with `getItemLayout` or use `react-native-pager-view`.
