# PSO Team Manager

A Discord bot and web backend for running Pro Soccer Online (PSO) leagues, mainly the PSAF server and its World Cup server. It keeps team, player, contract and match data in MongoDB, and staff and managers work with it through slash commands, buttons and a small admin website.

## What it does

- **Teams and players:** registration, Steam ID checks and alt detection, ratings, player pictures, team posts that update on their own, and disbanding teams.
- **Transfers and contracts:** deals, loans and releases with approval buttons, a transfer list and a looking-for-team (LFT) list, transfer bans, blacklists, fines and bonuses, and contract expiry.
- **Leagues and seasons:** league setup and groups, league tables, matchdays and season phase progression.
- **Matches:** daily schedules, lineups, referee and streamer sign-ups, result and stats entry, requests to move a match, and reminders.
- **National teams:** national selections and voting, including on the World Cup server.
- **Search and API:** player, team and selection search, and a REST API used by the admin site and partner websites.

## How it fits together

One Node.js process ([`app.js`](app.js)) runs an Express server with:

| Path | Purpose |
|---|---|
| `/interactions` | Discord interactions endpoint for slash commands, autocomplete, buttons and modals |
| `/api` | JSON REST API ([`api.js`](api.js)) |
| `/site` | Server-rendered EJS pages ([`site.js`](site.js), `site/pages/`) |
| `/web` | Prebuilt React admin app with Discord login ([`web.js`](web.js), `web/`) |

The same process also runs scheduled jobs ([`cronjobs.js`](cronjobs.js)): posting the day's matches, refreshing team posts, notifying match starts, updating league tables, Steam checks, and more.

```
app.js              entry point: Express server, interaction routing, startup
index.js            production entry: registers commands, then starts app.js
commands.js         registers slash commands with Discord (npm run register)
commandsRegister.js list of command modules that declare their own handler
commands/           one module per feature (league, matches, player, transfers, ...)
functions/          shared helpers, MongoDB access, in-memory caches
config/             server channel and role IDs, countries, league choices
site/, web/         the two websites
```

## Quick start

1. Install Node.js 18.17 or later, then install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the Discord, MongoDB and API values.

3. Register the slash commands with Discord:

   ```bash
   npm run register
   ```

4. Start the bot:

   ```bash
   npm start
   ```

Without TLS certificates the app runs in **local mode**: no cron jobs and no API auth, but it still uses the production database. See [docs/setup.md](docs/setup.md) for local mode, tunnelling Discord to your machine, the other npm scripts, Docker deployment and logging.

## License

[MIT](LICENSE)
