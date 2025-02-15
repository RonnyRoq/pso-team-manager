import { serverChannels, transferBanStatus } from "../../config/psafServerConfig.js"
import { optionsToObject, postMessage, quickResponse } from "../../functions/helpers.js"

const setTransferBan = async ({interaction_id, token, options, callerId, dbClient, transferBan}) => {
  const {team} = optionsToObject(options)
  const content = await dbClient(async ({teams})=> {
    const dbTeam = await teams.findOne({id: team})
    if(!dbTeam) {
      return `<@&${team}> not found for transfer ban.`
    }
    await teams.updateOne({id: team}, {$set: {transferBan}})
    return `<@&${team}> transfers are now ${transferBan ? (transferBan === transferBanStatus.exitBan ? 'exit blocked' : 'banned') : 'available'}. (from <@${callerId}>)`
  })
  await postMessage({channel_id: serverChannels.botActivityLogsChannelId, content})
  return quickResponse({interaction_id, token, content, isEphemeral:true})
}

const leagueTransferBan = async ({interaction_id, token, options, callerId, dbClient}) => {
  const {action, league} = optionsToObject(options)
  const transferBan = (action === 'remove') ? transferBanStatus.free : action
  const content = await dbClient(async ({teams, leagues, leagueConfig})=> {
    const leagueFound = await leagueConfig.findOne({leagueConfig})
    if(!leagueFound) {
      return `Can't find League ${league}`
    }
    const leagueTeams = await leagues.find({leagueId: league}).toArray()
    const teamsId = leagueTeams.map(leagueTeam=> leagueTeam.team)
    await teams.updateMany({id: {$in: teamsId}}, {$set: {transferBan}})
    return `## League ban\rTransfers are now ${transferBan ? (transferBan === transferBanStatus.exitBan ? 'exit blocked' : 'banned') : 'available'} for:\r${teamsId.map(team=> `<@&${team}>`).join('\r')}\r(from <@${callerId}>)`
  })
  await postMessage({channel_id: serverChannels.botActivityLogsChannelId, content})
  return quickResponse({interaction_id, token, content, isEphemeral:true})
}


const transferBan = async ({interaction_id, token, options, callerId, dbClient}) => {
  const {action} = optionsToObject(options)
  const transferBan = (action === 'remove') ? transferBanStatus.free : action
  return setTransferBan({interaction_id, token, options, callerId, dbClient, transferBan})
}

export const addTransferBan = async ({interaction_id, token, options, callerId, dbClient}) => {
  return setTransferBan({interaction_id, token, options, callerId, dbClient, transferBan: true})
}

export const removeTransferBan = async ({interaction_id, token, options, callerId, dbClient}) => {
  return setTransferBan({interaction_id, token, options, callerId, dbClient, transferBan: false})
}

const transferBanCmd = {
  name: 'transferban',
  description: 'Handling transfer bans',
  type: 1,
  psaf: true,
  func: transferBan,
  options: [{
    name: 'action',
    description: 'Which action to take',
    type: 3,
    required: true,
    choices: [{
      name: 'Full Ban',
      value: transferBanStatus.transferBan,
    },{
      name: 'Remove Ban',
      value: 'remove',
    },{
      name: 'Exit Ban',
      value: transferBanStatus.exitBan,
    }]
  },{
    type: 8,
    name: 'team',
    description: 'Team',
    required: true,
  }]
}

const leagueTransferBanCmd = {
  name: 'leaguetransferban',
  description: 'Handling transfer bans for teams in a league',
  type: 1,
  psaf: true,
  func: leagueTransferBan,
  options: [{
    name: 'action',
    description: 'Which action to take',
    type: 3,
    required: true,
    choices: [{
      name: 'Full Ban',
      value: transferBanStatus.transferBan,
    },{
      name: 'Remove Ban',
      value: 'remove',
    },{
      name: 'Exit Ban',
      value: transferBanStatus.exitBan,
    }]
  },{
    type: 3,
    name: 'league',
    description: 'League',
    required: true,
    autocomplete: true,
  }]
}

export default [transferBanCmd, leagueTransferBanCmd]