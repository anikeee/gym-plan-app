# Plan: PureGym exercise guide app for "Anik workout plan #1"

Plan written: 7 October 2026. Written for an executor with zero context. Every fact below is either cited (`file:line` or a URL checked on the plan date) or listed under "Assumptions to verify". Execute with `/task-executing-max`.

---

## 1. Context (read first)

### What we are building

A small web app for one person. It shows the 21 exercises of a Push / Pull / Legs plan written by a trainer. For each exercise the user can switch between two versions:

* **Machine (PureGym)**: how to do it on the machine or cable station found in a PureGym.
* **Dumbbells**: how to do the same movement with dumbbells.

Each version shows:

1. One or more **short YouTube videos** (10 to 90 seconds) as tappable cards that open YouTube. Most machine clips come from PureGym's own channel, filmed on PureGym equipment.
2. An **animation**: a looping GIF of a rendered 3D style figure doing the movement with the working muscles highlighted (source: ExerciseDB V1 free API). When that API is slow, down, or rate limited, a two frame start/end animation from a public domain dataset (`free-exercise-db`) takes its place.
3. A one line setup **tip**, the sets and reps from the plan, the rest time, and a link to PureGym's written guide where one exists.

The user opens it on a phone in the gym. There is no login, no backend, no database, no set logging, no timer.

### Where the plan comes from

The PDF `docs/research/anik-workout-plan-1.pdf` (text in `docs/research/anik-workout-plan-1.txt`). Three days of 7 exercises, 4 sets each, reps 12 / 10 / 10 / 8, rest 75 to 90 seconds for compound moves and 45 to 60 seconds for isolation moves (`docs/research/anik-workout-plan-1.txt:3`, `:4`, `:7`, `:8`).

### Project state

* Folder: `/Users/muidhasan/gym`. It was empty on the plan date except for `docs/`. It is **not** a git repository. There is no existing code, so there is no canonical sibling to copy. The closest "sibling" is the data research already done and saved under `docs/research/` (see its `README.md`).
* Tooling on this Mac: Node `v22.17.0` with the built in test runner (`node:test` loaded fine), Python `3.14.3` with `http.server`. No build tools are needed and none should be added.

### Research artifacts the executor may rely on (all under `docs/research/`)

| File | What it proves |
|---|---|
| `anik-workout-plan-1.txt` | The 21 exercise names, order, sets, reps, rest. |
| `oembed-check.json` | 111 YouTube IDs, every one `ok: true` from `https://www.youtube.com/oembed` on 7 October 2026, with title and channel. Every video ID in the data file is a key in this file. |
| `puregym-channel-all.txt` | id, seconds, title for 1,244 videos and Shorts on the PureGym channel (`UCBbB-PR9CsGcMnswP04TbhQ`). |
| `puregym-library.json` | every `puregym.com/exercises/...` page and the YouTube IDs embedded on it. |
| `ytsearch-gaps.txt`, `ytsearch-rp.txt` | raw YouTube search results used to pick non PureGym clips. |
| `animation-head-check.txt` | HTTP HEAD 200 for all 40 ExerciseDB GIFs and all 80 fallback images used in the data file. |

### Conventions for this project (there is no CLAUDE.md yet)

