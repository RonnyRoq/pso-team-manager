# Buttons, modals and autocomplete

Slash commands are listed in [commands.md](commands.md). This page covers the other interaction types the bot receives on `/interactions`. They're all routed in [`app.js`](../app.js) (see [architecture.md](architecture.md#handling-discord-interactions) for the overall flow).

Each handler gets `{custom_id, callerId, member, message, components, interaction_id, application_id, channel_id, token, guild_id, dbClient}`. `message` is only set for buttons and `components` only for modals. A handler that needs data from the ID reads it with `custom_id.split('_')`.

## Buttons and select menus

Buttons are only handled on the **PSAF server** (`GUILD_ID`), except `vote_`, which also works on the World Cup server. A button from any other server gets no handler and fails.

### Exact IDs

These are matched first, through `componentRegister` in `app.js`.

| `custom_id` | Posted by | Handler | What it does |
|---|---|---|---|
| `confirm_transfer` | `/confirm`, on the admin copy ([`commands/confirm.js`](../commands/confirm.js)) | `transferAction` ([`commands/transfers.js`](../commands/transfers.js)) | Completes the transfer: creates the contract, moves budgets, logs it, updates the player on Discord |
| `cancel_transfer` | `/confirm` | `removeConfirmation` ([`commands/confirmations/actions.js`](../commands/confirmations/actions.js)) | Deletes the pending confirmation and its posts |
| `confirm_release` | `/releaseplayer` | `releaseAction` (`commands/transfers.js`) | Ends the contract and makes the player a free agent |
| `cancel_release` | `/releaseplayer` | `removeRelease` (`commands/confirmations/actions.js`) | Deletes the pending release |
| `cancel_deal` | `/deal` ([`commands/confirmations/deal.js`](../commands/confirmations/deal.js)) | `removeDeal` | Deletes the pending deal |
| `cancel_loan` | Loan requests (`commands/confirmations/actions.js`) | `removeLoan` | Deletes the pending loan |
| `confirm_picture` | Player picture upload ([`commands/player/playerPicture.js`](../commands/player/playerPicture.js)) | `confirmPicture` | Approves the picture and sends it to the PSAF database |
| `cancel_picture` | Player picture upload | `cancelPicture` | Rejects the picture |

### ID prefixes

These are checked in this order after the exact IDs. The part after the prefix carries the data.

| Prefix and format | Posted by | Handler | What it does |
|---|---|---|---|
| `approve_deal_<dealId>` | Deal listings ([`commands/confirmations/listDeals.js`](../commands/confirmations/listDeals.js)) | `approveDealAction` | A manager of the selling club approves a `PendingDeals` document |
| `decline_deal_<dealId>` | Deal listings | `declineDealAction` | A manager declines it |
| `approve_loan_<loanId>` | Deal listings | `approveLoanAction` | Approves a `PendingLoans` document |
| `decline_loan_<loanId>` | Deal listings | `declineLoanAction` | Declines it |
| `confirm_delete_<teamId>_keepblacklist` | `/disbandteam` ([`commands/disbandTeam.js`](../commands/disbandTeam.js)) | `disbandTeamConfirmed` | Disbands the team: deactivates it, ends its contracts, deletes its posts. President role only. |
| `referee_<matchId>` | Daily schedule post ([`commands/match.js`](../commands/match.js)) | `refereeMatch` ([`commands/matches/actions.js`](../commands/matches/actions.js)) | Signs the caller up (or off) as referee |
| `streamer_<matchId>` | Daily schedule post | `streamerMatch` | Signs the caller up (or off) as streamer |
| `loan_<playerId>_<season>_<phase>` | `/loan`, one button per possible end date (`commands/confirmations/deal.js`) | `finishLoanRequest` | Sets the loan's end season and phase, then posts the request |
| `vote_<playerId>` | Coach candidate posts ([`commands/nationalTeam.js`](../commands/nationalTeam.js)) | `voteAction` ([`commands/nationalTeams/actions.js`](../commands/nationalTeams/actions.js)) | Records the caller's coach vote in `Votes` |
| `match_result_<matchId>` | Schedule and match posts, the missed-matches reminder | `matchResultPrompt` | Opens the result modal |
| `match_stats_<matchId>` | Same places | `matchStatsPrompt` | Opens the stats import modal |
| `movematch_<matchId>` | `/movematch` ([`commands/matches/moveMatch.js`](../commands/matches/moveMatch.js)) | `moveMatchPrompt` | Opens the new-date modal |
| `approve_matchmove_<moveRequestId>` | Move request post | `approveMoveMatch` | The other team accepts the new date |
| `decline_matchmove_<moveRequestId>` | Move request post | `declineMoveMatch` | The other team rejects it |
| `lineup_<lineupId>_<matchId>` | Lineup commands, one button for each of the next 4 matches ([`commands/lineup/lineup.js`](../commands/lineup/lineup.js)) | `selectMatchLineup` ([`commands/lineup/actions.js`](../commands/lineup/actions.js)) | Attaches the saved lineup to that match |
| `confirm_migrate_<oldPlayerId>_<newPlayerId>` | Account migration ([`commands/player.js`](../commands/player.js)) | `actionConfirmMigrate` | Moves contracts and roles to the new account |

