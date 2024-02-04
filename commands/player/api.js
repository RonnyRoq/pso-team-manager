import { DiscordRequest } from "../../utils.js"

export const getPlayers = ({dbClient, getParams}) => {
  const {rating, nat1, nat2, nat3, nationality, id, nick, ingamename} = getParams
  let query = Object.fromEntries(Object.entries({rating, nat1, nat2, nat3, id, nick, ingamename}).filter(item=> item[1]))
  if(nationality) {
    query = {...query, $or: [{nat1: nationality, nat2: nationality, nat3: nationality}]}
  }
  console.log({...query})
  return dbClient(({players})=> {
    return players.find({...query}, {limit: 100}).toArray()
  })
}

export const getPlayer = ({dbClient, getParams}) => {
  let query = {}
  if(getParams.id) {
    query.id = getParams.id
  }
  return dbClient(async ({players, playerStats, contracts})=> {
    const player = await players.findOne(query)
    if(player) {
      const [stats, allContracts, discPlayerResp] = await Promise.all([
        playerStats.find({id: player?.id, matchId: {$ne:null}}).toArray(),
        contracts.find({playerId: player.id}).toArray(),
        DiscordRequest(`/guilds/${process.env.GUILD_ID}/members/${player.id}`, { method: 'GET' }),
      ])
      const discPlayer = await discPlayerResp.json()
      return {
        ...player,
        ...discPlayer,
        stats,
        contracts:allContracts
      }
    }
    return {}
  })
}