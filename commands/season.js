import { serverRoles } from "../config/psafServerConfig.js"
import { getPlayerNick, removePlayerPrefix, sleep, updateResponse, waitingMsg } from "../functions/helpers.js"
import { getAllPlayers } from "../functions/playersCache.js"
import { DiscordRequest } from "../utils.js"
import { endLoan } from "./transfers.js"

const logWebhook = process.env.WEBHOOK

export const seasonPhases = [{
  name: "first",
  desc: 'first half of regular season',
},{
  name: "second",
  desc: 'second half of regular season',
},{
  name: "post",
  desc: 'post regular season'
}]

export const getCurrentSeasonPhaseDb = async ({seasonsCollect}) => {
  const seasonObj = await seasonsCollect.findOne({endedAt: null})
  let phase = seasonPhases.find(sphase => sphase.name === seasonObj.phase)?.desc || seasonPhases[0].desc
  return `Season ${seasonObj.season}, ${phase}`
}

export const getCurrentSeasonPhase = async ({interaction_id, token, application_id, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const content = await dbClient(async ({seasonsCollect})=> {
    return getCurrentSeasonPhaseDb({seasonsCollect})
  })
  return updateResponse({application_id, token, content})
}

export const progressCurrentSeasonPhase = async ({interaction_id, token, guild_id, callerId, application_id, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const allPlayers = await getAllPlayers(guild_id)
  const {allExpiringContracts, allTeams, content} = await dbClient(async({seasonsCollect, contracts, teams})=> {
    const seasonObj = await seasonsCollect.findOne({endedAt: null})
    let newSeason = false
    console.log(seasonObj)
    if(!seasonObj.phase) {
      seasonObj.phase = seasonPhases[0].name
    } else if (seasonObj.phase === seasonPhases[2].name) {
      seasonObj.phase = seasonPhases[0].name
      seasonObj.season++
      newSeason = true
    } else {
      const index = seasonPhases.findIndex(({name}) => name === seasonObj.phase)
      seasonObj.phase = seasonPhases[index+1].name
    }
    const untilPhase = seasonPhases.findIndex(({name})=> name === seasonObj.phase).toString()
    console.log(seasonObj)
    const {phase, season} = seasonObj
    const loanSearchObj = {endedAt: null, isLoan: true, phase: untilPhase, until: season}
    console.log(loanSearchObj)
    const loansSearch = await contracts.find(loanSearchObj).toArray()
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
        await DiscordRequest(logWebhook, {
          method: 'POST',
          body: {content}
        })
      } else {
        console.log(`Tried to end loan of ${getPlayerNick(player)} but couldn't find a team to return him to.`)
      }
    }
    let allExpiringContracts
    let allTeams
    if(newSeason) {
      const fullExpiringContracts = await contracts.find({until: {$lte : seasonObj.season}, endedAt: null, isLoan: {$ne: true}, isManager: null}, {limit: 50}).toArray()
      allTeams = await teams.find({}).toArray()
      allExpiringContracts = fullExpiringContracts.filter(({playerId})=> {
        const discPlayer = allPlayers.find(({user})=> user.id === playerId)
        return discPlayer && !discPlayer.roles.includes(serverRoles.clubManagerRole)
      }).slice(0, 40)
      
      await contracts.updateMany({playerId: {$in: allExpiringContracts.map(({playerId}) => playerId)}}, {$set: {endedAt: Date.now()}})
      await seasonsCollect.updateOne({endedAt: null}, {$set:{endedAt: Date.now()}})
      await seasonsCollect.insertOne({phase, season, startedAt: Date.now(), phaseStartedAt: Date.now()})
    } else {
      await seasonsCollect.updateOne({endedAt: null}, {$set:{phase, season, phaseStartedAt: Date.now()}})
    }
    return {allExpiringContracts, allTeams, content: await getCurrentSeasonPhaseDb({seasonsCollect})}
    
  })
  const teamPlayers = allExpiringContracts.map((contract)=>{
    const player = allPlayers.find(({user})=> user.id === contract.playerId)
    return {
      ...contract,
      ...player
    }
  }).sort((a, b)=> a.team - b.team)
  
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
    `# Contracts expired\rThe following players are now free agents:`,
    ...teamPlayers.map(discPlayer => `<@${discPlayer.playerId}>`),
    `*from <@${callerId}>*`
  ]
  await DiscordRequest(logWebhook, {
    method: 'POST',
    body: {
      content: log.join('\r')
    }
  })
  console.log(content)
  await updateResponse({application_id, token, content})
}

export const getCurrentSeasonPhaseCmd = {
  name: 'getcurrentseasonphase',
  description: 'Check which season phase we\'re in',
  type: 1
}

export const progressCurrentSeasonPhaseCmd = {
  name: 'progresscurrentseasonphase',
  description: 'Move to the next season phase',
  type: 1
}