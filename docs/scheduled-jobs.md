# Scheduled jobs

All recurring work lives in [`cronjobs.js`](../cronjobs.js). `initCronJobs()` is called once the HTTPS server is listening, so **cron jobs only run in online mode** (see [setup.md](setup.md#local-mode-and-online-mode)).

Every job uses the `cron` package with the time zone fixed to **Europe/London**, whatever `TZ` is set to. Times below are London time.

## Job list

| Job | Schedule | When | What it does |
|---|---|---|---|
| `postMatchesOfDay` | `1 9 * * *` | 09:01 daily | Posts each of today's matches to the schedule channel with referee and streamer sign-up buttons. |
| `Update team details` | `*/5 * * * *` | Every 5 min | Rewrites the next active team's post in the clubs channel (details, logo, player list). Goes through the teams one at a time. |
| `Update National Selection` | `*/9 7-22 * * *` | Every 9 min, 07:00–22:59 | Same as above for the next national selection's post. Creates the post if it doesn't exist. |
| `notify match start` | `*/2 6-22 * * *` | Every 2 min, 06:00–22:59 | Finds matches starting within 10 minutes, gives each a 4-character lobby password, and posts the lobby details to the lobbies channel and the match thread. Also DMs the referees, streamers and players. |
| `remind missed matches` | `34 21 * * *` | 21:34 daily | Posts past matches that have no result to the schedule channel, with **Enter Result** and **Enter Exported Stats** buttons. |
| `post matches summary of day` | `1 22 * * *` | 22:01 daily | Posts the day's finished results to the daily results channel, grouped by league. |
| `publish next matchday` | `1 22 * * *` | 22:01 daily | For each active league that had a matchday today, publishes that league's next unposted matchday. |
| `ref stats leaderboard` | `11 22 * * *` | 22:11 daily | Edits the season stats post with how many results each referee has entered this season. |
| `update league table` | `35 22 * * *` | 22:35 daily | Edits each active league's standings message. Skips leagues without `standingsMsg`. |
| `detectSteamAlts` | `51 22 * * 1` | 22:51 Mondays | Finds players who share a Steam ID and posts them grouped by Steam ID. |
| `update season cache` | `0 8 * * *` | 08:00 daily | Reloads the current season from the `Seasons` collection into memory. |
| `update steam names` | `11 9,16 * * *` | 09:11 and 16:11 | Fetches Steam profiles in batches of 50 and updates players' `ingamename` and country. Posts name changes to the name-changes channel. |
| `validate steam IDs` | `1 12 * * *` | 12:01 daily | For players with a Steam URL but no `steamId`, works out the numeric ID, using the Steam API for vanity URLs. |
| `find unregisted playerids` | `1 23 * * *` | 23:01 daily | Builds the list of registered server members without the Steam-verified role, for the next job to work through. |
| `Steam verified check` | `*/10 * * * *` | Every 10 min | Checks up to 15 of those members for PSO ownership on Steam. Members who pass get the Steam-verified role, a DM and a post in the registrations channel. |
| `refreshing search indexes` | `0 */6 * * *` | Every 6 hours | Rebuilds the `searchPlayers`, `searchTeams` and `searchNationalSelections` collections used by `/search` and `/api/search`. |
| `Post steam usage reporting` | `1 13 * * *` | 13:01 daily | Posts the number of Steam API calls logged in `STEAM_LOG` to `STEAMHOOK`, then moves the log to `logs/`. |

Two jobs that synced the Discord member list to the database (`internalUpdateRegister`, 12:31 for the World Cup server and 12:51 for PSAF) are commented out.

## Things to know

- **Error handling:** every job except `ref stats leaderboard` is wrapped in `callCronJob`, which logs start and end and posts failures to `ERRORHOOK`. `Update team details` and `Update National Selection` also post their own errors to the bot-testing channel.
- **`postMatchesOfDay` isn't awaited**, so the job logs "End" before posting finishes, and errors after the first `await` aren't reported.
- **Lists are loaded at startup.** The active teams, national selections and leagues the jobs go through are read when the app starts and shuffled. A team or league added later isn't picked up until the next restart.
- **Rotation state is in memory.** The team and selection indexes and the list of members waiting for a Steam check reset on restart. `Steam verified check` prefers the `unregisteredPlayers` document in `MongoCache` when there is one.
- **Same-minute jobs:** `post matches summary of day` and `publish next matchday` both run at 22:01, and nothing makes one wait for the other.
- **Running a job by hand:** `getCronJob(name)` returns `[name, schedule, func]` for one job.

## Adding a job

Add a `[name, cronExpression, callCronJob(name, async () => { ... })]` entry to the array in `initCronJobs`. Anything it needs from startup (`dbClient`, `allActiveTeams`, `allNationalSelections`, `allLeagues`) comes from `initCronJobs`'s arguments.