* Plain HTML, CSS and JavaScript. No framework, no bundler, no npm dependencies. ES modules in the browser.
* One data file, `data/exercises.json`, is the only source of truth. Nothing else may hard code an exercise.
* Tests use `node --test` (Node's default file patterns, so every test file must be named `*.test.mjs`). Network checks live in `scripts/`, not in tests.
* Prose shown to the user is short and plain. The user reads it between sets.

---

## 2. Facts you can rely on (already verified, do not re derive)

### The plan (PDF)

* F1. Push day exercises in order: Incline Chest Press Machine, Dumbbell Pullover, Lateral Raise, Chest Press Machine, Cable Chest Fly, Tricep Pushdown, Overhead Dumbbell Tricep Extension (`docs/research/anik-workout-plan-1.txt:16` to `:28`).
* F2. Pull day: Lat Pulldown, Straight Arm Pulldown, Seated Cable Row, Diverging Chest Supported Row, Face Pull, Barbell Curl, Hammer Curl (`:37` to `:49`).
* F3. Legs day: Perfect Squat, Romanian Deadlift, Leg Press, Back Lunges, Leg Curl, Leg Extension, Standing Calf Raise (`:54` to `:66`).
* F4. Every exercise is `4 x (12/10/10/8)` (`:4` and every exercise line). Rest: compound 75 to 90 seconds, isolation 45 to 60 seconds (`:7`, `:8`). The PDF does not say which exercise is compound or isolation; the data file decides that (see F30).

### PureGym equipment and the "Perfect Squat"

* F5. "Perfect Squat" is a real machine: Matrix Fitness model `VY-400`, a plate loaded squat machine. Source page title `Perfect Squat | Plate-loaded`, page text `Xult Perfect Squat VY-400`, at `https://us.matrixfitness.com/eng/strength/plate-loaded/vy-400-perfect-squat` (read in the browser on 7 October 2026). A reseller lists it as "Matrix Varsity Series Perfect Squat" (`https://www.johnsonfitness.com/Matrix-Varsity-Series-Perfect-Squat-P25381.aspx`, title only; the page body blocks scripts).
* F6. PureGym's equipment page names Matrix as an equipment brand (logo section) and says gyms have `plate-loaded equipment (in most gyms)` and "dumbbells up to 50kg (in most gyms)" (`https://www.puregym.com/equipment/`, fetched 7 October 2026).
* F7. "Diverging Seated Row" is a Matrix machine name (Ultra series `G7-S34`, Versa `VS-S34`). Matrix's own clip of it is YouTube `O90lC5WcIGE` (`docs/research/oembed-check.json`, author "Matrix Fitness"). So the plan's "Diverging Chest Supported Row" means the Matrix chest pad row machine.

### YouTube

* F8. Every video ID in the data file returned HTTP 200 from `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<id>&format=json` on 7 October 2026 (`docs/research/oembed-check.json`, all `ok: true`, zero failures out of 111).
* F9. Thumbnails exist at `https://i.ytimg.com/vi/<id>/hqdefault.jpg` for normal videos and for Shorts (48 downloaded during research, including the three Shorts `px3fnV8dCl0`, `JreANgCOYUg`, `srZ4D32s4gI` at 12 to 17 KB each).
* F10. PureGym clips are 10 to 25 seconds for "How To Do ..." and about 60 seconds for "How To Use The ... Machine" (`docs/research/puregym-channel-all.txt`, second column).
* F11. Shorts have no duration in the channel listing (`NA` in `puregym-channel-all.txt`). The data file stores `null` seconds for them.
* F12. PureGym's web guides embed the same clips through `youtube-nocookie.com/embed/<id>` iframes (`docs/research/puregym-library.json`, field `youtube` per page; example `seated-chest-press/` page carries `CIykDiF4sfg`).
* F13. `yt-dlp` per video metadata is blocked ("Sign in to confirm you're not a bot") but channel and search listings work. The executor does not need `yt-dlp` at all; oEmbed is enough.

### ExerciseDB V1 (animations)

* F14. Base URL `https://oss.exercisedb.dev`. No API key. `GET /api/v1/exercises/{exerciseId}` returns `{"success":true,"data":{"exerciseId","name","gifUrl","targetMuscles","bodyParts","equipments","secondaryMuscles","instructions":[...]}}` (checked live with id `0I5fUyn`; docs at `https://docs.ascendapi.com/api-reference/exercisedb-v1/exercises/getexercisebyid.md`).
* F15. `gifUrl` values have the form `https://static.exercisedb.dev/media/<exerciseId>.gif`. A HEAD on that host returns `200 image/gif` with a foreign `Referer`, so plain `<img>` hotlinking works. All 40 ids used here returned 200 (`docs/research/animation-head-check.txt`).
* F16. The GIFs are 180 x 180 pixels, 12 frames, a rendered figure with the target muscles drawn in red (inspected frame of `01qpYSe.gif`). This is the "animation or 3D" element of the app. It is not a true 3D model you can rotate.
* F17. The search endpoints are `GET /api/v1/exercises?name=<text>&limit=N` (fuzzy, documented at `.../advanced-exercise-filtering.md`) and `GET /api/v1/exercises/search?search=<text>&threshold=0.3`. The second returns only `exerciseId`, `name`, `gifUrl`. The app does not search at runtime; ids are already in the data file.
* F18. Rate limits are real. During research the API answered `429 Too Many Requests` after roughly 10 to 20 requests in a minute and `503` once. Spacing requests 2 to 3 seconds apart avoided it. The app therefore fetches one exercise at a time, only when opened.
* F19. **Terms of use** (`https://exercisedb.notion.site/ExerciseDB-API-Terms-of-Use-226983b728ca8090bf7be79564e4b356`, "Last Updated: July 2025", read in the browser): all data and media are AscendAPI property; storing data, images or GIFs "Locally on devices", "On servers", or "In cache beyond temporary operational needs (not exceeding 1 hour)" is prohibited; "Unauthorized downloading, scraping, or bulk collection" is prohibited; the API is for `real-time data fetching on each request`. The terms are written for subscribers, and the free V1 API says `No sign-up, no API key` (`https://oss.exercisedb.dev/`). This plan treats the terms as binding for the free tier too. Consequence: the app stores only ExerciseDB ids, renders `gifUrl` and `instructions` from a live response, never writes them to a service worker cache, localStorage, or disk, and never copies GIFs into the repo.
* F20. The id `A3P4O0R` ("cable seated row") exists in the API listing but its GIF returns 404. The data file uses `fUBheHs` ("cable seated row") instead, which returns 200 (`animation-head-check.txt`).
* F21. ExerciseDB has no "face pull", no "perfect squat", no "smith machine reverse lunge", no "dumbbell leg extension". The data file uses the closest movement for the first three and marks each with a `note`; the fourth has no ExerciseDB animation (see F31).

### `free-exercise-db` (fallback animation)

* F22. Dataset `https://github.com/yuhonas/free-exercise-db`, license **Unlicense (public domain)**, 876 exercises, JSON at `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json` (fetched, 1,005,327 bytes). Each exercise has an `id` such as `Leg_Press` and an `images` array of two paths `<id>/0.jpg` and `<id>/1.jpg` (start and end position).
* F23. Images resolve at `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<id>/0.jpg` and `/1.jpg`. All 80 images for the 40 fallback ids returned 200 (`docs/research/animation-head-check.txt`). Because the license is public domain, the app may copy these images into the repo and cache them offline.

### Environment

* F24. Node `v22.17.0`; `node -e "require('node:test')"` succeeds, so `node --test` is available. Python `3.14.3`; `python3 -m http.server` is available. Global `fetch` exists in Node 22.
* F25. `fetch('data/exercises.json')` from a `file://` page fails in every browser. The app must be served over HTTP (`python3 -m http.server 8080`).
* F26. MuscleWiki returns HTTP 403 to scripts. It is not used.
* F27. No free, embeddable, per exercise true 3D animation library exists. Web search on 7 October 2026 found only game engine packs (Fab, CGTrader, Unreal marketplace) and paid apps. The ExerciseDB GIF is the practical "3D" option.

### Decisions baked into the data (so the executor does not re decide them)

* F28. Variant naming. `machine` = the PureGym machine or cable station version. `dumbbell` = the dumbbell version. `barbell` exists only on Barbell Curl, as the "as written" version.
* F29. Cable stations count as machines. The plan already uses cables for Cable Chest Fly, Tricep Pushdown, Lat Pulldown, Straight Arm Pulldown, Seated Cable Row and Face Pull (F1 to F3).
* F30. Compound: both presses, Lat Pulldown, Seated Cable Row, Diverging Chest Supported Row, Perfect Squat, Romanian Deadlift, Leg Press, Back Lunges. Isolation: everything else. This is a coaching convention, not a PDF fact, and it only drives the rest time shown.
* F31. Two variants have no ExerciseDB animation: `legs-6.dumbbell` (dumbbell leg extension) has neither source, and `legs-5.dumbbell` has an ExerciseDB id but no fallback. The UI shows a short text instead.
* F32. The straight arm pulldown appears twice on purpose: as the machine version of Dumbbell Pullover (push day 2) and as the written exercise Straight Arm Pulldown (pull day 2). Same movement, same clips.

---

## 3. Assumptions to verify

| # | Assumption | How the executor checks it |
|---|---|---|
| A1 | The user's PureGym has a Matrix Perfect Squat. Evidence is only a TikTok discover page titled "How to Use Perfect Squat Machine Pure Gym" (`https://www.tiktok.com/discover/how-to-use-perfect-squat-machine-pure-gym`). | Nothing to check in code. The `kit` text already says to use the hack squat if the machine is absent. Mention it in the final report. |
| A2 | The user's gym has a lateral raise machine, a chest supported row machine and a standing calf raise machine. Equipment varies by site (F6 says "in most gyms"). | Same as A1. Each `kit` string names the fallback station. |
| A3 | `https://www.youtube.com/watch?v=<id>` opens the YouTube app on iPhone and Android when installed. | Open the deployed or local page on the phone once and tap a card. If it opens in the browser instead, that is still acceptable. |
| A4 | GIF id `C0MA9bC` (`Dumbbell Single-Arm Bent-Over Row`) serves a GIF. It is in `animation-head-check.txt` with status 200, but it was listed by the API only one minute before the HEAD check. | `npm run verify` HEAD checks it again. |
| A5 | ExerciseDB free tier stays free and unauthenticated. | `npm run verify` fails loudly on the first 401 or 403; the fallback keeps the app usable. |
| A6 | GitHub Pages (or any static host over HTTPS) is acceptable to the user for hosting. | Ask in the final report (Step 9). Do not create a repository or publish without a yes. |
| A7 | The browser HTTP cache honouring the GIF host's cache headers counts as "temporary operational" caching under F19. | Nothing to code. Do not add `Cache-Control` overrides, a service worker route, or any storage for that host. |

---

## 4. Design decision record

### Decision 1: app platform

| Option | Fit (greenfield, one user, phone in gym) | Blast radius | Failure path complexity | Deploy / rollback |
|---|---|---|---|---|
| **A. Static site: one `index.html`, `app.js`, `styles.css`, `data/exercises.json`, optional service worker** | Best. No build, runs from any static host, installable to the home screen. | Smallest. A handful of files. | Simplest. Only two outbound calls (ExerciseDB, images); each has a fallback. | Copy files. Rollback is copying the old files. |
| B. Vite + React or Svelte | Fine but adds a build, `node_modules`, and version drift for 21 records. | Medium. | Same runtime failures plus build failures. | Needs a build step on every change. |
| C. Native iOS (SwiftUI) | The Mac has Xcode tools, but App Store or sideload friction, YouTube via WKWebView, and no Android. | Large. | More. | Hardest. |
| D. Laravel app (the user's day job stack) | Needs a server and a database for static data. Over built. | Large. | Much more. | Needs hosting. |

**Chosen: A.** Rejected B because the build adds nothing for 21 records. Rejected C because the user may not always carry an iPhone and sideloading expires. Rejected D because there is no dynamic data.

### Decision 2: animation source

| Option | Fit | Blast radius | Failure path | Licence risk |
|---|---|---|---|---|
| 1. ExerciseDB live GIF only | Matches "animation or 3D" (F16). | Small. | App shows nothing when the API is down or rate limited (F18). | Terms forbid storage (F19); live use is allowed. |
| 2. `free-exercise-db` only, images copied into the repo | Works offline, public domain (F22). | Small. | None at runtime. | None. But it is two still frames, not an animation, and drawn in a flat style. |
| **3. ExerciseDB live first, `free-exercise-db` copied locally as fallback** | Best of both. | Small. | Handled: timeout 6 s, then fallback, then text. | ExerciseDB used strictly live; fallback is public domain. |
| 4. True 3D (Three.js + bought animation packs) | Nothing free per exercise (F27). | Large. | High. | Paid packs. |

**Chosen: 3.** The ExerciseDB figure is the "3D" view the user asked for. The fallback keeps the page useful in a basement gym with poor signal. Rejected 4 as not buildable without buying assets and weeks of work.

### Decision 3: how videos are shown

| Option | Fit | Failure path |
|---|---|---|
| **1. Link cards: thumbnail from `i.ytimg.com` + title + length, link to `youtube.com/watch?v=`** | Opens the YouTube app full screen, which is what you want between sets. Works for Shorts. | A deleted video shows YouTube's own "unavailable" page. `npm run verify` catches it. |
| 2. Inline `<iframe>` embeds | Looks richer. | Some channels disable embedding, iframes are heavy on a phone, autoplay rules vary, and a service worker cannot cache them. |

**Chosen: 1.** Rejected 2 for weight and embed restrictions. Do not add an embed toggle.

### Decision 4: offline support

A service worker caches only same origin files (app shell, data file, local fallback images). It never touches `oss.exercisedb.dev`, `static.exercisedb.dev`, `i.ytimg.com` or `youtube.com` (F19). Cache name carries a version string; bump it on every data change.

### Decision 5: hosting

Build and prove the app locally. Hosting is the user's call (A6). Step 9 lists two options with exact commands. GitHub Pages is recommended because it is HTTPS (required for service workers and home screen install on iOS) and free.

### Standing rules from the Change Asset lessons, mapped to this project

* Time zones: the app stores no dates. The only persisted value is the last opened day in `localStorage`. There is nothing to check.
* One code path: one `renderVariant()` function renders every variant of every exercise from `data/exercises.json`. No exercise is special cased in code. The `barbell` variant on Barbell Curl flows through the same function.
* Tests in a configured suite: `package.json` `"test": "node --test"` collects every file named `*.test.mjs` outside `node_modules`. `node --test tests/` does not work in Node 22 (it treats the folder as a test file), which was checked on the plan date. The definition of done runs `npm test` and shows the test count.

### Pre mortem summary (full stories in section 9)

1. ExerciseDB rate limits or goes away while the user is mid workout. Answered by Step 6 (timeout plus fallback) and Trap 2.
2. A YouTube clip is deleted. Answered by `npm run verify` in Step 4 and the replacement procedure in Trap 7.
3. The service worker keeps serving an old data file after an edit. Answered by Step 7 (versioned cache, `skipWaiting`) and Trap 8.

### State enumeration (drives the test plan)

| State | Expected behaviour |
|---|---|
| First load, online | Push day list shows 7 exercises. |
| Revisit | Last opened day restored from `localStorage`; hash route wins over it when present. |
| Open exercise, online, API ok | GIF, live instructions, target muscles, videos, tip, guide link. |
| Open exercise, API slow (> 6 s) or 429/503 | Fallback two frame animation and the tip; no error dialog. |
| Open exercise with `exercisedb: null` and `fallback: null` (`legs-6.dumbbell`) | Text "No animation for this version. Use the video." |
| Open exercise with id but no fallback (`legs-5.dumbbell`) and API failing | Same text. |
| Offline, app previously loaded | Shell, list, tips, fallback images work; GIF area shows fallback; video cards show without thumbnails. |
| Back button | Returns from exercise to day list (hash routing). |
| Phone width 375 px | No horizontal scroll; cards stack. |

---

## 5. Implementation order

1. **Skeleton**: `package.json`, `.gitignore`, `index.html`, `styles.css`, `app.js` (empty module), `manifest.webmanifest`, `.claude/launch.json`. Do this first so every later step can be served and seen.
2. **Data file** `data/exercises.json`, copied exactly from section 6 Step 2. Do before 3 because the test asserts its shape.
3. **Data tests** `tests/data.test.mjs`. Run `npm test`; must be green before any UI work so UI bugs are never data bugs.
4. **Link verifier** `scripts/verify-links.mjs` and `scripts/fetch-fallback-images.mjs`. Run both. Do before 6 because Step 6 loads the local fallback images.
5. **Day list UI** (tabs, exercise rows, hash routing). Serve with `npm start` and look at it in the browser.
6. **Exercise detail UI** (variant toggle, videos, animation with fallback, tip, guide). Depends on 4 for images.
7. **Service worker** `sw.js` + registration. Last among code steps so the cache never hides work in progress.
8. **Browser verification** on desktop and at phone width, including the offline and API failure states.
9. **Hosting hand off**: report and ask (A6). Nothing is published without a yes.

---

## 6. Per step spec

### Step 1: Skeleton

**Goal.** A servable empty app with the exact file layout every later step assumes.

Create:

`package.json`

```json
{
  "name": "gym-plan-app",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Push / Pull / Legs exercise guide with PureGym machine and dumbbell versions",
  "scripts": {
    "start": "python3 -m http.server 8080",
    "test": "node --test",
    "verify": "node scripts/verify-links.mjs",
    "fetch-fallback": "node scripts/fetch-fallback-images.mjs"
  }
}
```

`.gitignore`

```
.DS_Store
node_modules/
```

`.claude/launch.json` (lets the in app browser start the server)

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "gym-app",
      "runtimeExecutable": "python3",
      "runtimeArgs": ["-m", "http.server", "8080"],
      "port": 8080
    }
  ]
}
```

`index.html`

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0f1115">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>Workout Plan #1</title>
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="top">
    <h1>Workout Plan #1</h1>
    <p class="sub">4 sets &middot; 12 / 10 / 10 / 8 reps</p>
    <nav class="days" id="days" aria-label="Training day"></nav>
  </header>
  <main id="view" class="view" aria-live="polite"></main>
  <footer class="foot">
    <p>Animations: ExerciseDB (live) and free-exercise-db (public domain). Videos open in YouTube.</p>
  </footer>
  <script type="module" src="app.js"></script>
</body>
</html>
```

`manifest.webmanifest`

```json
{
  "name": "Workout Plan #1",
  "short_name": "Workout",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#0f1115",
  "theme_color": "#0f1115",
  "icons": [
    { "src": "icon.svg", "sizes": "any", "type": "image/svg+xml" }
  ]
}
```

`icon.svg` (any simple dumbbell glyph; keep it under 2 KB)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0f1115"/><rect x="6" y="24" width="8" height="16" rx="2" fill="#e8e8e8"/><rect x="50" y="24" width="8" height="16" rx="2" fill="#e8e8e8"/><rect x="14" y="20" width="8" height="24" rx="2" fill="#4ade80"/><rect x="42" y="20" width="8" height="24" rx="2" fill="#4ade80"/><rect x="22" y="29" width="20" height="6" rx="3" fill="#e8e8e8"/></svg>
```

`styles.css`: dark theme, mobile first, 16 px side gutters. Full sketch in Step 5. For now it may be empty.

`app.js`: `console.log('app loaded');` for now.

**Why safe.** Nothing here can fail silently; a wrong path shows up as a 404 in the browser.

**Tests.** None. Check: `npm start` then open `http://localhost:8080` and see the header.

