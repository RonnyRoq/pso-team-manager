# Data model

All data is in one MongoDB Atlas database, **`PSOTeamManager`**. Code reaches collections through `dbClient(({ teams, players, ... }) => ...)` (see [architecture.md](architecture.md#data-access)). The key in that object usually isn't the same as the Mongo collection name, so both are listed below.

There's no schema or validation layer. The fields below come from what the code reads and writes. Documents may have more fields, and older documents may be missing some.

## Conventions

- **Discord IDs are strings.** A player's `id` / `playerId` is their Discord user ID. A team's `id` is its **Discord role ID**, so teams are mentioned as `<@&teamId>`. Leagues are keyed by `value`, which is usually the league channel's ID, sometimes with a suffix such as `-a` or `-p`.
- **Time is stored three different ways.** Check which one a field uses before comparing it:
  - Milliseconds from `Date.now()`: `at`, `endedAt`, `expiresOn`, `startedAt`, `phaseStartedAt`, `createdDate`.
  - Unix **seconds**, as Discord's `<t:…>` format uses, often stored as **strings**: `matches.dateTimestamp`, `matchDays.startDateTimestamp` / `endDateTimestamp`. Convert with `msToTimestamp` / `timestampToMs` in `functions/helpers.js`.
  - BSON `Date`: `lft.listedAt`.
- **Seasons are integers.** `season`, `until`, and the current season from `getFastCurrentSeason()`.
- **"Active" means not ended.** Contracts and seasons are current when `endedAt` is `null`. Teams, leagues and selections have an `active` flag.

## Collections

### Core: teams, players and contracts

| Key → Collection | What it holds | Main fields |
|---|---|---|
| `teams` → `Teams` | Clubs (and PG teams). One document per Discord team role. | `id` (role ID), `name`, `shortName`, `displayName`, `emoji`, `flag`, `city`, `description` (honours), `logo`, `budget` (EBits), `active`, `isPG`, `disqualified`, `channel`, `teamMsg` / `logoMsg` (the team's post in the clubs channel), `refreshedLogo` |
| `players` → `Players` | Registered players | `id` (user ID), `nick`, `name`, `nat1`–`nat3`, `steam` (profile URL), `steamId`, `steamVerified`, `steamValidation`, `hoursWhenChecked`, `ingamename`, `loccountrycode`, `uniqueId` (PSO ID), `rating`, `profilePicture`, `iscaptain`, `isAlt`, `knownAlts`, `pastSteams` |
| `contracts` → `Contracts` | A player's club contract. A player should have at most one open contract, plus one more while on loan. | `id`, `at`, `playerId`, `team`, `until` (last season), `endedAt`, `desc`, `iscaptain`. Loans also have `isLoan: true`, `phase`, `until` and `originalTeam`. |
| `transferHistory` → `TransferHistory` | Append-only transfer log | `playerId`, `at`, `teamFrom` (or `'Free Agent'`), `teamTo`, `transferAmount`, `length`, `until`, `desc`, `isLoan` |
| `playerMigrations` → `PlayerMigrations` | Moves from an old Discord account to a new one | `callerId`, `oldPlayerId`, `newPlayerId`, `at` |
| `pendingPictures` → `PendingPictures` | Player picture uploads waiting for staff approval | `playerId`, `pictureUrl`, `postedAt`, `confirmationId` |
| `blacklists` → `Blacklists` | Unused. The blacklist command that would write here is an empty stub. The blacklist display uses the Discord match-blacklist role and `Players.desc` instead. | — |

### Transfer requests

Every request type has `expiresOn` (two weeks after creation) and the IDs of the public post (`messageId`) and the admin post (`adminMessage`), so the buttons can find them again.

| Key → Collection | Request | Extra fields |
|---|---|---|
| `confirmations` → `Confirmations` | A player's `/confirm` to join a team, waiting for staff approval | `playerId`, `playerName`, `team`, `teamName`, `seasons`, `validated` |
| `pendingDeals` → `PendingDeals` | Transfer between two clubs | `playerId`, `teamFrom`, `destTeam`, `amount`, `approved` |
| `pendingLoans` → `PendingLoans` | Loan between two clubs | `playerId`, `teamFrom`, `destTeam`, `amount`, `until`, `phase`, `approved` |
| `pendingReleases` → `PendingReleases` | A club releasing a player | `playerId`, `playerName`, `team`, `teamName` |
| `transferList` → `TransferList` | Players a club has listed for transfer | Read by `/api/transferlist`. Not written by this repo. |
| `lft` → `Lft` | Players looking for a team | `playerId`, `hours`, `positions`, `extra_info`, `listedAt` |

### Leagues and seasons

| Key → Collection | What it holds | Main fields |
|---|---|---|
| `seasonsCollect` → `Seasons` | One document per season. The current one has `endedAt: null`. | `season`, `phase` (`first` or `second`), `startedAt`, `phaseStartedAt`, `endedAt` |
| `leagueConfig` → `LeagueConfig` | League definitions | `value` (key), `name`, `emoji`, `channel`, `standingsChannel`, `standingsMsg`, `defaultImage`, `pingRole`, `order`, `sorting`, `active`, `archived`, `isInternational`, `knockout`, `continental`, `currentMatchDay`, `players` |
| `leagues` → `Leagues` | Which team is in which league | `leagueId`, `team` (team ID, or selection `shortname` for international leagues), `group`, `position`, `penaltypoints` |
| `matchDays` → `MatchDays` | A league's matchday window | `league`, `matchday`, `season`, `startDateTimestamp`, `endDateTimestamp`, `image`, `posted`, `imageMessageId`, `endMessageId` |
| `matchDayConfig` → `MatchDayConfig` | Per-league, per-matchday settings, read when publishing a matchday | `league`, `matchDay` |

[`config/leagueData.js`](../config/leagueData.js) is a snapshot of `LeagueConfig`, generated by `npm run dl-config`. It's used for slash-command choices. At runtime the code uses the leagues cache instead.

### Matches

| Key → Collection | What it holds | Main fields |
|---|---|---|
| `matches` → `Matches` | One fixture | `home`, `away` (team IDs or selection shortnames), `isInternational`, `league`, `matchday`, `group`, `order`, `season`, `dateTimestamp`, `createdDate`, `homeScore`, `awayScore`, `isFF`, `finished`, `finishedBy`, `dateOfMatch`, `password` (lobby password, set 10 minutes before kick-off), `refs` / `streamers` (comma-separated user IDs), `thread`, `logId` |
| `lineups` → `Lineups` | A team's lineup for a match | `id` (lineup code), `postedBy`, `matchId` (the match `_id` as a string), `team`, `message`, plus the positions |
| `playerStats` → `PlayerStats` | Per-player stats imported from the game's exported stats | `id` (user ID), `matchId`, `team`, `homeAway`, `savedBy`, plus the stat columns |
| `moveRequest` → `MoveRequest` | Requests to reschedule a match | `id` (match), `requester`, `requesterTeam`, `destinationTeam`, `dateTimestamp`, `expiryTime`, `message` |

### National teams

| Key → Collection | What it holds | Main fields |
|---|---|---|
| `nationalTeams` → `NationalTeams` | National selections | `shortname` (key), `name`, `region`, `eligibleNationalities`, `logo`, `active`, `psafMsg` / `psafLogo` (the selection's post) |
| `nationalities` → `Nationalities` | Countries a player can choose | `name`, `flag` |
| `nationalContracts` → `NationalContracts` | A player picked for a selection in a season | `playerId`, `selection`, `season` |
| `candidates` → `Candidates` | Applications to coach a selection | `playerId`, `selection`, `reason` |
| `votes` → `Votes` | One coach vote per player | `playerId`, `nation`, `coachVote`, `votingTime` |
| `squads` → `Squads` | Squads (work in progress, commands not registered yet) | `shortname`, `name`, `region`, `country`, `logo`, `active` |
| `squadContracts` → `SquadContracts` | Squad membership | `playerId`, `squad`, `season` |

### System

| Key → Collection | What it holds |
|---|---|
| `config` → `Config` | Settings stored as `{name, ...}` documents. For example, `{name: 'transferMarket', active}` opens or closes the transfer market. |
| `mongoCache` → `MongoCache` | Lasting job state, for example `{name: 'unregisteredPlayers', ids}` for the Steam verification queue. |
| `searchPlayers`, `searchTeams`, `searchNationalSelections` | Lowercased search projections, rebuilt every 6 hours with `$out` by `buildPlayerSearch`. Don't edit them directly. |
| `siteSessions` | Express sessions for `/site` and `/web` (connect-mongodb-session). Not in `dbClient`. |

## Lifecycles

### Joining a club

1. A player runs `/confirm` with a team and a number of seasons. This creates a document in `Confirmations` and posts the request, plus an admin copy with buttons.
2. When staff press `confirm_transfer` on the admin message, `transferAction` ([`commands/transfers.js`](../commands/transfers.js)) finds the confirmation by `adminMessage`. If an approved `PendingDeals` or `PendingLoans` document exists for that player and team, it's used for the fee and loan terms. Then `transferAction` does the following:
   - Inserts a `Contracts` document with `until` set to the current season plus the requested number of seasons.
   - Adjusts both teams' `budget`.
   - Appends to `TransferHistory`.
   - Updates the player's name and roles on Discord.

### Deals and loans between clubs

1. A deal or loan creates a document in `PendingDeals` or `PendingLoans`, and posts to the deals channel and the admin channel.
2. Admin approval (`approve_deal_*` / `approve_loan_*` buttons) sets `approved: true` and notifies the clubs.
3. The player then runs `/confirm` for the new team, and the transfer completes through the same flow as joining a club.

A loan gets `isLoan: true`, a `phase` and an `until` season. The loan stays open next to the player's original contract.

### Releases

1. A release creates a document in `PendingReleases`.
2. Confirming it closes the contract (`endedAt`) and adds a `TransferHistory` entry with `teamTo: 'Free Agent'`.

The `expirethings` command deletes `Confirmations`, `PendingDeals` and `PendingLoans` past their `expiresOn`, and `MoveRequest` documents past their `expiryTime`. It doesn't touch `PendingReleases`, so expired release requests stay until someone deletes them.

### Season phases

[`commands/season.js`](../commands/season.js) defines two phases, `first` ("Day 1") and `second` ("Day 5"). `progresscurrentseasonphase` advances them:

1. **`first` → `second`:** sets `phase` and `phaseStartedAt` on the current `Seasons` document.
2. **`second` → the next season's `first`:**
   - Sets `endedAt` on the current season and inserts a new season document.
   - Extends managers' contracts that expire this season by one season.
   - Closes every other non-loan contract with `until` less than or equal to the new season number.
3. **Either transition:** ends loans whose `phase` and `until` match the new position, and puts the player back on their original contract. The change is logged to `WEBHOOK`.

`progressCurrentSeasonPhase` builds lists of expired and extended contracts with `Array.concat` but never keeps the result. The contracts are still updated, but the summary lists come back empty.

### Matches

1. Matches are created per league and matchday, either one at a time or generated from `Leagues` groups. They're grouped into `MatchDays`, and the daily publish job posts each matchday once (`posted`).
2. Ten minutes before kick-off, the notify job sets `password` and sends out the lobby details.
3. A referee enters the result (`internalEndMatch`): `homeScore`, `awayScore`, `isFF`, `finished: true` and `finishedBy`. They can also import stats into `PlayerStats`.
4. In knockout leagues, the winner moves into the next match.

League tables are calculated from finished `Matches`, minus `Leagues.penaltypoints`.

### Account migration

Moving a player to a new Discord account copies their open `Contracts` and `NationalContracts` to the new ID and marks the old player document `isAlt` with `knownAlts`. It also logs to `PlayerMigrations`, and gives the old account the disabled role.

## Adding a collection

1. Add it to the `collections` object in [`functions/mongoClient.js`](../functions/mongoClient.js).
2. Add a section to this document.
