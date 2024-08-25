import { serverChannels, serverRoles } from "../../config/psafServerConfig"
import { getPlayerNick, postMessage, removePlayerPrefix, sleep, updateResponse } from "../../functions/helpers"
import { getAllPlayers } from "../../functions/playersCache"
import { DiscordRequest } from "../../utils"
import { endLoan } from "../transfers"


export const releasePlayersFromTeam = async ({unblacklist, reimburseLoans, team, dbClient, guild_id, member, callerId}) => {
  const allPlayers = await getAllPlayers(guild_id)
  const {allExpiringContracts, allTeams, loansSearch} = await dbClient(async({seasonsCollect, contracts, teams})=> {
    const seasonObj = await seasonsCollect.findOne({endedAt: null})
    let newSeason = false
    console.log(seasonObj)
    const {phase, season} = seasonObj
    const loansSearch = await contracts.find({team, endedAt: null, isLoan: true}).toArray()
    console.log(loansSearch.map(loan=> loan.playerId))
    const initialContracts = await contracts.find({endedAt: null, playerId: {$in: loansSearch.map(loan=> loan.playerId)}}).toArray()
    console.log(initialContracts)
    console.log(`${loansSearch.length} loans to end`)
    for await (const loan of loansSearch) {
      const player = allPlayers.find(currentPlayer => currentPlayer.user.id === loan.playerId)
      const endLoanTeam = await teams.findOne({id: loan.team})
      const initialContract = initialContracts.find(contract => contract.playerId === loan.playerId)
      if(initialContract) {
        const teamToReturn = await teams.findOne({id: initialContract.team})
        const content = await endLoan({callerId, guild_id, player, playerId:loan.playerId, teamToReturn, endLoanTeam, contracts})
        await postMessage({channel_id: serverChannels.logsChannelId, content})
      } else {
        console.log(`Tried to end loan of ${getPlayerNick(player)} but couldn't find a team to return him to.`)
      }
    }
    let allExpiringContracts = []
    if(newSeason) {
      const fullExpiringContracts = await contracts.find({team, endedAt: null, isLoan: {$ne: true}}).toArray()
      allExpiringContracts = fullExpiringContracts.filter(({playerId})=> {
        const discPlayer = allPlayers.find(({user})=> user.id === playerId)
        return discPlayer && !discPlayer.roles.includes(serverRoles.clubManagerRole)
      })      
      await contracts.updateMany({playerId: {$in: allExpiringContracts.map(({playerId}) => playerId)}}, {$set: {endedAt: Date.now()}})
      await seasonsCollect.updateOne({endedAt: null}, {$set:{endedAt: Date.now()}})
      await seasonsCollect.insertOne({phase, season, startedAt: Date.now(), phaseStartedAt: Date.now()})
    } else {
      await seasonsCollect.updateOne({endedAt: null}, {$set:{phase, season, phaseStartedAt: Date.now()}})
    }
    return {allExpiringContracts, allTeams, loansSearch}
  })
  const teamPlayers = allExpiringContracts.map((contract)=>{
    const player = allPlayers.find(({user})=> user.id === contract.playerId)
    return {
      ...contract,
      ...player
    }
  })
  
  for await (const player of teamPlayers) {
    if(player.user && !player.roles.includes(serverRoles.clubManagerRole)) {
      const playerName = getPlayerNick(player)
      let updatedPlayerName = removePlayerPrefix(allTeams.find(({id})=> id === player.team )?.shortName, playerName)
      const payload= {
        nick: updatedPlayerName,
        roles: player.roles.filter(playerRole=> ![player.team, serverRoles.clubManagerRole, serverRoles.clubPlayerRole].includes(playerRole))
      }
      await DiscordRequest(`guilds/${guild_id}/members/${player.playerId}`, {
        method: 'PATCH',
        body: payload
      })
      await sleep(500)
    }
  }
  const log = [
    `# Team <@&${team}> disbanded.\rThe following players are now free agents:`,
    ...teamPlayers.map(discPlayer => `<@${discPlayer.playerId}>`),
    `*from <@${callerId}>*`
  ]
  await postMessage({channel_id: serverChannels.logsChannelId, content: log.join('\r')})
  return `Done, ${loansSearch} returned from loan, ${teamPlayers} released`
}