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

export const getPlayer = ({dbClient, getParams}) => {
  let query = {}
  if(getParams.id) {
    query.id = getParams.id
  }
  return dbClient(async ({players, playerStats, contracts})=> {
    const player = await players.findOne(query)
    if(player) {
      const [stats, allContracts, allPlayers] = await Promise.all([
        playerStats.find({id: player.id, matchId: {$ne:null}}).toArray(),
        contracts.find({playerId: player.id}).toArray(),
        getAllPlayers(process.env.GUILD_ID)
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