### Step 2: Data file

**Goal.** `data/exercises.json` holding everything the UI needs. Copy the JSON below exactly. Do not retype ids.

Schema (plain words):

* `plan`: title, source path, `sets`, `reps` array, `rest` map.
* `days[]`: `id` (`push` | `pull` | `legs`), `name`, `focus`, `exercises[]`.
* `exercises[]`: `id` (`<day>-<order>`), `order` 1 to 7, `name` exactly as the PDF, `type` (`compound` | `isolation`), `asWritten` (which variant key matches the PDF wording, or `"other"`), `variants`.
* `variants`: keys `machine` and `dumbbell` always; `barbell` only on `pull-6`.
* variant: `name`, `kit` (what to find in PureGym and what to use if it is taken), `tip` (one sentence setup cue), `videos[]`, `animation`, `guide` (PureGym page URL or `null`), optional `note`.
* `videos[]`: `id` (11 char YouTube id), `label`, `by` (channel), `seconds` (integer or `null` for Shorts). The first video is the primary one.
* `animation`: `exercisedb` (7 char id or `null`), `fallback` (`free-exercise-db` id or `null`), `note` (string or `null`, shown when the animation is only the closest movement).

```json
{
  "plan": {
    "title": "Push / Pull / Legs Workout Plan",
    "source": "docs/research/anik-workout-plan-1.pdf",
    "sets": 4,
    "reps": [12, 10, 10, 8],
    "rest": { "compound": "75 to 90 sec", "isolation": "45 to 60 sec" }
  },
  "days": [
    {
      "id": "push",
      "name": "Push",
      "focus": "Chest / Shoulders / Triceps",
      "exercises": [
        {
          "id": "push-1",
          "order": 1,
          "name": "Incline Chest Press Machine",
          "type": "compound",
          "asWritten": "machine",
          "variants": {
            "machine": {
              "name": "Incline chest press machine",
              "kit": "Selectorised incline press (Matrix style) or the plate-loaded incline press. If both are busy: Smith machine incline press.",
              "tip": "Set the seat so the handles start just below shoulder height. Press up and slightly in, elbows about 45 degrees from your body.",
              "videos": [
                { "id": "TrTSvn5-MTk", "label": "Incline machine chest press", "by": "Renaissance Periodization", "seconds": 13 },
                { "id": "MtlHy8hvHDs", "label": "How to do incline chest press machine", "by": "Power Foods Lifestyle", "seconds": 43 }
              ],
              "animation": { "exercisedb": "jHAnWmT", "fallback": "Leverage_Incline_Chest_Press", "note": null },
              "guide": null
            },
            "dumbbell": {
              "name": "Incline dumbbell press",
              "kit": "Adjustable bench set to 30 to 45 degrees and two dumbbells.",
              "tip": "Dumbbells start level with the upper chest. Press up and together without letting them clash.",
              "videos": [
                { "id": "oZVCBM9f8Eo", "label": "How to do a dumbbell incline press", "by": "PureGym", "seconds": 16 },
                { "id": "5CECBjd7HLQ", "label": "Incline dumbbell press", "by": "Renaissance Periodization", "seconds": 12 }
              ],
              "animation": { "exercisedb": "ns0SIbU", "fallback": "Incline_Dumbbell_Press", "note": null },
              "guide": "https://www.puregym.com/exercises/chest/bench-press/incline-dumbbell-press/"
            }
          }
        },
        {
          "id": "push-2",
          "order": 2,
          "name": "Dumbbell Pullover",
          "type": "isolation",
          "asWritten": "dumbbell",
          "variants": {
            "machine": {
              "name": "Cable rope pullover (straight arm pulldown)",
              "kit": "Cable machine, high pulley, rope attachment.",
              "tip": "Stand facing the high pulley with arms nearly straight. Pull the rope down to your thighs in an arc and control it back up.",
              "videos": [
                { "id": "ey9Fv3FGrRg", "label": "How to do straight arm lat pulldowns", "by": "PureGym", "seconds": 11 },
                { "id": "G9uNaXGTJ4w", "label": "Straight arm pulldown", "by": "Renaissance Periodization", "seconds": 12 }
              ],
              "animation": { "exercisedb": "PskORrA", "fallback": "Rope_Straight-Arm_Pulldown", "note": null },
              "guide": "https://www.puregym.com/exercises/back/lat-exercises/straight-arm-lat-pulldown/",
              "note": "Same movement pattern as Pull day exercise 2."
            },
            "dumbbell": {
              "name": "Dumbbell pullover",
              "kit": "Flat bench and one dumbbell.",
              "tip": "Lie on the bench holding one dumbbell over your chest with both hands. Lower it behind your head with a slight elbow bend, then pull it back over.",
              "videos": [
                { "id": "jQjWlIwG4sI", "label": "Dumbbell pullover", "by": "Renaissance Periodization", "seconds": 15 }
              ],
              "animation": { "exercisedb": "9XjtHvS", "fallback": "Straight-Arm_Dumbbell_Pullover", "note": null },
              "guide": null
            }
          }
        },
        {
          "id": "push-3",
          "order": 3,
          "name": "Lateral Raise",
          "type": "isolation",
          "asWritten": "dumbbell",
          "variants": {
            "machine": {
              "name": "Lateral raise machine",
              "kit": "Lateral raise machine (pads rest against the upper arms). If it is taken: cable lateral raise on the cable machine.",
              "tip": "Set the seat so your shoulder joint lines up with the machine pivot. Push with the elbows, not the hands.",
              "videos": [
                { "id": "0o07iGKUarI", "label": "Machine lateral raise", "by": "Renaissance Periodization", "seconds": 12 },
                { "id": "7e_VVcPLgUo", "label": "Ultra Series lateral raise", "by": "Matrix Fitness", "seconds": 35 },
                { "id": "Z5FA9aq3L6A", "label": "Cable lateral raises (if the machine is busy)", "by": "PureGym", "seconds": 15 }
              ],
              "animation": { "exercisedb": "dRTfGZT", "fallback": "Cable_Seated_Lateral_Raise", "note": "Offline picture shows the cable version." },
              "guide": null
            },
            "dumbbell": {
              "name": "Dumbbell lateral raise",
              "kit": "Two light dumbbells.",
              "tip": "Slight forward lean. Raise to shoulder height with the elbows leading, pause, lower slowly.",
              "videos": [
                { "id": "z-kOn7flIZg", "label": "How to do lateral raises", "by": "PureGym", "seconds": 16 },
                { "id": "OuG1smZTsQQ", "label": "Lateral raise", "by": "Renaissance Periodization", "seconds": 11 }
              ],
              "animation": { "exercisedb": "DsgkuIt", "fallback": "Side_Lateral_Raise", "note": null },
              "guide": "https://www.puregym.com/exercises/arms-and-shoulders/lateral-raises/"
            }
          }
        },
        {
          "id": "push-4",
          "order": 4,
          "name": "Chest Press Machine",
          "type": "compound",
          "asWritten": "machine",
          "variants": {
            "machine": {
              "name": "Seated chest press machine",
              "kit": "Seated chest press (selectorised, converging arms).",
              "tip": "Handles level with mid chest, shoulder blades back on the pad. Press without locking the elbows.",
              "videos": [
                { "id": "CIykDiF4sfg", "label": "How to do a seated chest press", "by": "PureGym", "seconds": 16 },
                { "id": "sqNwDkUU_Ps", "label": "How to use the chest press machine", "by": "PureGym", "seconds": 61 },
                { "id": "WHjKUg5-LUY", "label": "Ultra Series converging chest press", "by": "Matrix Fitness", "seconds": 38 }
              ],
              "animation": { "exercisedb": "DOoWcnA", "fallback": "Machine_Bench_Press", "note": null },
              "guide": "https://www.puregym.com/exercises/chest/bench-press/seated-chest-press/"
            },
            "dumbbell": {
              "name": "Flat dumbbell bench press",
              "kit": "Flat bench and two dumbbells.",
              "tip": "Feet flat, slight arch. Lower to chest level and press up and slightly in.",
              "videos": [
                { "id": "AduT4Eq-iP0", "label": "How to do a dumbbell bench press", "by": "PureGym", "seconds": 16 }
              ],
              "animation": { "exercisedb": "SpYC0Kp", "fallback": "Dumbbell_Bench_Press", "note": null },
              "guide": "https://www.puregym.com/exercises/chest/bench-press/dumbbell-bench-press/"
            }
          }
        },
        {
          "id": "push-5",
          "order": 5,
          "name": "Cable Chest Fly",
          "type": "isolation",
          "asWritten": "machine",
          "variants": {
            "machine": {
              "name": "Cable chest fly (cable crossover)",
              "kit": "Dual cable machine with the pulleys set high. If the cables are busy: the chest fly machine (pec deck).",
              "tip": "Split stance, slight elbow bend. Bring the handles together in front of your chest and squeeze for a second.",
              "videos": [
                { "id": "QcTcWpkn_bw", "label": "How to do a cable fly / cable crossover", "by": "PureGym", "seconds": 16 },
                { "id": "eGjt4lk6g34", "label": "How to use the chest fly machine", "by": "PureGym", "seconds": 16 }
              ],
              "animation": { "exercisedb": "0CXGHya", "fallback": "Cable_Crossover", "note": null },
              "guide": "https://www.puregym.com/exercises/chest/chest-fly/cable-flyes/"
            },
            "dumbbell": {
              "name": "Dumbbell chest fly",
              "kit": "Flat bench and two light dumbbells.",
              "tip": "Keep a slight bend in the elbows. Open the arms until you feel a stretch, then bring the dumbbells back over the chest in an arc.",
              "videos": [
                { "id": "Nhvz9EzdJ4U", "label": "How to do a dumbbell chest fly", "by": "PureGym", "seconds": 16 }
              ],
              "animation": { "exercisedb": "yz9nUhF", "fallback": "Dumbbell_Flyes", "note": null },
              "guide": "https://www.puregym.com/exercises/chest/chest-fly/dumbbell-chest-fly/"
            }
          }
        },
        {
          "id": "push-6",
          "order": 6,
          "name": "Tricep Pushdown",
          "type": "isolation",
          "asWritten": "machine",
          "variants": {
            "machine": {
              "name": "Cable tricep pushdown",
              "kit": "Cable machine, high pulley, rope or straight bar.",
              "tip": "Elbows pinned to your sides. Push down until the arms are straight, then control the way up.",
              "videos": [
                { "id": "LXkCrxn3caQ", "label": "How to do a tricep pushdown", "by": "PureGym", "seconds": 16 },
                { "id": "-xa-6cQaZKY", "label": "Rope pushdown", "by": "Renaissance Periodization", "seconds": 12 }
              ],
              "animation": { "exercisedb": "dU605di", "fallback": "Triceps_Pushdown_-_Rope_Attachment", "note": null },
              "guide": "https://www.puregym.com/exercises/arms-and-shoulders/tricep-extension/tricep-pushdowns/"
            },
            "dumbbell": {
              "name": "Dumbbell tricep kickback",
              "kit": "One dumbbell and a bench for support.",
              "tip": "Upper arm parallel to the floor and still. Extend the elbow until the arm is straight, squeeze, lower slowly.",
              "videos": [
                { "id": "JPmbMOu4IYw", "label": "How to do a tricep kickback", "by": "PureGym", "seconds": 19 }
              ],
              "animation": { "exercisedb": "W6PxUkg", "fallback": "Tricep_Dumbbell_Kickback", "note": null },
              "guide": "https://www.puregym.com/exercises/arms-and-shoulders/tricep-extension/tricep-kickbacks/"
            }
          }
        },
        {
          "id": "push-7",
          "order": 7,
          "name": "Overhead Dumbbell Tricep Extension",
          "type": "isolation",
          "asWritten": "dumbbell",
          "variants": {
            "machine": {
              "name": "Cable rope overhead tricep extension",
              "kit": "Cable machine, low or mid pulley, rope attachment. The tricep extension machine is an alternative.",
              "tip": "Face away from the cable with the rope behind your head and elbows by your ears. Extend until the arms are straight.",
              "videos": [
                { "id": "kqidUIf1eJE", "label": "Rope overhead triceps extension", "by": "Renaissance Periodization", "seconds": 13 },
                { "id": "1u18yJELsh0", "label": "Cable overhead triceps extension", "by": "Renaissance Periodization", "seconds": 12 }
              ],
              "animation": { "exercisedb": "2IxROQ1", "fallback": "Cable_Rope_Overhead_Triceps_Extension", "note": null },
              "guide": null
            },
            "dumbbell": {
              "name": "Overhead dumbbell tricep extension",
              "kit": "One dumbbell, standing or seated.",
              "tip": "Hold the dumbbell overhead with both hands. Lower it behind your head by bending only the elbows, then press up.",
              "videos": [
                { "id": "9wxRhONFsRA", "label": "How to do an overhead tricep extension", "by": "PureGym", "seconds": 21 }
              ],
              "animation": { "exercisedb": "PdmaD0N", "fallback": "Standing_Dumbbell_Triceps_Extension", "note": null },
              "guide": "https://www.puregym.com/exercises/arms-and-shoulders/tricep-extension/overhead-tricep-extension/"
            }
          }
        }
      ]
    },
    {
      "id": "pull",
      "name": "Pull",
      "focus": "Back / Rear Delts / Biceps",
      "exercises": [
        {
          "id": "pull-1",
          "order": 1,
          "name": "Lat Pulldown",
          "type": "compound",
          "asWritten": "machine",
          "variants": {
            "machine": {
              "name": "Lat pulldown machine",
              "kit": "Lat pulldown station with the wide bar.",
              "tip": "Thigh pad snug, slight lean back. Pull the bar to the top of the chest with the elbows down and back.",
              "videos": [
                { "id": "JGeRYIZdojU", "label": "How to do a lat pulldown", "by": "PureGym", "seconds": 14 },
                { "id": "EUIri47Epcg", "label": "Normal grip pulldown", "by": "Renaissance Periodization", "seconds": 15 }
              ],
              "animation": { "exercisedb": "RVwzP10", "fallback": "Wide-Grip_Lat_Pulldown", "note": null },
              "guide": "https://www.puregym.com/exercises/back/lat-exercises/lat-pulldown/"
            },
            "dumbbell": {
              "name": "Single arm dumbbell row",
              "kit": "One dumbbell and a bench.",
              "tip": "Hand and knee on the bench, flat back. Pull the dumbbell to your hip and lower under control.",
              "videos": [
                { "id": "ZRSGpBUVcNw", "label": "How to do single arm dumbbell rows", "by": "PureGym", "seconds": 11 }
              ],
              "animation": { "exercisedb": "C0MA9bC", "fallback": "One-Arm_Dumbbell_Row", "note": null },
              "guide": "https://www.puregym.com/exercises/back/rows/single-arm-dumbbell-row/"
            }
          }
        },
        {
          "id": "pull-2",
          "order": 2,
          "name": "Straight Arm Pulldown",
          "type": "isolation",
          "asWritten": "machine",
          "variants": {
            "machine": {
              "name": "Straight arm cable pulldown",
              "kit": "Cable machine, high pulley, rope or straight bar.",
              "tip": "Arms nearly straight, hinge slightly at the hips. Pull the bar down to your thighs and feel the lats, then control it back up.",
              "videos": [
                { "id": "ey9Fv3FGrRg", "label": "How to do straight arm lat pulldowns", "by": "PureGym", "seconds": 11 },
                { "id": "G9uNaXGTJ4w", "label": "Straight arm pulldown", "by": "Renaissance Periodization", "seconds": 12 }
              ],
              "animation": { "exercisedb": "PskORrA", "fallback": "Straight-Arm_Pulldown", "note": null },
              "guide": "https://www.puregym.com/exercises/back/lat-exercises/straight-arm-lat-pulldown/"
            },
            "dumbbell": {
              "name": "Dumbbell pullover",
              "kit": "Flat bench and one dumbbell.",
              "tip": "Same movement as the pulldown but lying down. Lower the dumbbell behind your head with a slight elbow bend, pull it back over the chest.",
              "videos": [
                { "id": "jQjWlIwG4sI", "label": "Dumbbell pullover", "by": "Renaissance Periodization", "seconds": 15 }
              ],
              "animation": { "exercisedb": "9XjtHvS", "fallback": "Straight-Arm_Dumbbell_Pullover", "note": null },
              "guide": null
            }
          }
        },
        {
          "id": "pull-3",
          "order": 3,
          "name": "Seated Cable Row",
          "type": "compound",
          "asWritten": "machine",
          "variants": {
            "machine": {
              "name": "Seated cable row",
              "kit": "Seated row station (low pulley) with the V handle.",
              "tip": "Chest up. Pull the handle to your stomach, squeeze the shoulder blades, then let the arms straighten fully.",
              "videos": [
                { "id": "lJoozxC0Rns", "label": "How to do a seated cable row", "by": "PureGym", "seconds": 16 },
                { "id": "TeFo51Q_Nsc", "label": "How to use the seated row machine", "by": "PureGym", "seconds": 61 }
              ],
              "animation": { "exercisedb": "fUBheHs", "fallback": "Seated_Cable_Rows", "note": null },
              "guide": "https://www.puregym.com/exercises/back/rows/seated-cable-row/"
            },
            "dumbbell": {
              "name": "Dumbbell bent over row",
              "kit": "Two dumbbells.",
              "tip": "Hinge to about 45 degrees with a flat back. Row both dumbbells to your hips.",
              "videos": [
                { "id": "6gvmcqr226U", "label": "How to do a dumbbell bent over row", "by": "PureGym", "seconds": 16 }
              ],
              "animation": { "exercisedb": "BJ0Hz5L", "fallback": "Bent_Over_Two-Dumbbell_Row", "note": null },
              "guide": "https://www.puregym.com/exercises/back/rows/dumbbell-bent-over-row/"
            }
          }
        },
        {
          "id": "pull-4",
          "order": 4,
          "name": "Diverging Chest Supported Row",
          "type": "compound",
          "asWritten": "machine",
          "variants": {
            "machine": {
              "name": "Diverging seated row (chest supported row machine)",
              "kit": "Matrix Diverging Seated Row: chest pad and two independent arms. Any chest supported row machine works.",
              "tip": "Chest on the pad, seat set so the handles sit at the bottom of the ribcage. Pull the elbows back and wide.",
              "videos": [
                { "id": "O90lC5WcIGE", "label": "Ultra Series diverging seated row", "by": "Matrix Fitness", "seconds": 36 },
                { "id": "0UBRfiO4zDs", "label": "Chest supported row", "by": "Renaissance Periodization", "seconds": 17 }
              ],
              "animation": { "exercisedb": "7I6LNUG", "fallback": "Leverage_Iso_Row", "note": null },
              "guide": null
            },
            "dumbbell": {
              "name": "Chest supported incline dumbbell row",
              "kit": "Incline bench at 30 to 45 degrees and two dumbbells.",
              "tip": "Lie face down on the incline bench. Row both dumbbells to your hips and squeeze the shoulder blades.",
              "videos": [
                { "id": "Nx0TzjgsI-0", "label": "How to do an incline dumbbell row", "by": "PureGym", "seconds": 16 }
              ],
              "animation": { "exercisedb": "7vG5o25", "fallback": "Dumbbell_Incline_Row", "note": null },
              "guide": "https://www.puregym.com/exercises/back/rows/incline-row/"
            }
          }
        },
        {
          "id": "pull-5",
          "order": 5,
          "name": "Face Pull",
          "type": "isolation",
          "asWritten": "machine",
          "variants": {
            "machine": {
              "name": "Cable face pull",
              "kit": "Cable machine, pulley at face height, rope attachment.",
              "tip": "Pull the rope towards your face with the hands finishing beside the ears and elbows high. Pause, then return slowly.",
              "videos": [
                { "id": "0Po47vvj9g4", "label": "How to do cable face pulls", "by": "PureGym", "seconds": 15 },
                { "id": "-MODnZdnmAQ", "label": "Cable rope facepull", "by": "Renaissance Periodization", "seconds": 12 }
              ],
              "animation": { "exercisedb": "wqNPGCg", "fallback": "Face_Pull", "note": "Closest animation: cable rear delt row with rope." },
              "guide": "https://www.puregym.com/exercises/arms-and-shoulders/rear-delt-exercises/face-pulls/"
            },
            "dumbbell": {
              "name": "Bent over dumbbell rear delt fly",
              "kit": "Two light dumbbells, standing or seated.",
              "tip": "Hinge forward with a slight elbow bend. Raise the dumbbells out to the sides level with the shoulders.",
              "videos": [
                { "id": "nlkF7_2O_Lw", "label": "How to do a rear delt fly", "by": "PureGym", "seconds": 16 },
                { "id": "34gVHrkaiz0", "label": "Bent lateral raise", "by": "Renaissance Periodization", "seconds": 11 }
              ],
              "animation": { "exercisedb": "8DiFDVA", "fallback": "Reverse_Flyes", "note": null },
              "guide": "https://www.puregym.com/exercises/arms-and-shoulders/rear-delt-exercises/rear-delt-flyes/"
            }
          }
        },
        {
          "id": "pull-6",
          "order": 6,
          "name": "Barbell Curl",
          "type": "isolation",
          "asWritten": "barbell",
          "variants": {
            "machine": {
              "name": "Cable bar curl",
              "kit": "Cable machine, low pulley, straight or EZ bar. The bicep curl machine is an alternative.",
              "tip": "Elbows fixed at your sides. Curl to shoulder height and lower slowly.",
              "videos": [
                { "id": "GNlopToAZyg", "label": "How to do a cable curl", "by": "PureGym", "seconds": 20 },
                { "id": "opFVuRi_3b8", "label": "Cable EZ bar curl", "by": "Renaissance Periodization", "seconds": 14 }
              ],
              "animation": { "exercisedb": "G08RZcQ", "fallback": "Standing_Biceps_Cable_Curl", "note": null },
              "guide": "https://www.puregym.com/exercises/arms-and-shoulders/bicep-curl/cable-bicep-curls/"
            },
            "dumbbell": {
              "name": "Dumbbell bicep curl",
              "kit": "Two dumbbells.",
              "tip": "Palms up. Curl both dumbbells without swinging and lower for a count of three.",
              "videos": [
                { "id": "MtXdEcW3Eog", "label": "How to double arm curl (dumbbell bicep curl)", "by": "PureGym", "seconds": 29 }
              ],
              "animation": { "exercisedb": "NbVPDMW", "fallback": "Dumbbell_Bicep_Curl", "note": null },
              "guide": "https://www.puregym.com/exercises/arms-and-shoulders/bicep-curl/dumbbell-bicep-curls/"
            },
            "barbell": {
              "name": "Barbell curl (as written)",
              "kit": "Straight or EZ barbell.",
              "tip": "Shoulder width grip, elbows still. Curl to shoulder height.",
              "videos": [
                { "id": "N5x5M1x1Gd0", "label": "How to do a barbell bicep curl", "by": "PureGym", "seconds": 11 }
              ],
              "animation": { "exercisedb": "25GPyDY", "fallback": "Barbell_Curl", "note": null },
              "guide": "https://www.puregym.com/exercises/arms-and-shoulders/bicep-curl/barbell-bicep-curls/"
            }
          }
        },
        {
          "id": "pull-7",
          "order": 7,
          "name": "Hammer Curl",
          "type": "isolation",
          "asWritten": "dumbbell",
          "variants": {
            "machine": {
              "name": "Cable rope hammer curl",
              "kit": "Cable machine, low pulley, rope attachment.",
              "tip": "Neutral grip on the rope, elbows by your sides. Curl up and squeeze.",
              "videos": [
                { "id": "2CDKTFFp5fA", "label": "Rope twist curl", "by": "Renaissance Periodization", "seconds": 14 },
                { "id": "-6ZgZZJTqZA", "label": "Cable rope biceps curl", "by": "Carly Gregson", "seconds": 19 }
              ],
              "animation": { "exercisedb": "HPlPoQA", "fallback": "Cable_Hammer_Curls_-_Rope_Attachment", "note": null },
              "guide": null
            },
            "dumbbell": {
              "name": "Dumbbell hammer curl",
              "kit": "Two dumbbells.",
              "tip": "Palms facing each other. Curl without rotating the wrist.",
              "videos": [
                { "id": "B4RznoFvTl4", "label": "How to do hammer curls", "by": "PureGym", "seconds": 20 },
                { "id": "XOEL4MgekYE", "label": "Hammer curl", "by": "Renaissance Periodization", "seconds": 14 }
              ],
              "animation": { "exercisedb": "2NpxjC1", "fallback": "Hammer_Curls", "note": null },
              "guide": "https://www.puregym.com/exercises/arms-and-shoulders/bicep-curl/hammer-curls/"
            }
          }
        }
      ]
    },
    {
      "id": "legs",
      "name": "Legs",
      "focus": "Quads / Hamstrings / Glutes / Calves",
      "exercises": [
        {
          "id": "legs-1",
          "order": 1,
          "name": "Perfect Squat",
          "type": "compound",
          "asWritten": "machine",
          "variants": {
            "machine": {
              "name": "Matrix Perfect Squat machine",
              "kit": "Matrix Perfect Squat (VY-400): plate-loaded squat machine with shoulder pads and an angled foot plate. If your gym has none, use the hack squat machine.",
              "tip": "Shoulders under the pads, feet mid plate about shoulder width. Release the safety, squat until the thighs pass parallel, drive up through the whole foot.",
              "videos": [
                { "id": "I6I9YlSzFPE", "label": "Matrix Varsity Perfect Squat with sport stance", "by": "Drew Wurst", "seconds": 12 },
                { "id": "VzcaNzgJwMk", "label": "Perfect Squat machine (how to)", "by": "Cave Coach", "seconds": 85 },
                { "id": "scs5XcsZuc8", "label": "Hack squats on the hack squat machine (if no Perfect Squat)", "by": "PureGym", "seconds": 25 }
              ],
              "animation": { "exercisedb": "Qa55kX1", "fallback": "Hack_Squat", "note": "Closest animation: sled hack squat." },
              "guide": "https://www.puregym.com/exercises/legs/quad-exercises/squats/hack-squat/"
            },
            "dumbbell": {
              "name": "Goblet squat",
              "kit": "One dumbbell.",
              "tip": "Hold the dumbbell against your chest. Elbows inside the knees at the bottom, chest up.",
              "videos": [
                { "id": "zBV3ceGyAxw", "label": "How to do a goblet squat", "by": "PureGym", "seconds": 22 },
                { "id": "srZ4D32s4gI", "label": "Goblet squat when the machine is busy (Short)", "by": "PureGym", "seconds": null }
              ],
              "animation": { "exercisedb": "yn8yg1r", "fallback": "Goblet_Squat", "note": null },
              "guide": "https://www.puregym.com/exercises/legs/quad-exercises/squats/goblet-squat/"
            }
          }
        },
        {
          "id": "legs-2",
          "order": 2,
          "name": "Romanian Deadlift",
          "type": "compound",
          "asWritten": "other",
          "variants": {
            "machine": {
              "name": "Smith machine Romanian deadlift",
              "kit": "Smith machine with the bar set at mid thigh height.",
              "tip": "Bar close to the legs, soft knees. Hinge at the hips until you feel the hamstrings stretch, then stand up by squeezing the glutes.",
              "videos": [
                { "id": "G6saqfkdBFQ", "label": "Smith machine Romanian deadlift", "by": "OPEX Fitness", "seconds": 14 },
                { "id": "NBR6tozmx2I", "label": "Smith machine Romanian deadlift", "by": "Avid Fitness", "seconds": 56 }
              ],
              "animation": { "exercisedb": "UfePqpx", "fallback": "Smith_Machine_Stiff-Legged_Deadlift", "note": "Closest animation: Smith machine deadlift." },
              "guide": "https://www.puregym.com/exercises/legs/hamstring-exercises/deadlifts/romanian-deadlift/"
            },
            "dumbbell": {
              "name": "Dumbbell Romanian deadlift",
              "kit": "Two dumbbells.",
              "tip": "Dumbbells slide down the front of the thighs as the hips go back. Flat back, stop at mid shin.",
              "videos": [
                { "id": "cYKYGwcg0U8", "label": "Dumbbell stiff legged deadlift", "by": "Renaissance Periodization", "seconds": 18 },
                { "id": "JreANgCOYUg", "label": "Try dumbbell RDLs when the leg curl is busy (Short)", "by": "PureGym", "seconds": null }
              ],
              "animation": { "exercisedb": "rR0LJzx", "fallback": "Stiff-Legged_Dumbbell_Deadlift", "note": null },
              "guide": "https://www.puregym.com/exercises/legs/hamstring-exercises/deadlifts/romanian-deadlift/"
            }
          }
        },
        {
          "id": "legs-3",
          "order": 3,
          "name": "Leg Press",
          "type": "compound",
          "asWritten": "machine",
          "variants": {
            "machine": {
              "name": "Leg press machine",
              "kit": "45 degree plate-loaded leg press, or the seated leg press.",
              "tip": "Feet shoulder width in the middle of the plate. Lower until the knees reach about 90 degrees and never let the lower back lift off the pad.",
              "videos": [
                { "id": "q4W4_VJbKW0", "label": "How to do a 45 degree leg press", "by": "PureGym", "seconds": 11 },
                { "id": "qCR9bN3G1t4", "label": "How to do a seated leg press", "by": "PureGym", "seconds": 16 },
                { "id": "sI5PJZx73H8", "label": "How to use the Magnum 45 degree leg press", "by": "Matrix Fitness", "seconds": 75 }
              ],
              "animation": { "exercisedb": "10Z2DXU", "fallback": "Leg_Press", "note": null },
              "guide": "https://www.puregym.com/exercises/legs/quad-exercises/leg-presses/45-degree-leg-press/"
            },
            "dumbbell": {
              "name": "Dumbbell squat",
              "kit": "Two dumbbells at your sides, or one held at the chest.",
              "tip": "Feet shoulder width. Sit back and down until the thighs are parallel, then drive up.",
              "videos": [
                { "id": "px3fnV8dCl0", "label": "Leg press taken? Grab a dumbbell and try this (Short)", "by": "PureGym", "seconds": null }
              ],
              "animation": { "exercisedb": "HsvHqgf", "fallback": "Dumbbell_Squat", "note": null },
              "guide": "https://www.puregym.com/exercises/legs/quad-exercises/squats/goblet-squat/"
            }
          }
        },
        {
          "id": "legs-4",
          "order": 4,
          "name": "Back Lunges",
          "type": "compound",
          "asWritten": "other",
          "variants": {
            "machine": {
              "name": "Smith machine reverse lunge",
              "kit": "Smith machine with the bar on the upper back.",
              "tip": "The bar path is fixed, so place the front foot where the knee tracks over the toes. Step back into the lunge and return.",
              "videos": [
                { "id": "TK-5lUZZUOs", "label": "Smith machine reverse lunge", "by": "OPEX Fitness", "seconds": 12 },
                { "id": "bMNZAlCi11w", "label": "Smith machine reverse lunge", "by": "Avid Fitness", "seconds": 59 }
              ],
              "animation": { "exercisedb": "wWFspEi", "fallback": "Smith_Single-Leg_Split_Squat", "note": "Closest animation: Smith machine split squat." },
              "guide": null
            },
            "dumbbell": {
              "name": "Dumbbell reverse lunge",
              "kit": "Two dumbbells, or bodyweight to learn the pattern.",
              "tip": "Step back and lower the back knee towards the floor with the front shin vertical. Push through the front heel to stand.",
              "videos": [
                { "id": "TQfhY5oJ_Sc", "label": "Reverse lunge (with dumbbells)", "by": "Renaissance Periodization", "seconds": 11 },
                { "id": "xrPteyQLGAo", "label": "How to reverse lunge (bodyweight form)", "by": "PureGym", "seconds": 15 }
              ],
              "animation": { "exercisedb": "SSsBDwB", "fallback": "Dumbbell_Rear_Lunge", "note": null },
              "guide": "https://www.puregym.com/exercises/legs/quad-exercises/lunges/reverse-lunges/"
            }
          }
        },
        {
          "id": "legs-5",
          "order": 5,
          "name": "Leg Curl",
          "type": "isolation",
          "asWritten": "machine",
          "variants": {
            "machine": {
              "name": "Leg curl machine (lying or seated)",
              "kit": "Prone (lying) leg curl or seated leg curl machine.",
              "tip": "Pad just above the heels, hips pressed into the bench. Curl all the way up and lower slowly.",
              "videos": [
                { "id": "SbSNUXPRkc8", "label": "How to do a lying leg curl (prone leg curl)", "by": "PureGym", "seconds": 16 },
                { "id": "QjNFk4F5dAs", "label": "How to use the prone leg curl machine", "by": "PureGym", "seconds": 60 }
              ],
              "animation": { "exercisedb": "17lJ1kr", "fallback": "Lying_Leg_Curls", "note": null },
              "guide": "https://www.puregym.com/exercises/legs/hamstring-exercises/hamstring-curls/lying-leg-curl/"
            },
            "dumbbell": {
              "name": "Dumbbell hamstring curl",
              "kit": "One dumbbell and a flat bench.",
              "tip": "Lie face down with the dumbbell gripped between your feet. Curl it towards your glutes and lower under control.",
              "videos": [
                { "id": "z6MvXsikOk0", "label": "How to do dumbbell hamstring curls", "by": "PureGym", "seconds": 11 }
              ],
              "animation": { "exercisedb": "FkBIE6a", "fallback": null, "note": null },
              "guide": "https://www.puregym.com/exercises/legs/hamstring-exercises/hamstring-curls/dumbbell-hamstring-curl/"
            }
          }
        },
        {
          "id": "legs-6",
          "order": 6,
          "name": "Leg Extension",
          "type": "isolation",
          "asWritten": "machine",
          "variants": {
            "machine": {
              "name": "Leg extension machine",
              "kit": "Leg extension machine.",
              "tip": "Knee joint in line with the pivot, pad on the shins just above the ankles. Extend fully, pause, lower slowly.",
              "videos": [
                { "id": "4ZDm5EbiFI8", "label": "How to do a leg extension", "by": "PureGym", "seconds": 14 },
                { "id": "m0FOpMEgero", "label": "Leg extension", "by": "Renaissance Periodization", "seconds": 11 }
              ],
              "animation": { "exercisedb": "my33uHU", "fallback": "Leg_Extensions", "note": null },
              "guide": "https://www.puregym.com/exercises/legs/quad-exercises/leg-extensions/"
            },
            "dumbbell": {
              "name": "Dumbbell leg extension",
              "kit": "A bench and one dumbbell gripped between the feet. PureGym suggests a goblet squat when the machine is busy.",
              "tip": "Sit on the end of the bench with the dumbbell between your feet. Extend the knees until the legs are straight, then lower slowly.",
              "videos": [
                { "id": "2NeAh8KhywY", "label": "Dumbbell leg extension", "by": "Testosterone Nation", "seconds": 28 },
                { "id": "srZ4D32s4gI", "label": "Goblet squat when the leg extension is busy (Short)", "by": "PureGym", "seconds": null }
              ],
              "animation": { "exercisedb": null, "fallback": null, "note": null },
              "guide": null
            }
          }
        },
        {
          "id": "legs-7",
          "order": 7,
          "name": "Standing Calf Raise",
          "type": "isolation",
          "asWritten": "machine",
          "variants": {
            "machine": {
              "name": "Standing calf raise machine",
              "kit": "Standing calf raise machine (shoulder pads). If none: Smith machine calf raise, or calf raises on the leg press.",
              "tip": "Balls of the feet on the step. Lower the heels for a full stretch, rise as high as you can and pause.",
              "videos": [
                { "id": "N3awlEyTY98", "label": "Calf machine", "by": "Renaissance Periodization", "seconds": 12 },
                { "id": "g_E7_q1z2bo", "label": "Hammer Strength Select standing calf raise", "by": "Hammer Strength", "seconds": 19 },
                { "id": "Zep-wKHWkNM", "label": "Calf raises on the Smith machine", "by": "PureGym", "seconds": 15 },
                { "id": "dhRz1Ns60Zg", "label": "Calf raises on the leg press", "by": "PureGym", "seconds": 14 }
              ],
              "animation": { "exercisedb": "ykUOVze", "fallback": "Standing_Calf_Raises", "note": null },
              "guide": "https://www.puregym.com/exercises/legs/calf-exercises/"
            },
            "dumbbell": {
              "name": "Dumbbell standing calf raise",
              "kit": "Dumbbells and a step or a weight plate.",
              "tip": "Dumbbells at your sides, balls of the feet on the edge of the step. Full stretch at the bottom and a pause at the top.",
              "videos": [
                { "id": "ADIDoYt_ko4", "label": "Dumbbell standing calf raise", "by": "OPEX Fitness", "seconds": 13 },
                { "id": "IphGZ8OlfYg", "label": "How to do a single leg calf raise", "by": "PureGym", "seconds": 16 }
              ],
              "animation": { "exercisedb": "dPmaUaU", "fallback": "Standing_Dumbbell_Calf_Raise", "note": null },
              "guide": "https://www.puregym.com/exercises/legs/calf-exercises/"
            }
          }
        }
      ]
    }
  ]
}
```

