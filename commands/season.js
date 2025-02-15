import { serverChannels, serverRoles } from "../config/psafServerConfig.js"
import { getPlayerNick, isManager, optionsToObject, postMessage, removePlayerPrefix, sleep, updateResponse, waitingMsg } from "../functions/helpers.js"
import { getAllPlayers } from "../functions/playersCache.js"
import { DiscordRequest } from "../utils.js"
import { endLoan } from "./transfers.js"

const logWebhook = process.env.WEBHOOK

export const seasonPhases = [{
  name: "first",
  desc: 'Day 1',
},{
  name: "second",
  desc: 'Day 5',
/*},{
  name: "post",
  desc: 'post regular season'*/
}]

let currentSeason

export const updateCacheCurrentSeason = async (seasonsCollect) => 
  currentSeason = await seasonsCollect.findOne({endedAt: null})
  
export const getFastCurrentSeason = () => currentSeason?.season

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

export const replaySeasonPhaseProgression = async ({interaction_id, token, guild_id, callerId, application_id, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const allPlayers = await getAllPlayers(guild_id)
  const {allExpiringContracts, allTeams, content} = await dbClient(async({seasonsCollect, contracts, teams})=> {
    const seasonObj = await seasonsCollect.findOne({endedAt: null})
    let newSeason = true
    console.log(seasonObj)
    
    let allExpiringContracts = []
    let allTeams
    if(newSeason) {
      const fullExpiringContracts = await contracts.find({until: {$lte : seasonObj.season}, endedAt: null, isLoan: {$ne: true}, isManager: null}).toArray()
      console.log(fullExpiringContracts.length)
      allTeams = await teams.find({}).toArray()
      allExpiringContracts = fullExpiringContracts.filter(({playerId})=> {
        const discPlayer = allPlayers.find(({user})=> user.id === playerId)
        console.log(playerId, discPlayer?.nick, "manager:", isManager(discPlayer))
        return discPlayer && !isManager(discPlayer)
      })

      console.log(allExpiringContracts.length)
      console.log(allExpiringContracts)
      await contracts.updateMany({playerId: {$in: allExpiringContracts.map(({playerId}) => playerId)}, endedAt: null}, {$set: {endedAt: Date.now()}})
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
  
  console.log(teamPlayers.length)
  console.log(teamPlayers.map(player=>player.nick))
  for await (const player of teamPlayers) {
    if(player.user && !isManager(player)) {
      const playerName = getPlayerNick(player)
      let updatedPlayerName = removePlayerPrefix(allTeams.find(({id})=> id === player.team )?.shortName, playerName)
      const payload= {
        nick: updatedPlayerName,
        roles: player.roles.filter(playerRole=> ![player.team, serverRoles.clubManagerRole, serverRoles.pgManagerRole, serverRoles.clubPlayerRole].includes(playerRole))
      }
      try {
        await DiscordRequest(`guilds/${guild_id}/members/${player.playerId}`, {
          method: 'PATCH',
          body: payload
        })
      } catch (e) {
        console.log(e)
      }
      await sleep(100)
    }
  }
  const playersChunk = []
  const chunkSize = 20;
  for (let i = 0; i < teamPlayers.length; i += chunkSize) {
      const chunk = teamPlayers.slice(i, i + chunkSize);
      playersChunk.push(chunk)
  }
  
  for await (const playersList of playersChunk) {
    const log = [
      `# Contracts expired\rThe following players are now free agents:`,
      ...playersList.map(discPlayer => `<@${discPlayer.playerId}>`),
      `*from <@${callerId}>*`
    ]
    await DiscordRequest(logWebhook, {
      method: 'POST',
      body: {
        content: log.join('\r')
      }
    })
    console.log(content)
  }
  await updateResponse({application_id, token, content: 'Done'})
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
    } else if (seasonObj.phase === seasonPhases[seasonPhases.length-1].name) {
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
    let allExpiringContracts = []
    let allTeams
    if(newSeason) {
      const fullExpiringContracts = await contracts.find({until: {$lte : seasonObj.season}, endedAt: null, isLoan: {$ne: true}, isManager: null}, {limit: 100}).toArray()
      allTeams = await teams.find({}).toArray()
      console.log(fullExpiringContracts.length)
      allExpiringContracts = fullExpiringContracts.filter(({playerId})=> {
        const discPlayer = allPlayers.find(({user})=> user.id === playerId)
        return discPlayer && !isManager(discPlayer)
      }).slice(0, 60)
      
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
  console.log(teamPlayers.length)
  console.log(teamPlayers.map(player=>player.nick))
  for await (const player of teamPlayers) {
    if(player.user && !isManager(player)) {
      const playerName = getPlayerNick(player)
      let updatedPlayerName = removePlayerPrefix(allTeams.find(({id})=> id === player.team )?.shortName, playerName)
      const payload= {
        nick: updatedPlayerName,
        roles: player.roles.filter(playerRole=> ![player.team, serverRoles.clubManagerRole, serverRoles.pgManagerRole, serverRoles.clubPlayerRole].includes(playerRole))
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

export const removeRolesForExpiredContracts = async ({interaction_id, application_id, token, dbClient, guild_id, options}) => {
  await waitingMsg({interaction_id, token})
  const {dryrun} = optionsToObject(options)
  const content = await internalRemoveRolesForExpiredContracts({dbClient, guild_id, dryrun})
  await updateResponse({application_id, token, content})
}

export const internalRemoveRolesForExpiredContracts = async ({dbClient, guild_id, dryrun=false}) => {
  const allPlayers = await getAllPlayers(guild_id)
  const allClubPlayers = allPlayers.filter(player=> player.roles.includes(serverRoles.clubPlayerRole) && player.roles.includes(serverRoles.registeredRole) && !player.roles.includes(serverRoles.clubManagerRole))
  let releaseLog = []
  const {allOngoingContracts, allTeams} = await dbClient(async ({contracts, teams})=> {
    const allTeams = await teams.find({active: true}).toArray()
    const ongoingContractsRequest = await contracts.find({endedAt: null}, {playerId: 1})
    const allOngoingContracts = []
    for await (const contract of ongoingContractsRequest) {
      allOngoingContracts.push(contract.playerId)
    }
    return {allOngoingContracts, allTeams}
  })
  console.log(allOngoingContracts.length, allClubPlayers.length)
  const nonContractPlayers = allClubPlayers.filter(player=> !allOngoingContracts.includes(player?.user?.id))
  for (const player of nonContractPlayers) {
    if(player.user && !isManager(player)) {
      const playerId = player?.user?.id
      const playerName = getPlayerNick(player)
      const playerTeam = allTeams.find(({id})=> player.roles.includes(id))
      let updatedPlayerName = removePlayerPrefix(playerTeam?.shortName, playerName)
      const payload= {
        nick: updatedPlayerName,
        roles: player.roles.filter(playerRole=> ![player.team, serverRoles.clubManagerRole, serverRoles.clubPlayerRole, playerTeam].includes(playerRole))
      }
      if(dryrun) {
        console.log(updatedPlayerName)
      } else {
        try {
          console.log(updatedPlayerName)
          await DiscordRequest(`guilds/${guild_id}/members/${playerId}`, {
            method: 'PATCH',
            body: payload
          })
          releaseLog.push(playerId)
          await sleep(300)
          
        } catch(e) {
          console.error(`Can't update ${updatedPlayerName}, <@${playerId}>`)
        }
      }
    }
  }
  let playersLog = releaseLog.map(playerId => `<@${playerId}>`)
  while(playersLog.length > 0) {
    const logMessage = [
      `# Contracts expired\rThe following players are now free agents:`,
      ...playersLog.splice(0, 99),
      `*Auto script.*`
    ]
    console.log(logMessage)
    await postMessage({channel_id: serverChannels.logsChannelId, content: logMessage.join('\r').substring(0, 1999)})
  }
  return `done, ${releaseLog.length} players released`
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

export const removeRolesForExpiredContractsCmd = {
  name: 'removerolesforexpiredcontracts',
  description: 'Remove discord roles if there\'s no contract',
  psaf: true,
  func: removeRolesForExpiredContracts,
  type: 1,
  options: [{
    name: 'dryrun',
    description: 'Runs without making changes',
    type: 5
  }]
}

export const replaySeasonPhaseProgressionCmd = {
  name: 'replayseasonphaseprogression',
  psaf: true,
  func: replaySeasonPhaseProgression,
  description: 'Replay the season phase transition',
  type: 1
}

export default [replaySeasonPhaseProgressionCmd, removeRolesForExpiredContractsCmd]