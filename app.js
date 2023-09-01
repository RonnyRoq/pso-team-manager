import 'dotenv/config';
import express from 'express';
import mysql from 'mysql';
import http from 'http';
import https from 'https';
import fs from 'fs';
import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  MessageComponentTypes,
  ButtonStyleTypes,
} from 'discord-interactions';
import * as chrono from 'chrono-node';
import { VerifyDiscordRequest, getRandomEmoji, DiscordRequest } from './utils.js';

var privateKey  = fs.readFileSync('./shinmugen.net.key', 'utf8');
var certificate = fs.readFileSync('./shinmugen.net.cer', 'utf8');
var credentials = {key: privateKey, cert: certificate};

const msToTimestamp = (ms) => {
  const msAsString = ms.toString();
  return msAsString.substring(0, msAsString.length - 3);
}

const optionToTimezoneStr = (option = 0) => {
  const today = new Date()
  switch (option) {
    case 1:
      return "CET";
    case 2:
      return "EEST";
    default:
      return "BST";
  }
}

//const connection = mysql.createConnection({
//  host: process.env.MYSQLHOST,
//  user: process.env.MYSQLUSER,
//  database: process.env.MYSQLUSER,
//  password: process.env.MYSQLPW
//})

function start() {
  // Create an express app
  const app = express();
  // Get port, or default
  const PORT = process.env.PORT || 8080;
  const PORTHTTPS = process.env.PORTHTTPS || 8443;
  // Parse request body and verifies incoming requests using discord-interactions package
  app.use(express.json({ verify: VerifyDiscordRequest(process.env.PUBLIC_KEY) }));


  app.get('/', async function (req, res) {
    return res.send('<p>no thank you</p>')
  })
  /**
   * Interactions endpoint URL where Discord will send HTTP requests
   */
  app.post('/interactions', async function (req, res) {
    console.log(req.protocol, req.originalUrl);
    console.log(req.headers)
    // Interaction type and data
    const { type, id:interaction_id, token, data, guild_id } = req.body;

    /**
     * Handle verification requests
     */
    if (type === InteractionType.PING) {
      return res.send({ type: InteractionResponseType.PONG });
    }

    /**
     * Handle slash command requests
     * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
     */
    if (type === InteractionType.APPLICATION_COMMAND) {
      const { id, name, options, target_id } = data;

      if (name === 'now') {
        const timestamp = msToTimestamp(Date.now())
        return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
          method: 'POST',
          body: {
            type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `<t:${timestamp}:F> \<t:${timestamp}:F>`,
              flags: 1 << 6
            }
          }
        })
      }

      if (name === "timestamp") {
        const [date, timezone = 0] = options
        const strTimezone = optionToTimezoneStr(timezone.value)
        const parsedDate = chrono.parseDate(date.value, { instance: new Date(), timezone: strTimezone })
        const timestamp = msToTimestamp(Date.now())
        const doubleParse = msToTimestamp(Date.parse(parsedDate))
        return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
          method: 'POST',
          body: {
            type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `<t:${doubleParse}:F> \<t:${doubleParse}:F>`,
              flags: 1 << 6
            }
          }
       })
      }

      if (name === "roles") {
        const rolesResp = await DiscordRequest(`/guilds/${guild_id}/roles`, { method: 'GET' })
        const roles = await rolesResp.json()
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Roles: ${roles.map(({ name }) => name).toString()}`
          }
        })
      }

      if (name === "players") {
        const [role] = options
        const [playersResp, playersResp2] = await Promise.all([
          DiscordRequest(`/guilds/${guild_id}/members?limit=1000`, { method: 'GET' }),
          DiscordRequest(`/guilds/${guild_id}/members?limit=1000&after=1000`, { method: 'GET' })
        ])
        const [players1, players2] = await Promise.all([playersResp.json(), playersResp2.json()])
        const players = players1//.concat(players2)
        const rolePlayers = players.filter((player) => player.roles.includes(role.value))
        const teamPlayers = [...new Set(rolePlayers)]
        return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
          method: 'POST',
          body: {
            type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `Players: \r${teamPlayers.map(({ user, nick }) => `<@${user.id}>`).join('\r')}`,
              flags: 1 << 6
            }
          }
        })
      }
    }
    
    return res.send("<p>Payload incorrect</p>");
  });


  var httpServer = http.createServer(app);
  var httpsServer = https.createServer(credentials, app);
  httpServer.listen(PORT, ()=> {
    console.log('Listening http on port', PORT);
  });
  httpsServer.listen(PORTHTTPS, (()=>{
    console.log('Listening https on port', PORTHTTPS);
  }));
  /*process.on('exit', () => {
    connection.end()
  });*/
}

start()