import NodeCache from "node-cache";
import { DiscordRequest } from "../utils.js";
import { sleep } from "./helpers.js";

const playersCache = new NodeCache({ stdTTL: 60, checkperiod: 120, useClones: false })

export const getAllPlayers = async (guild_id) => {
  let allPlayers = playersCache.get(guild_id)
  if (allPlayers) {
    while (allPlayers.length === 0) {
      await sleep(5000)
      allPlayers = playersCache.get(guild_id)
    }
    return allPlayers
  }

  playersCache.set(guild_id, [])
  let lastId = 0
  let totalPlayers = []  // Properly initialize totalPlayers as an empty array
  let currentPlayers = []
  let i = 0
  do {
    const playersResp = await DiscordRequest(`/guilds/${guild_id}/members?limit=1000&after=${lastId}`, { method: 'GET' })
    currentPlayers = await playersResp.json()
    if (Array.isArray(currentPlayers)) {  // Ensure currentPlayers is an array before concatenating
      totalPlayers = totalPlayers.concat(currentPlayers)
      i++
      if (currentPlayers.length > 0) {
        lastId = currentPlayers[currentPlayers.length - 1].user.id
      }
    } else {
      console.error('Unexpected response format:', currentPlayers)
      break  // Exit the loop if the response is not an array
    }
  } while (currentPlayers.length === 1000 && i < 10) // Now supports up to 10,000 players
  playersCache.set(guild_id, totalPlayers)
  return totalPlayers
}