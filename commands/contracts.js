import { serverRoles } from "../config/psafServerConfig.js"
import { updateResponse, waitingMsg } from "../functions/helpers.js"
import { getAllPlayers } from "../functions/playersCache.js"


export const showNoContracts = async ({guild_id, interaction_id, token, application_id, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const totalPlayers = await getAllPlayers(guild_id)

  const {allActiveTeams, allContracts} = await dbClient(async ({teams, contracts})=> {
    const allActiveTeams = await teams.find({active: true}, {projection: {id: 1}}).toArray()
    const allContracts = await contracts.find({endedAt: 3}, {projection: {playerId: 1}}).toArray()
    return {allActiveTeams, allContracts}
  })
  const allActiveTeamIds = allActiveTeams.map(({id})=> id)
  const allContractsPlayerIds = allContracts.map(({playerId})=> playerId)
  const playersWithATeamAndNoContract = totalPlayers.filter(player => {
    const teamId = !player.roles.includes(serverRoles.clubManagerRole) && player.roles.find(role => allActiveTeamIds.includes(role))
    const hasContract = teamId ? allContractsPlayerIds.includes(player.user.id) : false
    return teamId && !hasContract
  })

  const result = [`${playersWithATeamAndNoContract.length} players with a team and no contract:`,
    ...playersWithATeamAndNoContract.map(player => `<@${player.user.id}>`)
  ]
  const content = result.join('\r').substring(0, 1990)
  return updateResponse({application_id, token, content})
}

export const emergencyOneSeasonContract = async ({interaction_id, token, application_id, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const result = await dbClient(async ({contracts})=> {
    return await contracts.updateMany({until: 3}, {$set: {until: 4}})
  })
  await updateResponse({application_id, token, content: JSON.stringify(result)})
}

/*export const emergencyOneSeasonContract = async ({guild_id, interaction_id, token, application_id, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const totalPlayers = await getAllPlayers(guild_id)
  const at = Date.now()
  const {contractsToInsert, insertedCount} = await dbClient(async ({teams, contracts})=> {
    const allActiveTeams = await teams.find({active: true}, {projection: {id: 1}}).toArray()
    const allContracts = await contracts.find({endedAt: 3}, {projection: {playerId: 1}}).toArray()
    
    const allActiveTeamIds = allActiveTeams.map(({id})=> id)
    const allContractsPlayerIds = allContracts.map(({playerId})=> playerId)
    const contractsToInsert = totalPlayers.map(player => {
      const teamId = !player.roles.includes(serverRoles.clubManagerRole) && player.roles.find(role => allActiveTeamIds.includes(role))
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
}*/

export const showNoContractsCmd = {
  name: 'shownocontracts',
  description: 'Show players in a team without a contract',
  type: 1
}

export const emergencyOneSeasonContractCmd = {
  name: 'emergencyoneseasoncontract',
  description: 'DEBUG, DO NOT TOUCH WITH SHINSH\'S PERMISSION',
  type: 1
}