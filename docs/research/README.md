# Research artifacts for the gym exercise app plan

Collected on 2026-10-07 while writing `docs/gym-exercise-app-plan.md`.

- `anik-workout-plan-1.pdf` and `anik-workout-plan-1.txt`: the workout plan this app is built from (text extracted with `pdftotext -layout`).
- `oembed-check.json`: every YouTube video ID used by the plan, checked against `https://www.youtube.com/oembed`. `ok: true` means the video was public and returned a title and channel name on the collection date.
- `puregym-channel-all.txt`: `id | seconds | title` for every video and Short on the PureGym YouTube channel (channel id `UCBbB-PR9CsGcMnswP04TbhQ`), listed with yt-dlp. Shorts show `NA` for seconds.
- `puregym-library.json`: every page under `https://www.puregym.com/exercises/` with the YouTube IDs embedded on it.
- `ytsearch-gaps.txt` and `ytsearch-rp.txt`: raw YouTube search results used to pick clips the PureGym channel does not have.
- `animation-head-check.txt`: HTTP HEAD results for every ExerciseDB GIF id and every free-exercise-db image the data file references.

- `plans.json`: the push pull legs programs read online on 2026-10-09, and the three plans chosen and adapted from them (Muscle Building PPL, Barbell Strength PPL, Science Based PPL), with every swap and the reason.

- Drawn animations (`media/drawn/`, written by `scripts/draw-animations.mjs`): on 2026-10-19 no free animation or picture could be found for the landmine chest press, the single arm landmine press, the landmine squat or the dumbbell leg extension. ExerciseDB V1 has only a landmine lateral raise and a landmine 180. free-exercise-db has Landmine 180s, Landmine Linear Jammer and Single-Arm Linear Jammer, which are rotations or push presses with leg drive, not these strict presses or the squat. wger and Wikimedia Commons have nothing for them. The four were drawn as flat side view figures instead, from the PureGym form text in the data files. On 2026-10-20 three versions that have a live ExerciseDB animation but no free offline picture of the same form got drawings as their offline view: the dumbbell leg curl, the dumbbell lateral lunge (drawn from the front) and the single leg dumbbell deadlift. free-exercise-db has only Barbell_Side_Split_Squat and Kettlebell_One-Legged_Deadlift for the last two, with other implements, so the dumbbell form was drawn instead. The lateral lunge drawing works from the stepped out stance and does not show the step. `tests/drawn.test.mjs` measures every pose against its tip.

Nothing in this folder is app code. The app reads only `data/exercises.json`.

- `library-sources.json`: the exercise library behind the Replace button (`data/library.json`), collected on 2026-10-19: for every version, the PureGym page its setup and form text was written from, and the clips checked for it. The oEmbed results for those clips are in `oembed-check.json`.