**Why safe.** Every id above was checked (F8, F15, F23). The JSON is the whole product; the UI only renders it.

**Tests.** Step 3.

### Step 3: Data tests (`tests/data.test.mjs`)

**Goal.** Catch a typo in the data before the UI hides it.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('../data/exercises.json', import.meta.url), 'utf8'));

const PDF_NAMES = {
  push: ['Incline Chest Press Machine', 'Dumbbell Pullover', 'Lateral Raise', 'Chest Press Machine', 'Cable Chest Fly', 'Tricep Pushdown', 'Overhead Dumbbell Tricep Extension'],
  pull: ['Lat Pulldown', 'Straight Arm Pulldown', 'Seated Cable Row', 'Diverging Chest Supported Row', 'Face Pull', 'Barbell Curl', 'Hammer Curl'],
  legs: ['Perfect Squat', 'Romanian Deadlift', 'Leg Press', 'Back Lunges', 'Leg Curl', 'Leg Extension', 'Standing Calf Raise'],
};
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const EXDB_ID = /^[A-Za-z0-9]{7}$/;
const FEDB_ID = /^[A-Za-z0-9_()-]+$/;
const ALLOWED_NO_ANIMATION = new Set(['legs-6.dumbbell']);
const ALLOWED_NO_FALLBACK = new Set(['legs-5.dumbbell', 'legs-6.dumbbell']);

