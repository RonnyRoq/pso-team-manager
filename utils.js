import 'dotenv/config';
import fetch from 'node-fetch';
import { verifyKey } from 'discord-interactions';
import { sleep } from './functions/helpers.js';

export function VerifyDiscordRequest(clientKey) {
  return function (req, res, buf) {
    const signature = req.get('X-Signature-Ed25519');
    const timestamp = req.get('X-Signature-Timestamp');

    const isValidRequest = verifyKey(buf, signature, timestamp, clientKey);
    if (!isValidRequest) {
      res.status(401).send('Bad request signature');
      throw new Error('Bad request signature');
    }
  };
}

export async function DiscordRequest(endpoint, options={}) {
  // append endpoint to root API URL
  const url = 'https://discord.com/api/v10/' + endpoint;
  let payload = {...options}
  // Stringify payloads
  if (options.body) payload.body = JSON.stringify(options.body);
  // Use node-fetch to make requests
  const headers = {
    Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
    'Content-Type': 'application/json; charset=UTF-8',
    'User-Agent': 'PSAF Team Manager',
  }
  let res = await fetch(url, {
    headers,
    ...payload
  });
  // throw API errors
  if (!res.ok) {
    const data = await res.json();
    console.log(endpoint);
    console.log(JSON.stringify(options))
    console.log(JSON.stringify(data))
    if(data.retry_after) {
      await sleep(data.retry_after*1000)
      res = await DiscordRequest(endpoint, options)
    } else {
      throw new Error(JSON.stringify(data));
    }
  }
  // return original response
  return res;
}

export async function InstallGlobalCommands(appId, commands) {
  // API endpoint to overwrite global commands
  const endpoint = `applications/${appId}/commands`;

  try {
    // This is calling the bulk overwrite endpoint: https://discord.com/developers/docs/interactions/application-commands#bulk-overwrite-global-application-commands
    await DiscordRequest(endpoint, { method: 'PUT', body: commands });
  } catch (err) {
    console.error(err);
  }
}

export const InstallGuildCommands = async (appId, guild_id, commands) => {
  const endpoint = `applications/${appId}/guilds/${guild_id}/commands`
  
  try {
    await DiscordRequest(endpoint, { method: 'PUT', body: commands });
  } catch (err) {
    console.error(err);
  }
}

// Simple method that returns a random emoji from list
export function getRandomEmoji() {
  const emojiList = ['😭','😄','😌','🤓','😎','😤','🤖','😶‍🌫️','🌏','📸','💿','👋','🌊','✨'];
  return emojiList[Math.floor(Math.random() * emojiList.length)];
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
