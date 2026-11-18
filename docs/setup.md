# Setup and deployment

This guide covers running the bot on your machine and deploying it to production.

## Requirements

- Node.js 18.17 or later. The Docker image uses `node:18-alpine`.
- Access to the MongoDB Atlas cluster, which needs a username and password. The cluster host is hard-coded in [`config/mongoConfig.js`](../config/mongoConfig.js).
- A Discord application with a bot user, invited to the PSAF server and the World Cup server with the `bot` and `applications.commands` scopes.
- To test interactions locally: a tunnel such as [ngrok](https://ngrok.com/), so Discord can reach your machine.
- `canvas`, which is a native module. On Windows and Alpine, `npm install` may need build tools if no prebuilt binary is available.

## Configuration

Copy [`.env.example`](../.env.example) to `.env` and fill it in. Each variable is described in that file. `.env` is git-ignored.

## Local mode and online mode

`app.js` picks a mode at startup.

| | Local mode | Online mode |
|---|---|---|
| Chosen when | `CERTKEY` or `CERT` is missing or points to a file that doesn't exist | Both files exist |
| Servers | HTTP on `LOCALPORT` (default 8080) | HTTP on `PORT` and HTTPS on `PORTHTTPS` |
| `/api` auth | None | Requires `x-api-key` set to `PSAF_API_KEY` or `BRYLOS_API_KEY`, or a same-origin browser request |
| `/site` and `/web` sessions and login | Off | Sessions stored in Mongo and Discord OAuth2 login |
| Cron jobs | **Not started** | Started |
| Crash report on startup | No | Yes. A leftover `ERROR_LOG` is posted to `CRASHESHOOK` |

Local mode still connects to the **production database**: there is no separate dev database, so commands you run locally change real data.

## Running locally

```bash
npm install
```

```bash
npm start
```

`npm start` runs `nodemon app.js`. Use `npm run dev` to run with the Node inspector attached.

To get Discord interactions on your machine:

1. Start a tunnel to your local port, for example `ngrok http 3000`.
2. In the Discord developer portal, set **Interactions Endpoint URL** to `https://<your-tunnel>/interactions`.

The production app uses the same endpoint setting, so this is best done with a separate test application and test servers.

### Previewing only the EJS site

```bash
npm run site
```

This serves `/site` on port 8080 in local mode, without Discord or cron jobs.

To rebuild the site's stylesheet after editing templates:

```bash
npx tailwindcss -i ./site/input.css -o ./site/output.css
```

The React admin app served at `/web` is committed as a prebuilt bundle in `web/`. Its source isn't in this repository.

## Registering slash commands

```bash
npm run register
```

This runs [`commands.js`](../commands.js), which sends the full command list to Discord:

- Global commands (`now`, `timestamp`, `help`, and every command flagged `app`).
- PSAF server commands (the `GUILD_COMMANDS` list, and every command flagged `psaf`) to `GUILD_ID`.
- World Cup commands (every command flagged `wc`) to `WC_GUILD_ID`.

[`index.js`](../index.js), the Docker entry point, imports `commands.js` before `app.js`, so **every production start re-registers all commands**.

## Other scripts

| Script | What it does |
|---|---|
| `npm run dl-config` | Reads the `LeagueConfig` collection and regenerates [`config/leagueData.js`](../config/leagueData.js). The first 24 active leagues become the `league` choices in slash commands. Re-run it, then `npm run register`, after adding or activating a league. |
| `npm run local` | Runs [`localCommands.js`](../localCommands.js), a scratch script for one-off database maintenance. Read it before running it: it writes to the production database. |

## Deploying with Docker

The [`Dockerfile`](../Dockerfile) builds a production image that runs `node index.js`. The **Docker Build and Push** GitHub Actions workflow builds it and pushes it to `ghcr.io/<owner>/pso-team-manager`, tagged `latest` and with a timestamp. It only runs when started manually from the Actions tab.

The image only bakes in `APP_ID`, `DISCORD_TOKEN`, `PUBLIC_KEY` and `PORT`, as build arguments. Pass every other variable in `.env.example` at runtime (for example `docker run --env-file .env`), and mount the TLS key and certificate at the paths set in `CERTKEY` and `CERT`.

## Logs and alerts

- On a crash, the `uncaughtException` handler writes the error to `ERROR_LOG` and exits. On the next start in online mode, that file is posted to the `CRASHESHOOK` webhook and moved to `logs/`. A start with no leftover file posts "Regular restart".
- Every Steam API request is appended to `STEAM_LOG`. A daily cron job posts the request count to `STEAMHOOK` and moves the file to `logs/`.
- Failed cron jobs are posted to `ERRORHOOK`.
- The `logs/` directory must exist before either file is moved into it.