Prefixes are checked with `startsWith` in the order above. A new prefix must not start with an existing one. For example, `loan_` is checked after `approve_loan_` and `decline_loan_`, so those still work, but a new `loan_something_` button would be sent to `finishLoanRequest`.

An unknown button on the PSAF server gets an ephemeral "Failed to process the command."

## Modals

| `custom_id` | Opened by | Handler | Fields (`custom_id` of each text input) |
|---|---|---|---|
| `match_result_<matchId>` | `match_result_` button | `endMatchModalResponse` (`commands/matches/actions.js`) | `home_score`, `away_score`, `ff` (type `ff` for a forfeit) |
| `match_stats_<matchId>` | `match_stats_` button | `matchStatsModalResponse` | `all_stats`, `extra_stats` (pasted from the game's export) |
| `move_the_match_<matchId>` | `movematch_` button | `moveMatchModalResponse` (`commands/matches/moveMatch.js`) | `match_time`, `timezone` |

Modals aren't restricted by server. The result modal is matched with `startsWith('match_result')`, without a trailing underscore.

`create_matchday` and `select_matchday` in [`commands/matches/matchday.js`](../commands/matches/matchday.js) are in commented-out code and aren't routed.

## Autocomplete

Autocomplete requests find the option being typed in (up to two levels of subcommands deep) and pick a source:

| Condition | Source |
|---|---|
| Command `editplayer` or `nationalteam` | Nationalities (`autoCompleteNation`, [`commands/player.js`](../commands/player.js)) |
| Command `selectionmatch` | National selections (`autoCompleteSelections`, [`commands/nationalTeam.js`](../commands/nationalTeam.js)) |
| Option `selection` | Active national selections. The admin-only "show inactive too" check is commented out. |
| Option `nationality` or `eligiblenationality` | Nationalities |
| Option `league` | Active leagues ([`functions/autoComplete.js`](../functions/autoComplete.js)) |
| Option `league-all` | All leagues that aren't archived |
| Option `league-inactive` | Inactive leagues |
| Anything else | Nationalities |

So an option named `league` gets league suggestions in every command, as long as the option sets `autocomplete: true`.

## Adding a button or modal

1. Choose a prefix that doesn't start with an existing one. Put IDs after it, separated by `_`, and keep the whole `custom_id` under Discord's 100-character limit.
2. Add the `startsWith` check to the right branch in `app.js`: message components or modal submit, and the right server.
3. Check permissions in the handler. Anyone who can see the message can press its buttons.
4. Add the button or modal to this page.
