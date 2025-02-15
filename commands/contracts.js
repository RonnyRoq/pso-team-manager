import { serverChannels, serverRoles } from "../config/psafServerConfig.js"
import { getCurrentSeason, getPlayerNick, isManager, isManagerRole, optionsToObject, postMessage, quickResponse, removePlayerPrefix, sleep, updateDiscordPlayer, updateResponse, waitingMsg } from "../functions/helpers.js"
import { getAllPlayers } from "../functions/playersCache.js"
import { DiscordRequest } from "../utils.js"

const logWebhook = process.env.WEBHOOK

export const showNoContracts = async ({guild_id, interaction_id, token, application_id, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const totalPlayers = await getAllPlayers(guild_id)

  const {allActiveTeams, allContracts} = await dbClient(async ({teams, contracts})=> {
    const allActiveTeams = await teams.find({active: true}, {projection: {id: 1}}).toArray()
    const allContracts = await contracts.find({until: null}, {projection: {playerId: 1}}).toArray()
    return {allActiveTeams, allContracts}
  })
  const allActiveTeamIds = allActiveTeams.map(({id})=> id)
  const allContractsPlayerIds = allContracts.map(({playerId})=> playerId)
  const playersWithATeamAndNoContract = totalPlayers.filter(player => {
    const teamId = !isManager(player) && player.roles.find(role => allActiveTeamIds.includes(role))
    const hasContract = teamId ? allContractsPlayerIds.includes(player.user.id) : false
    return teamId && !hasContract
  })

  const result = [`${playersWithATeamAndNoContract.length} players with a team and no contract:`,
    ...playersWithATeamAndNoContract.sort((a,b) => (a.nick || a.user.username).localeCompare(b.nick || b.user.username)).map(player => `<@${player.user.id}>`)
  ]
  const content = result.join('\r').substring(0, 1990)
  return updateResponse({application_id, token, content})
}


export const showExpiringContracts = async ({guild_id, interaction_id, token, application_id, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const totalPlayers = await getAllPlayers(guild_id)

  const {allActiveTeams, allContracts} = await dbClient(async ({teams, contracts})=> {
    const allActiveTeams = await teams.find({active: true}, {projection: {id: 1}}).toArray()
    const allContracts = await contracts.find({until: 4}, {projection: {playerId: 1}}).toArray()
    return {allActiveTeams, allContracts}
  })
  const allActiveTeamIds = allActiveTeams.map(({id})=> id)
  const allContractsPlayerIds = allContracts.map(({playerId})=> playerId)
  const playersWithATeamAndExpiringContract = totalPlayers.filter(player => {
    const teamId = !isManager(player)
     && !player.roles.includes(serverRoles.matchBlacklistRole)
     && !player.roles.includes(serverRoles.permanentlyBanned)
     && player.roles.find(role => allActiveTeamIds.includes(role))
    const hasContract = teamId ? allContractsPlayerIds.includes(player.user.id) : false
    return teamId && hasContract
  })

  const result = [`${playersWithATeamAndExpiringContract.length} players with a team and an expiring contract:`,
    ...playersWithATeamAndExpiringContract.sort((a,b) => (a.nick || a.user.username).localeCompare(b.nick || b.user.username)).map(player => `<@${player.user.id}>`)
  ]
  const content = result.join('\r').substring(0, 1990)
  return updateResponse({application_id, token, content})
}
/*export const emergencyOneSeasonContract = async ({interaction_id, token, application_id, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const result = await dbClient(async ({contracts})=> {
    return await contracts.updateMany({until: 3}, {$set: {until: 4}})
  })
  await updateResponse({application_id, token, content: JSON.stringify(result)})
}*/

export const emergencyOneSeasonContract = async ({guild_id, interaction_id, token, callerId, application_id, dbClient}) => {
  if(callerId !== '269565950154506243')
    return quickResponse({interaction_id, token, content: 'No', isEphemeral: true})
  await waitingMsg({interaction_id, token})
  const totalPlayers = await getAllPlayers(guild_id)
  const at = Date.now()
  const {contractsToInsert, insertedCount} = await dbClient(async ({teams, contracts})=> {
    const allActiveTeams = await teams.find({active: true}, {projection: {id: 1}}).toArray()
    const allContracts = await contracts.find({endedAt: 3}, {projection: {playerId: 1}}).toArray()
    
    const allActiveTeamIds = allActiveTeams.map(({id})=> id)
    const allContractsPlayerIds = allContracts.map(({playerId})=> playerId)
    const contractsToInsert = totalPlayers.map(player => {
      const teamId = !isManager(player) && player.roles.find(role => allActiveTeamIds.includes(role))
      const hasContract = teamId ? allContractsPlayerIds.includes(player.user.id) : false
      if(teamId && !hasContract)
        return {playerId: player.user.id, team: teamId, at, until: 4}
      return {}
    }).filter(player=> player?.playerId)
    const result = await contracts.insertMany(contractsToInsert.slice(0, 100))
    console.log(`${result.insertedCount} documents were inserted`)
    return {contractsToInsert, insertedCount: result.insertedCount }
  })

  const content = `${contractsToInsert.length} players with a team and no contract, ${insertedCount} solved`
  return updateResponse({application_id, token, content})
}

export const expireContracts = async ({dbClient, interaction_id, token, guild_id, callerId, application_id, options}) => {
  const {dryrun} = optionsToObject(options || [])
  await waitingMsg({interaction_id, token})
  const totalPlayers = await getAllPlayers(guild_id)
  const {allExpiringContracts, allTeams} = await dbClient(async ({contracts, seasonsCollect, teams})=> {
    const currentSeason = await getCurrentSeason(seasonsCollect)
    const fullExpiringContracts = await contracts.find({until: {$lte : currentSeason}, endedAt: null, isLoan: {$ne: true}, isManager: null}, {limit: 200}).toArray()
    const allTeams = await teams.find({}).toArray()
    const allExpiringContracts = fullExpiringContracts.filter(({playerId})=> {
      const discPlayer = totalPlayers.find(({user})=> user.id === playerId)
      return discPlayer && !isManager(discPlayer)
    }).slice(0, 40)
    if(!dryrun) {
      await contracts.updateMany({playerId: {$in: allExpiringContracts.map(({playerId}) => playerId)}}, {$set: {endedAt: Date.now()}})
    }
    return {allExpiringContracts, allTeams}
  })

  const teamPlayers = allExpiringContracts.map((contract)=>{
    const player = totalPlayers.find(({user})=> user.id === contract.playerId)
    return {
      ...contract,
      ...player
    }
  }).sort((a, b)=> a.team - b.team)
  
  if(dryrun) {
    console.log(teamPlayers)
    return await updateResponse({application_id, token, content: (teamPlayers.map(({nick})=>nick).join('\r') || '---')})
  }
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
  await updateResponse({application_id, token, content: 'done'})
}

export const setCaptain = async ({interaction_id, token, guild_id, application_id, callerId, options, dbClient}) => {
  const {player, iscaptain} = optionsToObject(options)
  await waitingMsg({interaction_id, token})
  const discPlayerResp = await DiscordRequest(`guilds/${guild_id}/members/${player}`)
  const discPlayer = await discPlayerResp.json()
  const body = {
    roles: iscaptain ? [...new Set([...discPlayer.roles, serverRoles.pgManagerRole, serverRoles.clubManagerRole])] : [...new Set([...discPlayer.roles.filter(role=> !isManagerRole(role))])]
  }
  const content = await dbClient(async({players, contracts})=> {
    await Promise.all([
      contracts.updateOne({endedAt:null, playerId: player}, {$set: {iscaptain}}),
      players.updateOne({id: player}, {$set: {iscaptain}}),
      updateDiscordPlayer(guild_id, player, body)
    ])
    return `<@${player}> has been ${iscaptain ? 'set as a' : 'removed as a'} captain. *(from <@${callerId}>)*`
  })
  await postMessage({channel_id: serverChannels.botActivityLogsChannelId, content})
  return updateResponse({application_id, token, content})
}

export const showNoContractsCmd = {
  name: 'shownocontracts',
  description: 'Show players in a team without a contract',
  type: 1
}
export const showExpiringContractsCmd = {
  name: 'showexpiringcontracts',
  description: 'Show expiring contracts',
  type: 1
}

export const expireContractsCmd = {
  name: 'expirecontracts',
  description: 'Expire all contracts for the current season',
  type: 1,
  options: [{
    type: 5,
    name: 'dryrun',
    description: "Do a Dry run?"
  }]
}

export const emergencyOneSeasonContractCmd = {
  name: 'emergencyoneseasoncontract',
  description: 'DEBUG, DO NOT TOUCH WITH SHINSH\'S PERMISSION',
  type: 1
}

const setCaptainCmd = {
  name: 'setcaptain',
  description: 'Set a player as a captain of a team',
  type: 1,
  psaf: true,
  func: setCaptain,
  options: [{
    name: 'player',
    description: 'Player to change role',
    type: 6,
  },{
    name: 'iscaptain',
    description: 'Set as captain or remove from captain?',
    type: 5,
  }]
}

export default [setCaptainCmd]