test('plan header matches the PDF', () => {
  assert.equal(data.plan.sets, 4);
  assert.deepEqual(data.plan.reps, [12, 10, 10, 8]);
  assert.ok(data.plan.rest.compound && data.plan.rest.isolation);
});

test('three days with seven exercises each, names and order exactly as the PDF', () => {
  assert.deepEqual(data.days.map((d) => d.id), ['push', 'pull', 'legs']);
  for (const day of data.days) {
    assert.equal(day.exercises.length, 7, day.id);
    assert.deepEqual(day.exercises.map((e) => e.order), [1, 2, 3, 4, 5, 6, 7], day.id);
    assert.deepEqual(day.exercises.map((e) => e.name), PDF_NAMES[day.id], day.id);
    day.exercises.forEach((e) => assert.equal(e.id, `${day.id}-${e.order}`));
  }
});

test('every exercise has machine and dumbbell variants with complete fields', () => {
  for (const day of data.days) for (const ex of day.exercises) {
    assert.ok(['compound', 'isolation'].includes(ex.type), ex.id);
    assert.ok(['machine', 'dumbbell', 'barbell', 'other'].includes(ex.asWritten), ex.id);
    assert.ok(ex.variants.machine && ex.variants.dumbbell, ex.id);
    for (const [key, v] of Object.entries(ex.variants)) {
      const where = `${ex.id}.${key}`;
      assert.ok(['machine', 'dumbbell', 'barbell'].includes(key), where);
      for (const f of ['name', 'kit', 'tip']) assert.ok(typeof v[f] === 'string' && v[f].length > 10, `${where}.${f}`);
      assert.ok(Array.isArray(v.videos) && v.videos.length >= 1, where);
      const ids = new Set();
      for (const vid of v.videos) {
        assert.match(vid.id, YT_ID, where);
        assert.ok(!ids.has(vid.id), `${where} duplicate video ${vid.id}`); ids.add(vid.id);
        assert.ok(vid.label && vid.by, where);
        assert.ok(vid.seconds === null || Number.isInteger(vid.seconds), where);
      }
      const a = v.animation;
      assert.ok(a && 'exercisedb' in a && 'fallback' in a && 'note' in a, where);
      if (a.exercisedb !== null) assert.match(a.exercisedb, EXDB_ID, where);
      if (a.fallback !== null) assert.match(a.fallback, FEDB_ID, where);
      if (a.exercisedb === null && a.fallback === null) assert.ok(ALLOWED_NO_ANIMATION.has(where), `${where} has no animation`);
      if (a.fallback === null) assert.ok(ALLOWED_NO_FALLBACK.has(where), `${where} has no fallback`);
      assert.ok(v.guide === null || v.guide.startsWith('https://www.puregym.com/'), where);
    }
    if (ex.asWritten !== 'other') assert.ok(ex.variants[ex.asWritten], `${ex.id} asWritten points at a missing variant`);
  }
});

