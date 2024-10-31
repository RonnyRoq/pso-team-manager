import 'dotenv/config';
import { readFile } from "node:fs/promises"
import { lookup } from "mime-types"
import fetch from 'node-fetch';
import { verifyKey } from 'discord-interactions';

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

export const SteamRequestTypes = {
  VanityUrl: 'http://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/',
  GetPlayerSummaries: 'http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/',
  GetGameSummary: 'http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/'
}

export const SteamIds = {
  psoGameId: 1583320
}

export const SteamRequest = (request, params) => {
  const searchParams = new URLSearchParams(params)
  searchParams.append('key', process.env.STEAM_API_KEY)
  const urlReq = new URL(`${request}?${searchParams.toString()}`)
  console.log(urlReq.href)
  return fetch(urlReq)
}

/*function toArrayBuffer(buffer, contentType='', sliceSize=512) {
  const b64 = buffer.toString('base64')
  const byteArrays = [];
  for (let offset = 0; offset < b64.length; offset += sliceSize) {
    const slice = b64.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  const blob = new Blob(byteArrays, {type: contentType});
  return blob;
}*/

export const DiscordUploadRequest = async (endpoint, options={}, files) => {
  // append endpoint to root API URL
  const url = 'https://discord.com/api/v10' + endpoint;
  console.log(options)
  let payload = {...options}
  const {method} = options
  // Stringify payloads
  if (options.body) payload.body = JSON.stringify(options.body);
  // Use node-fetch to make requests
  const headers = {
    Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
    'Content-Type': 'multipart/form-data',
    //'Content-Type': 'application/json; charset=UTF-8',
    'User-Agent': 'PSAF Team Manager',
  }
  const form = new FormData();
  form.append('payload_json', payload.body)
  let index = 0
  for await (const file of files) {
    const {name, path} = file
    const fileBlob = new Blob([await readFile(path)], { type: lookup(path) });
    form.append(`files[${index}]`, fileBlob, name)
    index++
  }
  
  const payloadToSend= {
    headers: {...headers},
    method,
    body: form,
    redirect: 'follow'
  }
  let res
  try{
    res = await fetch(url, payloadToSend)
    // throw API errors
    if (!res.ok) {
      const data = await res.json();
      console.log(endpoint);
      //console.log(JSON.stringify(options))
      console.log(JSON.stringify(data))
      if(data.retry_after) {
        await sleep(data.retry_after*1000)
        res = await DiscordUploadRequest(endpoint, options, files)
      } else {
        console.log('Failed upload')
        console.log(JSON.stringify(res));
        throw new Error(JSON.stringify(data));
      }
    }
  } catch (e) {
    console.log(e)
  }
  console.log('uploaded')
  // return original response
  return res;
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
  let res
  try{
    res = await fetch(url, {
      headers,
      ...payload
    });
    // throw API errors
    if (!res.ok) {
      console.log(res.url)
      console.log(res.status, res.statusText)
      const data = await res.json();
      console.log(endpoint);
      console.log(JSON.stringify(options))
      console.log(JSON.stringify(data))
      if(data.retry_after) {
        await sleep(data.retry_after*1000)
        res = await DiscordRequest(endpoint, options)
      } else {
        const e = JSON.stringify({endpoint, options, data}, null, 2)
        await logSystemError(e)
        throw new Error(e);
      }
    }
  } catch(e) {
    console.error(e)
    
    await logSystemError(e)
    throw new Error(e)
  }
  // return original response
  return res;
}

export async function logSystemError(content) {
  console.log("logSystemError")
  const url = 'https://discord.com/api/v10/'
  const headers = {
    Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
    'Content-Type': 'application/json; charset=UTF-8',
    'User-Agent': 'PSAF Team Manager',
  }
  return fetch(url+"webhooks/1287703911637192705/lOCdbCD4H9qXLubpWfkSh9PFErUVbvf3S1rHknJXRrTtyhZ5vNxePm-XFeX353VWeBQJ", {
    headers,
    method: 'POST',
    body: JSON.stringify({content})
  }, true)
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

export function isValidHttpUrl(string) {
  let url;
  
  try {
    url = new URL(string);
  } catch (_) {
    return false;  
  }

  return url.protocol === "http:" || url.protocol === "https:";
}

export const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
