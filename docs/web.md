# Web front ends

The bot serves two front ends from the same Express process: an EJS site at **`/site`** and a React admin app at **`/web`**. Both read data through the same `commands/` functions as the bot. The JSON API they're built on is documented in [api.md](api.md).

## `/site`: EJS pages

Code: [`site.js`](../site.js). Templates: [`site/pages/`](../site/pages/). Styles: Tailwind, from [`site/input.css`](../site/input.css) to `site/output.css`.

| Route | Template | Shows |
|---|---|---|
| `/site/matches?date=` | `matches.ejs` | The day's matches (`date` is natural language, default `today`) |
| `/site/match?id=` | `match.ejs` | One match. Falls back to mock data if the match can't be loaded. |
| `/site/teams` | `teams.ejs` | Every team and league, with the total budget held by active and inactive teams |
| `/site/team` | `team.ejs` | Team and league data |
| `/site/test` | `test.ejs` | A test page |
| `/site/` | — | Placeholder text |

- **Static files:** everything under `site/` is served as static files at `/site/…`. That includes `output.css`, the images, and also the `.ejs` sources and the mock data files.
- **Login:** in online mode, sessions are set up (stored in Mongo, `siteSessions`), but the login check is commented out, so **every `/site` page is public**.
- **Local preview:** local mode and `npm run site` ([`sitetest.js`](../sitetest.js)) use [`site/mockMatch.js`](../site/mockMatch.js) and [`site/mockMatches.js`](../site/mockMatches.js) for the match pages. `npm run site` starts `/site` alone on port 8080.
- **Unused templates:** `editmatch`, `editlineup`, `lineup`, `lineupposition` and `editlineupposition` belong to routes that are commented out or not added yet.

Rebuild the CSS after changing classes in a template:

```bash
npx tailwindcss -i ./site/input.css -o ./site/output.css
```

The Tailwind config is [`tailwind.config.js`](../tailwind.config.js): content is `./site/**/*.{ejs,js}`, with the forms plugin. The CSS is checked into the repo, so the build has to be run by hand.

## `/web`: React admin app

Code: [`web.js`](../web.js), auth in [`functions/siteUtils.js`](../functions/siteUtils.js). Build output: [`web/`](../web/).

`web/` is a **production build of a Create React App project**. The **source isn't in this repository**, so changing the UI means rebuilding in the other project and copying the build output over `web/`. The build expects to be served from `/web` (asset URLs start with `/web/`).

### Routes

| Path | Behaviour |
|---|---|
| `/web/static/*` | JS and CSS bundles |
| `/web/api/*` | Proxy to `/api/*`. Adds `x-api-key: PSAF_API_KEY`, the `sec-fetch-*` headers, and the logged-in user's `userId` and `name`. Forwards the method and, for `PUT` and `POST`, the JSON body. |
| `/web/*`, `/web/leagues`, `/web/teams`, `/web/team/*`, `/web/league/*` | Serve `web/index.html`, and the React router takes over |

### Login (online mode)

1. A request without a session (`req.session.userId` not set) is redirected to Discord OAuth2 with the scopes `identify`, `guilds` and `guilds.members.read`. The URL it came from is saved in the session.
2. Discord redirects back to **`https://pso.shinmugen.net/web/`**. This redirect URI is hard-coded in `functions/siteUtils.js` and must also be listed in the Discord application's OAuth2 settings. The code is exchanged for a token, the user's PSAF server membership is fetched, and the session stores `userId`, `name` and `isAdmin` (President, Engineer or Admin role).
3. Admins are sent back to the page they asked for. Everyone else gets "Unauthorised".

Sessions last 24 hours, use `SESS_SC` as the secret, and are stored in the `siteSessions` collection.

> **Security note:** after the first login, requests are checked with `if (!isAdmin(req))`. `isAdmin` is an `async` function, so it returns a Promise, which is always truthy, and the check never fails. **Any PSAF server member who has logged in once gets the admin app and the `/web/api` proxy on their next request.** That includes the write routes (`PUT /team/:id`, `/editleague`, `/teamstatus`). To fix it, make `isAdmin` synchronous or `await` it in `web.js`. The OAuth `state` value is also generated but never checked.

### Local mode

In local mode `/web` has no sessions and no login, and the proxy calls `http://<host>/api/...`. Run the bot locally (`npm start`) and open `http://localhost:<LOCALPORT>/web/`.