test('only Barbell Curl has a barbell variant', () => {
  const withBarbell = data.days.flatMap((d) => d.exercises).filter((e) => e.variants.barbell).map((e) => e.id);
  assert.deepEqual(withBarbell, ['pull-6']);
});

test('every video id is in the research oEmbed check', async () => {
  const checked = JSON.parse(await readFile(new URL('../docs/research/oembed-check.json', import.meta.url), 'utf8'));
  for (const day of data.days) for (const ex of day.exercises) for (const v of Object.values(ex.variants)) for (const vid of v.videos) {
    assert.ok(checked[vid.id]?.ok, `${vid.id} missing from docs/research/oembed-check.json`);
  }
});
```

Run `npm test`. Expect 5 passing tests. The last test ties the data to the research file so a hand typed id is rejected until it is verified.

**Why safe.** Pure file reads. No network.

### Step 4: Link verifier and fallback image fetcher

**Goal.** A repeatable network check (run on demand, not in `npm test`) and a one time download of the public domain fallback images.

`scripts/verify-links.mjs`

```js
import { readFile } from 'node:fs/promises';
const data = JSON.parse(await readFile(new URL('../data/exercises.json', import.meta.url), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { 'User-Agent': 'gym-plan-app verify script' };
let failures = 0;
const row = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures++; };

const variants = data.days.flatMap((d) => d.exercises.flatMap((e) => Object.entries(e.variants).map(([k, v]) => [`${e.id}.${k}`, v])));

// 1. YouTube: oEmbed answers 200 for public videos.
const seen = new Set();
for (const [where, v] of variants) for (const vid of v.videos) {
  if (seen.has(vid.id)) continue; seen.add(vid.id);
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${vid.id}`)}&format=json`;
  const res = await fetch(url, { headers: UA });
  row(res.ok, `youtube ${vid.id} ${res.status} (${where})`);
  await sleep(150);
}

// 2. ExerciseDB GIFs: HEAD on the static host. Spaced out because the API family rate limits (plan F18).
for (const [where, v] of variants) {
  const id = v.animation.exercisedb; if (!id) continue;
  const res = await fetch(`https://static.exercisedb.dev/media/${id}.gif`, { method: 'HEAD', headers: UA });
  row(res.ok && (res.headers.get('content-type') || '').includes('image/gif'), `exercisedb ${id} ${res.status} (${where})`);
  await sleep(1000);
}

// 3. Fallback images in the repo.
for (const [where, v] of variants) {
  const id = v.animation.fallback; if (!id) continue;
  for (const n of [0, 1]) {
    try { await readFile(new URL(`../media/fallback/${id}/${n}.jpg`, import.meta.url)); row(true, `fallback ${id}/${n}.jpg (${where})`); }
    catch { row(false, `fallback ${id}/${n}.jpg missing, run npm run fetch-fallback (${where})`); }
  }
}

console.log(failures ? `\n${failures} failure(s)` : '\nall links ok');
process.exit(failures ? 1 : 0);
```

`scripts/fetch-fallback-images.mjs`

```js
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
const data = JSON.parse(await readFile(new URL('../data/exercises.json', import.meta.url), 'utf8'));
const BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const ids = new Set(data.days.flatMap((d) => d.exercises.flatMap((e) => Object.values(e.variants).map((v) => v.animation.fallback).filter(Boolean))));
for (const id of ids) {
  const dir = new URL(`../media/fallback/${id}/`, import.meta.url);
  await mkdir(dir, { recursive: true });
  for (const n of [0, 1]) {
    const target = new URL(`${n}.jpg`, dir);
    try { await access(target); console.log(`have ${id}/${n}.jpg`); continue; } catch {}
    const res = await fetch(`${BASE}${id}/${n}.jpg`);
    if (!res.ok) { console.error(`FAIL ${id}/${n}.jpg ${res.status}`); process.exitCode = 1; continue; }
    await writeFile(target, Buffer.from(await res.arrayBuffer()));
    console.log(`saved ${id}/${n}.jpg`);
  }
}
```

Also add `media/fallback/LICENSE.txt` with two lines: the images come from `https://github.com/yuhonas/free-exercise-db` and are released under the Unlicense (public domain) (F22).

Run `npm run fetch-fallback` (expect 80 files, 40 folders), then `npm run verify` (expect `all links ok`, exit 0). The verify run takes about 2 minutes because of the 1 second spacing.

**Why safe.** Downloads only public domain files into the repo (F22). Never downloads from ExerciseDB (F19).

**Tests.** Add to `tests/data.test.mjs`:

```js
test('every fallback id has both local images', async () => {
  for (const day of data.days) for (const ex of day.exercises) for (const [k, v] of Object.entries(ex.variants)) {
    const id = v.animation.fallback; if (!id) continue;
    for (const n of [0, 1]) await readFile(new URL(`../media/fallback/${id}/${n}.jpg`, import.meta.url));
  }
});
```

### Step 5: Day list UI

**Goal.** Tabs for Push / Pull / Legs and a list of the day's exercises with sets, reps and rest. Hash routing so the phone's back button works.

Routes: `#/push`, `#/pull`, `#/legs`, `#/push/push-1/machine`. Unknown or empty hash falls back to `localStorage.day` then `push`.

`app.js` (whole file; Step 6 adds `renderExercise`)

```js
const API = 'https://oss.exercisedb.dev/api/v1/exercises/';
const GIF_TIMEOUT_MS = 6000;
const state = { data: null, live: new Map() }; // live: exerciseId -> API response for this page load only

async function main() {
  const res = await fetch('data/exercises.json', { cache: 'no-cache' });
  state.data = await res.json();
  window.addEventListener('hashchange', render);
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const dayIds = state.data.days.map((d) => d.id);
  let day = dayIds.includes(parts[0]) ? parts[0] : (localStorage.getItem('day') || 'push');
  if (!dayIds.includes(day)) day = 'push';
  return { day, exercise: parts[1] || null, variant: parts[2] || null };
}

function render() {
  const r = route();
  localStorage.setItem('day', r.day);
  renderTabs(r.day);
  const day = state.data.days.find((d) => d.id === r.day);
  const ex = r.exercise ? day.exercises.find((e) => e.id === r.exercise) : null;
  const view = document.getElementById('view');
  view.innerHTML = '';
  if (ex) renderExercise(view, day, ex, r.variant); else renderDay(view, day);
  window.scrollTo(0, 0);
}

function renderTabs(active) {
  const nav = document.getElementById('days');
  nav.innerHTML = '';
  for (const d of state.data.days) {
    const a = document.createElement('a');
    a.href = `#/${d.id}`; a.textContent = d.name; a.className = 'tab' + (d.id === active ? ' active' : '');
    a.setAttribute('aria-current', d.id === active ? 'page' : 'false');
    nav.appendChild(a);
  }
}

