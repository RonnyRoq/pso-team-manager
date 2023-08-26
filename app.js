import 'dotenv/config';
import express from 'express';
import mysql from 'mysql';
import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  MessageComponentTypes,
  ButtonStyleTypes,
} from 'discord-interactions';
import * as chrono from 'chrono-node';
import { VerifyDiscordRequest, getRandomEmoji, DiscordRequest } from './utils.js';

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

const connection = mysql.createConnection({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  database: process.env.MYSQLUSER,
  password: process.env.MYSQLPW
})

function start() {
  // Create an express app
  const app = express();
  // Get port, or default to 3000
  const PORT = process.env.PORT || 3000;
  // Parse request body and verifies incoming requests using discord-interactions package
  app.use(express.json({ verify: VerifyDiscordRequest(process.env.PUBLIC_KEY) }));

  // Store for in-progress games. In production, you'd want to use a DB
  const activeGames = {};

  /**
   * Interactions endpoint URL where Discord will send HTTP requests
   */
  app.post('/interactions', async function (req, res) {
    // Interaction type and data
    const { type, id:message_id, channel_id, data, guild_id } = req.body;

    console.log(req.body)
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
        res.send({
          type: InteractionResponseType.PONG,

        })
        return DiscordRequest(`/channels/${channel_id}/messages`, {
          method: 'POST',
          body: {
            content: `<t:${timestamp}:F>`,
            flags: 1 << 6,
            message_reference: {
              channel_id,
              guild_id,
              message_id
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
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `<t:${doubleParse}:F>`
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
        const playersResp = await DiscordRequest(`/guilds/${guild_id}/members?limit=1000`, { method: 'GET' })
        const players = await playersResp.json()
        const rolePlayers = players.filter((player) => player.roles.includes(role.value))
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Players: \r${rolePlayers.map(({ user, nick }) => `<@${user.id}>`).join('\r')}`
          }
        })
      }
    }
  });

  app.listen(PORT, () => {
    //connection.connect();
    console.log('Listening on port', PORT);
  });
  /*process.on('exit', () => {
    connection.end()
  });*/
}

start()