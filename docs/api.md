# REST API

[`api.js`](../api.js) serves a JSON API at **`/api`**. The React admin app (through the `/web/api` proxy) and partner sites use it. Route handlers call the same functions as the slash commands, so responses are mostly raw MongoDB documents (see [data-model.md](data-model.md)).

## Authentication

| Mode | Rule |
|---|---|
| Local mode | No checks |
| Online mode | An `x-api-key` header equal to `PSAF_API_KEY` or `BRYLOS_API_KEY` is required. A missing or wrong key gets `403 {"error":{"code":403,"message":"Nope."}}`. |

The `/web` admin app doesn't hold a key itself: its `/web/api` proxy adds `PSAF_API_KEY` for logged-in admins (see [web.md](web.md)).

Before Mongo is connected at startup, every request gets an empty `500`.

Anyone with either key can use every route, including the write routes. `PUT /team/:id` reads an optional `userid` header, but only to name the user in the activity log.

## Conventions

- Parameters are query-string values, so they arrive as strings. Some handlers convert them and some don't.
- Missing required parameters return `400 {"error":{"code":400,"message":"…"}}`. Other errors aren't caught: the request fails and the error goes to the process logs.
- Team IDs are Discord role IDs, player IDs are Discord user IDs, and leagues are `LeagueConfig.value`.

## Teams

| Method and path | Parameters | Returns |
|---|---|---|
| `GET /teams` | — | Active `Teams` documents |
| `GET /allteams` | — | `{teams, leagues}`: every team (active first, then by name) with a `leagues` array of league IDs, and every `LeagueConfig` |
| `GET /team` | `id` | One active team, or `null` |
| `GET /teamplayers` | `id` | The team, its members on Discord merged with their `Players` documents and contracts, its leagues, and the active leagues |
| `PUT /team/:id` | JSON body: fields to set on the team. Header `userid` (optional, for the log). | The team **before** the update. Also renames the team's Discord role and channel when `name` changes, and members' nickname prefixes when `shortName` changes. Logs to the bot activity channel. **Every field in the body is written as-is.** |
| `PUT /teamstatus` | JSON body `{team, active}` | A message string. Sets `active`, which opens or closes transfers for the team. |

## Players and transfers

| Method and path | Parameters | Returns |
|---|---|---|
| `GET /players` | Any of `id`, `nick`, `ingamename`, `rating`, `nat1`, `nat2`, `nat3`, `nationality` | Up to 100 players with their current team and contract |
| `GET /player` | `name` (matches Discord username or nickname) | Up to 9 matching players with their stats and contracts |
| `GET /playerstats` | `ids` (comma-separated, up to 49) | Those players with their match stats and contracts. `{}` if `ids` is missing. |
| `GET /transfers` | `before` / `after` (ms timestamps on `at`), `under` / `over` (on `transferAmount`), `playerId`, `teamFrom`, `teamTo`, `length`, `until`, `isLoan`, `_id`, `size` or `limit`, `page` or `skip` | `TransferHistory` entries, newest first |
| `GET /lft` | `positions` (comma-separated), `minHours` | Looking-for-team entries |
| `GET /transferlist` | `positions` (comma-separated), `maxBuyout` | Transfer-list entries |

Known problems with these routes:

- **`/players`:** `nationality` only matches players whose `nat1`, `nat2` and `nat3` are *all* that country, because the `$or` has one clause containing all three fields.
- **`/transfers`:** `limit = Math.max(limit, 100)` means you always get at least 100 entries. The filters `playerId`, `length` and so on are compared as strings.
- **`/lft` and `/transferlist`:** the route reads `position` from the query, but the handler expects `positions`, so position filtering never applies.

## Matches

| Method and path | Parameters | Returns |
|---|---|---|
| `GET /matches` | `leagueId`, `matchday`, `date` (natural language, parsed with chrono, e.g. `today`), `season` (defaults to current), `finished` | Up to 100 matches, latest first |
| `GET /match` | `id` (required, a match `_id`) | The match with `playerStats` and `lineups` |
| `GET /matchday` | `league` and `matchday` (required), `season` | The matchday's matches, as shown by the matchday command |
| `GET /refsleaderboard` | — | Results entered per referee this season |
| `GET /timestamp` | `date`, `timezone` (hour offset, default 0) | `{response}`: the parsed date |

## Leagues

| Method and path | Parameters | Returns |
|---|---|---|
| `GET /leagues` | — | Every `LeagueConfig` document |
| `GET /leaguechoices` | — | Every league as `{_id, name, value}` |
| `GET /leagueconfig` | `league` (required) | `{league, leagueTeams}`: the config and the teams in it |
| `GET /league` / `GET /leaguetable` | `league` (required) | The calculated table. The two routes are the same. |
| `PUT /editleague` | JSON body `{league, name?, logo?, emoji?, channel?, order?, active?}` | The updated `LeagueConfig`. Fields you leave out keep their current value. Refreshes the leagues cache. |
| `PUT /activateleague` | JSON body `{league, active}` | Same as `/editleague`, but only changes `active` |

## National teams and reference data

| Method and path | Parameters | Returns |
|---|---|---|
| `GET /nationalselections` | — | All `NationalTeams` (cached) |
| `GET /nationalselection` | `shortname` or `name` | `{nationalTeam, eligibleNationalities, nationalPlayers}` for the current season |
| `GET /nationalities` | — | All `Nationalities` (cached) |

## Search

| Method and path | Parameters | Returns |
|---|---|---|
| `GET /search` | `s` | Matching players, teams and selections. Results are cached per search string. |
| `GET /buildsearch` | — | Rebuilds the search collections right away (the cron job does this every 6 hours) |

## Other

`GET /` returns a placeholder HTML page.

## Calling the API

```bash
curl -H "x-api-key: $PSAF_API_KEY" "https://<host>/api/matches?leagueId=<league>&date=today"
```

Logged-in admins on `/web` call `/web/api/<route>`. The proxy adds the API key and the user's ID (see [web.md](web.md)).