function restFor(ex) { return state.data.plan.rest[ex.type]; }
function repsText() { return state.data.plan.reps.join(' / '); }

function renderDay(view, day) {
  const h = el('h2', 'day-title', `${day.name} day`);
  const focus = el('p', 'focus', day.focus);
  const list = el('ol', 'list');
  for (const ex of day.exercises) {
    const li = el('li', 'row');
    const a = document.createElement('a');
    a.href = `#/${day.id}/${ex.id}/machine`; a.className = 'row-link';
    a.append(el('span', 'order', String(ex.order)), el('span', 'name', ex.name),
      el('span', 'meta', `${state.data.plan.sets} x ${repsText()} · rest ${restFor(ex)}`));
    li.appendChild(a); list.appendChild(li);
  }
  view.append(h, focus, list);
}

function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

main();
```

`styles.css` sketch (mobile first; the executor may polish but must keep these rules):

```css
:root { --bg: #0f1115; --card: #181b22; --text: #e8e8e8; --muted: #9aa3b2; --accent: #4ade80; --line: #262a33; }
@media (prefers-color-scheme: light) { :root { --bg: #f6f7f9; --card: #fff; --text: #111; --muted: #555; --line: #ddd; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; padding: 0 16px calc(24px + env(safe-area-inset-bottom)); }
.top h1 { font-size: 22px; margin: 16px 0 2px; } .sub { color: var(--muted); margin: 0 0 12px; }
.days { display: flex; gap: 8px; } .tab { flex: 1; text-align: center; padding: 10px; border-radius: 10px; background: var(--card); color: var(--text); text-decoration: none; border: 1px solid var(--line); }
.tab.active { background: var(--accent); color: #0f1115; font-weight: 600; }
.list { list-style: none; padding: 0; margin: 12px 0; } .row-link { display: grid; grid-template-columns: 32px 1fr; gap: 2px 10px; padding: 12px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; margin-bottom: 8px; color: inherit; text-decoration: none; }
.order { grid-row: span 2; font-weight: 700; color: var(--accent); } .meta { color: var(--muted); font-size: 14px; }
.segment { display: flex; gap: 6px; margin: 12px 0; } .segment a { flex: 1; text-align: center; padding: 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: inherit; text-decoration: none; } .segment a.active { background: var(--accent); color: #0f1115; font-weight: 600; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px; margin-bottom: 10px; }
.anim { width: 100%; max-width: 360px; aspect-ratio: 1; display: block; margin: 0 auto; background: #fff; border-radius: 8px; position: relative; overflow: hidden; }
.anim img { width: 100%; height: 100%; object-fit: contain; display: block; }
.frames img { position: absolute; inset: 0; animation: swap 2s steps(1) infinite; } .frames img:nth-child(2) { animation-delay: 1s; }
@keyframes swap { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
.video { display: grid; grid-template-columns: 120px 1fr; gap: 10px; align-items: center; color: inherit; text-decoration: none; margin-bottom: 8px; }
.video img { width: 120px; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 8px; background: #000; }
.badge { display: inline-block; font-size: 12px; padding: 2px 8px; border-radius: 999px; background: var(--line); color: var(--muted); margin-left: 6px; }
.steps { padding-left: 18px; margin: 6px 0; } .muted { color: var(--muted); }
.foot { color: var(--muted); font-size: 12px; margin-top: 24px; }
```

**Why safe.** Rendering only; no network beyond the data file. Hash routing avoids a server rewrite rule, so the app works on any static host.

**Tests.** Manual in the browser: three tabs, 7 rows per tab, tapping a tab changes the hash, reload keeps the day, back button returns to the previous day.

### Step 6: Exercise detail UI

**Goal.** For one exercise: segment control over its variants (machine, dumbbell, and barbell when present), the chosen variant's kit, tip, animation, live instructions, videos and guide link.

Add to `app.js`:

```js
const VARIANT_LABEL = { machine: 'Machine (PureGym)', dumbbell: 'Dumbbells', barbell: 'Barbell (as written)' };

function renderExercise(view, day, ex, variantKey) {
  const keys = Object.keys(ex.variants);
  const key = keys.includes(variantKey) ? variantKey : 'machine';
  const v = ex.variants[key];

  const back = document.createElement('a'); back.href = `#/${day.id}`; back.textContent = `‹ ${day.name} day`; back.className = 'muted';
  const h = el('h2', 'day-title', `${ex.order}. ${ex.name}`);
  const meta = el('p', 'meta', `${state.data.plan.sets} sets x ${repsText()} · rest ${restFor(ex)} (${ex.type})`);

  const seg = el('nav', 'segment');
  for (const k of keys) {
    const a = document.createElement('a'); a.href = `#/${day.id}/${ex.id}/${k}`; a.textContent = VARIANT_LABEL[k];
    a.className = k === key ? 'active' : ''; if (ex.asWritten === k) a.append(el('span', 'badge', 'in plan'));
    seg.appendChild(a);
  }

  const info = el('section', 'card');
  info.append(el('h3', null, v.name), el('p', null, v.kit), el('p', null, v.tip));
  if (v.note) info.append(el('p', 'muted', v.note));
  if (v.guide) { const g = document.createElement('a'); g.href = v.guide; g.target = '_blank'; g.rel = 'noopener'; g.textContent = 'PureGym written guide'; info.append(g); }

  const anim = el('section', 'card'); anim.append(el('h3', null, 'Animation'));
  const box = el('div', 'anim'); anim.append(box);
  const steps = el('div'); anim.append(steps);
  loadAnimation(v, box, steps);

  const vids = el('section', 'card'); vids.append(el('h3', null, 'Videos'));
  for (const vid of v.videos) {
    const a = document.createElement('a'); a.className = 'video'; a.href = `https://www.youtube.com/watch?v=${vid.id}`; a.target = '_blank'; a.rel = 'noopener';
    const img = document.createElement('img'); img.src = `https://i.ytimg.com/vi/${vid.id}/hqdefault.jpg`; img.alt = ''; img.loading = 'lazy'; img.width = 120; img.height = 68;
    const t = el('div'); t.append(el('div', null, vid.label), el('div', 'meta', `${vid.by} · ${vid.seconds === null ? 'Short' : vid.seconds + ' s'}`));
    a.append(img, t); vids.appendChild(a);
  }
  view.append(back, h, meta, seg, info, anim, vids);
}

async function loadAnimation(v, box, steps) {
  const a = v.animation;
  if (a.exercisedb) {
    try {
      const live = await fetchLive(a.exercisedb);
      const img = document.createElement('img'); img.src = live.gifUrl; img.alt = live.name; img.width = 360; img.height = 360;
      box.replaceChildren(img);
      if (a.note) steps.append(el('p', 'muted', a.note));
      if (Array.isArray(live.instructions) && live.instructions.length) {
        const ol = el('ol', 'steps');
        for (const s of live.instructions) ol.append(el('li', null, s.replace(/^Step:\d+\s*/, '')));
        steps.append(el('p', 'muted', `Target: ${(live.targetMuscles || []).join(', ')}`), ol);
      }
      return;
    } catch { /* fall through to the fallback */ }
  }
  if (a.fallback) {
    const frames = el('div', 'frames');
    for (const n of [0, 1]) { const img = document.createElement('img'); img.src = `media/fallback/${a.fallback}/${n}.jpg`; img.alt = n ? 'end position' : 'start position'; frames.append(img); }
    box.replaceChildren(frames);
    steps.append(el('p', 'muted', a.note || 'Start and end position (offline picture).'));
    return;
  }
  box.replaceChildren(el('p', 'muted', 'No animation for this version. Use the video.'));
}

async function fetchLive(id) {
  if (state.live.has(id)) return state.live.get(id);
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), GIF_TIMEOUT_MS);
  try {
    const res = await fetch(API + id, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    if (!json.success || !json.data?.gifUrl) throw new Error('bad payload');
    state.live.set(id, json.data); // memory only, gone on reload (terms of use, plan F19)
    return json.data;
  } finally { clearTimeout(t); }
}
```

**Why safe.**

* One API call per opened variant, cached in memory for the page session only, so a user flipping between machine and dumbbells does not spend two calls each time (F18, F19).
* The GIF is rendered straight from the live `gifUrl`; the app never stores the URL, the GIF, the name or the instructions anywhere persistent (F19).
* A timeout of 6 seconds then the fallback keeps the page useful on a weak signal.
* Video cards use plain links, so a video that disables embedding still plays in the YouTube app (Decision 3).

**Tests.** Manual, see Step 8. Plus a pure function test is possible: move `route()` into `app-core.mjs`? Not worth it; `route()` is 6 lines and is covered by the browser checks. Do not restructure for tests.

### Step 7: Service worker

**Goal.** The app shell and local images load without signal. Nothing cross origin is ever cached.

`sw.js`

```js
const VERSION = 'gym-v1'; // bump on every data or code change
const SHELL = ['./', './index.html', './styles.css', './app.js', './data/exercises.json', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // never touch ExerciseDB, YouTube, GitHub (plan F19)
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && url.pathname.includes('/media/fallback/')) caches.open(VERSION).then((c) => c.put(e.request, res.clone()));
      return res;
    }))
  );
});
```

Registration is already in `main()` (Step 5).

**Why safe.** Same origin only. Shell is cache first, which is right for files that only change when `VERSION` changes. Fallback images are cached on first use. Any other origin passes straight through to the network, which keeps the ExerciseDB usage strictly live.

**Tests.** Step 8 offline check. Also: after changing `data/exercises.json` without bumping `VERSION`, a reload must still show old data (expected), and after bumping `VERSION` two reloads show the new data. Write that observation in the final report.

### Step 8: Browser verification

Use the in app browser with `preview_start` name `gym-app` (from `.claude/launch.json`), or `npm start` and open `http://localhost:8080`.

Check and record each:

1. Push tab shows 7 rows in PDF order with `4 x 12 / 10 / 10 / 8` and the right rest text (compound vs isolation).
2. Open `Incline Chest Press Machine`: segment shows Machine (PureGym) and Dumbbells; Machine shows a GIF from `static.exercisedb.dev`, instructions, two video cards with thumbnails; Dumbbells shows the `in plan` badge off and the PureGym guide link.
3. Open `Barbell Curl`: three segments; `Barbell (as written)` carries the `in plan` badge.
4. Open `Leg Extension` then Dumbbells: text "No animation for this version. Use the video." and two video cards.
5. Block the API (in the browser's network conditions or by editing `API` to a dead host temporarily) and open `Leg Press`: two frame fallback shows within about 6 seconds. Revert the edit.
6. Resize to mobile (375 px wide): no horizontal scroll, cards stack, tabs fit.
7. Offline: load once online, toggle offline, reload: shell and lists work; animations show fallbacks; video thumbnails are broken images but links still exist.
8. Back button from an exercise returns to the day list.
9. `read_console_messages` shows no uncaught errors.

### Step 9: Hosting hand off (no action without a yes)

Report the two options and stop:

* **GitHub Pages (recommended).** Needs a repository. Commands once the user agrees (run from `/Users/muidhasan/gym`):

```bash
git init && git add . && git commit -m "Workout plan app" && gh repo create gym-plan-app --public --source=. --push
```

Then enable Pages on the `main` branch root in the repository settings. The repository is public because free GitHub Pages needs that; the content is only exercise data and links to public clips. Use `--private` only if the user has a paid GitHub plan. The app has no absolute paths, so it works under `https://<user>.github.io/gym-plan-app/`.

* **Claude Artifact (private link, quick preview).** Publish `index.html` with `files` for `styles.css`, `app.js`, `data/exercises.json`, `icon.svg`, `manifest.webmanifest` and the `media/fallback/**` images. The service worker will not run there; everything else works. Use only if the user prefers a private link over a repository.

---

## 7. Explicitly DO NOT do

| Tempting move | Why not |
|---|---|
| Download ExerciseDB GIFs into the repo, or cache `static.exercisedb.dev` / `oss.exercisedb.dev` in the service worker, localStorage or IndexedDB. | Terms forbid storage beyond 1 hour (F19). |
| Store ExerciseDB names, instructions or `gifUrl` strings in `data/exercises.json`. | Same terms. Only the 7 character id is stored. |
| Prefetch all 42 animations at page load, or add a "warm up" loop. | Rate limits (F18). One call per opened variant. |
| Replace video cards with YouTube iframes. | Decision 3. Embedding restrictions and weight on a phone. |
| Add a rest timer, set logger, weight tracker, or user accounts. | Not asked. The user wants a reference guide for the gym. |
| Rename or reorder exercises to "better" names. | The test pins the PDF names (F1 to F3). The trainer's wording is the index the user reads from. |
| Add a framework, bundler, TypeScript or any npm dependency. | Decision 1. The whole app is four source files. |
| Invent new YouTube IDs or ExerciseDB ids while coding. | Every id must appear in `docs/research/oembed-check.json` or `animation-head-check.txt`; the data test enforces the first. If a clip must change, follow Trap 7. |
| Create a git repository, a GitHub repository, or publish anywhere before the user says yes. | A6 and Step 9. |
| Use `yt-dlp` or scrape YouTube pages at runtime or in scripts. | Blocked by bot checks (F13); oEmbed is enough. |
| Copy anything from MuscleWiki. | Blocked and not licensed (F26). |
| Try to build a true 3D viewer. | F27. Out of scope. |

---

## 8. Interaction traps (read before coding)

1. **`fetch` of the data file needs HTTP.** Opening `index.html` from Finder shows an empty page (F25). Always `npm start`.
2. **ExerciseDB answers 429 or 503 under bursts.** Never loop over ids in the browser. In `scripts/verify-links.mjs` keep the 1 second spacing. If the verify run hits 429, wait a minute and rerun; do not lower the spacing.
3. **The API response is the only place GIF URLs and instructions may live.** `state.live` is a plain `Map` created per page load. Do not move it to `localStorage` "for speed".
4. **YouTube IDs can start with a minus sign** (`-xa-6cQaZKY`, `-MODnZdnmAQ`, `-6ZgZZJTqZA`). They are fine in JSON and URLs. On a shell command line they need quoting (`'-xa-6cQaZKY'`) or they look like a flag.
5. **Shorts have `seconds: null`.** Render "Short", never `null s`.
6. **Duplicate clips across exercises are intentional** (F32): `ey9Fv3FGrRg`, `G9uNaXGTJ4w`, `jQjWlIwG4sI`, `srZ4D32s4gI` each appear under two exercises. The uniqueness test is per variant, not global.
7. **Replacing a dead video.** Pick a replacement from `docs/research/puregym-channel-all.txt` (search the title), check it with `curl -s -o /dev/null -w "%{http_code}" "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<id>&format=json"`, add the id to `docs/research/oembed-check.json` with `{"ok": true, "title": "...", "author": "..."}`, then edit the data file. The data test rejects any id not in that file.
8. **Service worker staleness.** Every change to `data/exercises.json`, `app.js` or `styles.css` after the first deploy needs a `VERSION` bump in `sw.js`, otherwise the phone keeps the old files. During development, use the browser's "bypass service worker" option or unregister it, so Step 6 changes show up.
9. **Hash routing and `localStorage` disagree.** The hash always wins; `localStorage.day` is only the fallback for an empty hash. Do not read `localStorage` inside `renderDay`.
10. **Keep the fallback inside `.anim` square.** The ExerciseDB GIFs are 180 x 180 (F16) and the fallback photos are landscape; `object-fit: contain` on a square box keeps both from jumping the layout.
11. **The `barbell` variant must flow through `renderExercise` unchanged.** No `if (ex.id === 'pull-6')` anywhere. The segment control reads `Object.keys(ex.variants)`.
12. **Guide links open PureGym in a new tab.** Use `rel="noopener"`. Do not fetch or embed PureGym pages; they are 220 KB each and not ours.
13. **`asWritten: "other"`** (Romanian Deadlift, Back Lunges) means no variant gets the `in plan` badge. That is correct, not a missing case.

---

## 9. Pre mortem

**Story 1: the animation column dies at the gym.** Two weeks in, ExerciseDB starts answering 429 to the free tier, or AscendAPI turns the free endpoint off. The user opens Leg Press and stares at a spinner.
Answer: `fetchLive` has a 6 second timeout and any non 2xx throws; `loadAnimation` then renders the local two frame fallback from `media/fallback/` (Step 6), which the service worker also serves offline (Step 7). Step 8 item 5 proves this path before shipping. `npm run verify` tells the user when the API is gone for good (A5).

**Story 2: a clip disappears.** PureGym reorganises its channel and `JGeRYIZdojU` goes private. The lat pulldown card opens YouTube's "unavailable" page.
Answer: the card is a link, so the rest of the page still works. `npm run verify` reports `FAIL youtube JGeRYIZdojU 404`, and Trap 7 gives the replacement procedure with the channel listing already on disk. The final report tells the user to run `npm run verify` once a month.

**Story 3: the user edits the data file, the phone shows old data.** After adding a tip, the phone still shows the old tip for days.
Answer: Step 7 uses a versioned cache name with `skipWaiting` and `clients.claim`, and Trap 8 says to bump `VERSION` with every change. Step 7's test records the before and after behaviour so the user has seen it once.

**Story 4 (bonus): the terms of use.** AscendAPI contacts the user because the app stored GIFs.
Answer: the app never stores them. Section 7 row 1 and 2, Trap 3, and the service worker's same origin guard make it impossible without changing code on purpose.

---

## 10. Definition of done

Run from `/Users/muidhasan/gym`:

```bash
npm test
```

Expected: 6 tests, all passing (5 from Step 3 plus the fallback image test from Step 4).

```bash
npm run fetch-fallback
```

Expected: `media/fallback/` holds 40 folders with `0.jpg` and `1.jpg` each (80 files) plus `LICENSE.txt`.

```bash
npm run verify
```

Expected last line `all links ok`, exit code 0. Takes about 2 minutes.

Browser checks in Step 8, all nine recorded in the final report with what was seen.

Files that must exist: `package.json`, `.gitignore`, `.claude/launch.json`, `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `icon.svg`, `data/exercises.json`, `tests/data.test.mjs`, `scripts/verify-links.mjs`, `scripts/fetch-fallback-images.mjs`, `media/fallback/**`.

Must remain untouched: everything under `docs/research/` (except adding entries to `oembed-check.json` per Trap 7) and this plan.

Must not exist: any file under `media/` that came from ExerciseDB; any `node_modules`; any git remote.

The final report must list: test counts, the verify summary line, the nine browser checks, the assumptions A1 to A3 for the user to confirm, and the hosting question from Step 9.
