# Workout Plan

A Push, Pull and Legs exercise guide for PureGym. Every exercise shows a machine version and a dumbbell version, with short videos, an animation and offline pictures. It also logs your sets and tells you when to add weight.

## Download the Android app

**[Download workout-plan.apk](https://github.com/anikeee/gym-plan-app/releases/latest/download/workout-plan.apk)**

This link always gives the newest version. Older versions and what changed in each are on the [releases page](https://github.com/anikeee/gym-plan-app/releases).

1. On your Android phone, tap the link above to download **workout-plan.apk**.
2. Open the download. If Android asks, allow your browser to install apps.
3. If Play Protect says the app is unknown, choose to install anyway. It shows this for any app that is not from the Play Store.

It installs over any earlier version and keeps your log. Needs Android 7 or newer.

The app shows the live web app, so most updates reach it on their own. Close the app fully and open it again to get them.

## Use it in a browser

Open **https://anikeee.github.io/gym-plan-app/** on any phone or computer. Your log stays on that device.

## Plans

Tap the plan name at the top of the day page to switch plans. Your log is kept for every plan.

| Plan | Based on | Sets and reps | Time |
|---|---|---|---|
| **Workout Plan #1** (default) | The plan a personal trainer wrote for the owner of this app | Machines first, 4 sets of 12, 10, 10 and 8 | About 45 min |
| **Muscle Building PPL** | [PureGym blog](https://www.puregym.com/blog/the-best-gym-workout-plan-for-gaining-muscle/), adapted | 3 sets of 8 to 12, five lifts a day | About 45 min |
| **Barbell Strength PPL** | [r/Fitness Reddit PPL](https://thefitness.wiki/reddit-archive/a-linear-progression-based-ppl-program-for-beginners/), adapted | Heavy 5 rep main lifts, then lighter work | About 65 min |
| **Science Based PPL** | [Built With Science](https://builtwithscience.com/fitness-tips/push-pull-legs-routine/), adapted | 2 to 4 sets a lift, extra upper chest, glute and calf work | About 55 min |

The times are estimates. Every change made to the online plans, and the reason for it, is in [`docs/research/plans.json`](docs/research/plans.json).

## What the app does

- **Machine and dumbbell versions:** every exercise shows the PureGym machine and the dumbbell way to do it, plus a barbell way where the plan uses one.
- **Videos and pictures:** short YouTube clips, an animation, and pictures that work offline.
- **Weight log:** type the weight and reps for each set. After a session where you hit every rep, the app suggests one step more weight.
- **Training days:** tap Start training and Finish. The diary shows each day with its time and every set.
- **Done marks and your own order:** tick each exercise when it is done, and drag exercises into the order you like.
- **Backups:** save your log to a file and restore it. The Android app is also included in your phone's own Android backup.

## Run it on a computer

```bash
npm start
```

Then open http://localhost:8642. Other commands:

```bash
npm test
```

```bash
npm run verify
```

`npm test` runs the unit tests. `npm run verify` checks that every video and picture link still works.

## Credits

Videos are YouTube clips, many from the PureGym channel. Animations come from ExerciseDB. Offline pictures come from [free-exercise-db](https://github.com/yuhonas/free-exercise-db), which is public domain. The Android app source is in [`android/`](android/).
