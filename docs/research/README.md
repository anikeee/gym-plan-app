# Research artifacts for the gym exercise app plan

Collected on 2026-10-07 while writing `docs/gym-exercise-app-plan.md`.

- `anik-workout-plan-1.pdf` and `anik-workout-plan-1.txt`: the workout plan this app is built from (text extracted with `pdftotext -layout`).
- `oembed-check.json`: every YouTube video ID used by the plan, checked against `https://www.youtube.com/oembed`. `ok: true` means the video was public and returned a title and channel name on the collection date.
- `puregym-channel-all.txt`: `id | seconds | title` for every video and Short on the PureGym YouTube channel (channel id `UCBbB-PR9CsGcMnswP04TbhQ`), listed with yt-dlp. Shorts show `NA` for seconds.
- `puregym-library.json`: every page under `https://www.puregym.com/exercises/` with the YouTube IDs embedded on it.
- `ytsearch-gaps.txt` and `ytsearch-rp.txt`: raw YouTube search results used to pick clips the PureGym channel does not have.
- `animation-head-check.txt`: HTTP HEAD results for every ExerciseDB GIF id and every free-exercise-db image the data file references.

Nothing in this folder is app code. The app reads only `data/exercises.json`.
