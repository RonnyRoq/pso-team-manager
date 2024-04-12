import { getAllPlayers } from "../../functions/playersCache.js"
import { getPlayerNick } from "../../functions/helpers.js"

export const getPlayers = async ({dbClient, getParams}) => {
  const {rating, nat1, nat2, nat3, nationality, id, nick, ingamename} = getParams
  let query = Object.fromEntries(Object.entries({rating, nat1, nat2, nat3, id, nick, ingamename}).filter(item=> item[1]))
  if(nationality) {
    query = {...query, $or: [{nat1: nationality, nat2: nationality, nat3: nationality}]}
  }
  const discPlayers = await getAllPlayers(process.env.GUILD_ID)
  console.log({...query})
  return dbClient(async({players, teams, contracts})=> {
    const [dbPlayers, allActiveTeams] = await Promise.all([
      players.find({...query}, {limit: 100}).toArray(),
      teams.find({active:true}).toArray()
    ])
    const playerContracts = await contracts.find({endedAt: null, playerId: {$in: dbPlayers.map(dbPlayer=>dbPlayer.id)}}).toArray()
    return dbPlayers.map(player => {
      const contract = playerContracts.find(contract=>contract.playerId === player.id && !contract.isLoan)
      const loanContract = playerContracts.find(contract=>contract.playerId === player.id && contract.isLoan)
      const team = contract ? allActiveTeams.find(team => team.id === contract?.team): undefined
      const loanTeam = loanContract ? allActiveTeams.find(team => team.id === loanContract?.team) : undefined
      return {
        ...player,
        name: getPlayerNick(discPlayers.find(discPlayer=> discPlayer.user.id === player.id)),
        contract,
        team,
        loanContract,
        loanTeam
      }
    })
  })
}

export const getPlayer = async ({dbClient, getParams}) => {
  let query = {}
  const allPlayers = await getAllPlayers(process.env.GUILD_ID)
  if(getParams.name) {
    const name = getParams.name.toLowerCase()
    const foundPlayers = allPlayers.filter(player=> player?.user?.username.toLowerCase().includes(name) || (player?.nick && player?.nick.toLowerCase().includes(name)) )
    const searchPlayers = foundPlayers.slice(0, 9)
    const playerIds = searchPlayers.map(player=>player.user.id)
    return dbClient(async ({players, playerStats, contracts})=> {
      const [dbPlayers, allStats, allContracts] = await Promise.all([
        players.find({id: {$in: playerIds}}).toArray(),
        playerStats.find({id: {$in: playerIds}, matchId: {$ne:null}}).toArray(),
        contracts.find({playerId: {$in: playerIds}}).toArray(),
      ])
      const collection = dbPlayers.map( player => {
          const discPlayer = searchPlayers.find(guildMember=> guildMember?.user?.id === player.id)
          const stats = allStats.filter(stat=> stat.id === player.id)
          const contracts = allContracts.filter(contract=> contract.playerId === player.id)
          return {
            ...player,
            ...discPlayer,
            stats,
            contracts
          }
        })
      return {
        collection
      }
    })
  }
  if(getParams.id) {
    query.id = getParams.id
  }
  return dbClient(async ({players, playerStats, contracts})=> {
    const player = await players.findOne(query)
    if(player) {
      const [stats, allContracts] = await Promise.all([
        playerStats.find({id: player.id, matchId: {$ne:null}}).toArray(),
        contracts.find({playerId: player.id}).toArray(),
      ])
      const discPlayer = allPlayers.find(guildMember=> guildMember?.user?.id === player.id)
      //const statMatches = stats.map(stat=> new ObjectId(stat.matchId))
      //const playerMatches = matches.find({_id: {$in: statMatches}})
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

export const getPlayerStats = async ({dbClient, getParams}) => {
  let query = {}
  if(!getParams.ids)
    return {}
  
  query.id = {$in: getParams.ids.split(',').slice(0, 49)}

  return dbClient(async ({players, playerStats, contracts})=> {
    const player = await players.find(query).toArray()
    if(player.length > 0) {
      const [stats, allContracts] = await Promise.all([
        playerStats.find({...query, matchId: {$ne:null}}).toArray(),
        contracts.find({playerId: query.id}).toArray(),
      ])
      //const statMatches = stats.map(stat=> new ObjectId(stat.matchId))
      //const playerMatches = matches.find({_id: {$in: statMatches}})
      return player.map(player => ({
        ...player,
        stats: stats.filter(stat=> stat.id === player.id),
        contracts:allContracts.filter(contract=> contract.playerId === player.id)
      }))
    }
    return {}
  })
}