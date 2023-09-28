import NodeCache from "node-cache";
import { DiscordRequest } from "../utils.js";

const playersCache = new NodeCache({ stdTTL: 60, checkperiod: 120, useClones: false})

export const getAllPlayers = async (guild_id) => {
  const allPlayers = playersCache.get(guild_id)
  if(allPlayers)
    return allPlayers

  let lastId = 0
  let totalPlayers = []
  let currentPlayers = []
  let i=0
  do{
    const playersResp = await DiscordRequest(`/guilds/${guild_id}/members?limit=1000&after=${lastId}`, { method: 'GET' })
    currentPlayers= await playersResp.json()
    totalPlayers = totalPlayers.concat(currentPlayers)
    i++
    lastId = currentPlayers[currentPlayers.length-1].user.id
  } while (currentPlayers.length === 1000 && i<5) // wont support more than 5000 players.
  playersCache.set(guild_id, totalPlayers)
  return totalPlayers
}