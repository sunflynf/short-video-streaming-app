# Phase 5 — Mobile App Shell & Video UI (Days 36–45)

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
- [ ] Install `@tanstack/react-query`, `zustand`, `expo-secure-store`, `expo-video`, `@shopify/flash-list`, `expo-image`, `expo-image-picker`, `react-native-gesture-handler`, `@gorhom/bottom-sheet`
- [ ] `services/api.ts`: typed with `@app/shared`. On a 401, run a single-flight refresh, then retry the request once; if the refresh fails, log out.
- [ ] `store/auth.ts`: tokens in SecureStore, hydrate on boot. `_layout.tsx` redirects to `(auth)` or `(tabs)`.
- [ ] Welcome, login and signup screens with inline validation (same rules as the backend DTOs)

### Days 38–40 — Feed & player (most important)
- [ ] `FeedList.tsx`: vertical full-screen pager (`FlashList` with `pagingEnabled`, `snapToInterval = windowHeight`, `decelerationRate="fast"`) and `useInfiniteQuery` on `/videos/feed`
- [ ] `onViewableItemsChanged` (itemVisiblePercentThreshold 80) sets `player.activeIndex`
- [ ] `VideoItem.tsx`: `useVideoPlayer(playbackUrl)`. Play when the item is active, pause and seek to 0 when it isn't. Loop. `contentFit="cover"` for 9:16, `contain` otherwise. Show the thumbnail via `expo-image` until the first frame renders.
- [ ] Preload: mount players only for `activeIndex ± 1` (render the thumbnail for everything else) to limit memory
- [ ] Tap toggles pause; double-tap likes (heart animation); mute toggle (global)
- [ ] Pause when the app goes to the background or the tab loses focus (`useIsFocused`, `AppState`)
- [ ] Report a view: after 3 s of active playback, send `POST /videos/:id/view` once per mount
- [ ] `ActionRail.tsx`: author avatar (with a follow `+`), like, comment, share buttons with counts

### Day 41 — Interactions
- [ ] Like, follow: optimistic updates with `queryClient.setQueryData` on every cached page containing the video or user, rolled back on error
- [ ] Share: `POST /videos/:id/share` → `Share.share({ url })`
- [ ] `CommentSheet.tsx`: bottom sheet, infinite comments, reply expand, composer with keyboard avoidance, delete own comment (long-press)

### Days 42–43 — Upload flow
- [ ] `upload.tsx`: pick a video (`ImagePicker.launchImageLibraryAsync({ mediaTypes: 'videos', videoMaxDuration: 60 })`) or record with the system camera
- [ ] Client-side checks: duration ≤ 60 s, size ≤ 500 MB
- [ ] Caption input → `POST /videos/upload` → `FileSystem.createUploadTask(uploadUrl, uri, { httpMethod: 'PUT' })` with a progress bar
- [ ] After the upload, show "Processing…" and poll `GET /videos/:id` every 3 s until `READY` or `FAILED`, then go to the video
- [ ] Handle cancel, retry, and the app being backgrounded mid-upload (show a resumable error state)

### Day 44 — Profiles & inbox
- [ ] `profile.tsx` / `user/[id].tsx`: header (avatar, name, bio, counts, follow button) and a 3-column thumbnail grid from `/users/:id/videos`. Tapping a thumbnail opens a feed pager starting at that video.
- [ ] `edit-profile.tsx`: display name, username, bio. Avatar: presigned R2 PUT (add a backend `POST /users/me/avatar-upload-url` endpoint, D6).
- [ ] `inbox.tsx`: notifications list with mark-all-read on focus and an unread badge on the tab (poll `unread-count` every 60 s while foregrounded)

### Day 45 — Deep links & polish
- [ ] Scheme `shortvid://` plus a universal link stub; `video/[id].tsx` handles `shortvid://video/:id` and `${PUBLIC_WEB_URL}/v/:id`
- [ ] Empty, loading and error states on every screen; pull-to-refresh on the feed and profiles
- [ ] Test on a low-end Android device: feed scroll at 60 fps, no audio overlap between videos

## Contracts
- Uses the endpoints from Phases 1–4. New backend endpoint:
  - `POST /users/me/avatar-upload-url` returns `{ uploadUrl, publicUrl }` (R2 presigned PUT, `image/jpeg|png|webp`, ≤ 5 MB)
- New backend env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`
- Mobile env: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL`

## Done when
- [ ] Fresh install → signup → feed plays immediately → swipe 20 videos without stutter or overlapping audio
- [ ] Like, comment and follow update the UI instantly and survive a refresh
- [ ] Upload a clip from the gallery and see it on your profile once it's READY
- [ ] Notifications from another account's actions appear in the inbox
- [ ] Works on both an iOS simulator and a physical Android device

## Tests
- Jest + `@testing-library/react-native`: `api.ts` refresh-retry logic, auth store hydration, optimistic like rollback.
- Manual QA checklist (put it in the PR): background/foreground, poor network (Network Link Conditioner), rotating the device, a very long caption.

## Risks & notes
- **Player memory:** too many mounted `VideoPlayer`s crash low-end Android devices. Keep the ±1 window strict.
- **Upload size on cellular:** show the file size and warn when not on Wi-Fi.
- `FlashList` paging can feel off on Android. If it does, fall back to `FlatList` with `getItemLayout` or use `react-native-pager-view`.
