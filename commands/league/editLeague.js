import { leagueChoices } from "../../config/leagueData.js"
import { handleSubCommands, optionsToObject, postMessage, updateResponse } from "../../functions/helpers.js"
import { getAllLeagues, refreshAllLeagues } from "../../functions/leaguesCache.js"
import { serverChannels } from "../../config/psafServerConfig.js"

export const getLeaguesInfo = async ({dbClient, short}) => {
  return dbClient(({leagueConfig})=> {
    const projection = short ? {name: 1, value: 1} : {}
    return leagueConfig.find({}, projection).toArray()
  })
}

export const editLeague = async ({dbClient, token, application_id, options}) => {
  const {name, channel, league, emoji='', logo, order} = optionsToObject(options)
  const content = await dbClient(async ({leagueConfig})=> {
    const currentLeague = await leagueConfig.findOne({value: league})
    const payload = {
      name: name || currentLeague.name,
      defaultImage: logo || currentLeague.defaultImage,
      emoji: emoji.replace('<', '').replace('>', '') || currentLeague.emoji,
      channel: channel || currentLeague.channel,
      order: order || currentLeague.order
    }
    await leagueConfig.updateOne({value: league}, { $set: payload})
    refreshAllLeagues(leagueConfig)
    return `Updated:\r${JSON.stringify({...currentLeague, ...payload}, undefined, 2)}`
  })
  return updateResponse({application_id, token, content})
}

const activateLeague = async (options) => updateLeagueStatus(options, true)

const disableLeague = async (options) => console.log(options) || updateLeagueStatus(options, false)

const updateLeagueStatus = async ({token, application_id, callerId, options, dbClient}, active) => {
  const {league} = optionsToObject(options)
  const allLeagues = await getAllLeagues()
  if(!allLeagues.find(leagueObj => league === leagueObj.value)) {
    return updateResponse({application_id, token, content: `Can't find the league you've entered: ${league}`})
  }
  const content = await dbClient(async ({leagueConfig})=>{
    const selectedLeague = await leagueConfig.findOne({value: league})
    await leagueConfig.updateOne({value: league}, {$set: {active}})
    await refreshAllLeagues(leagueConfig)
    return `${selectedLeague.name} is now ${active ? 'active': 'inactive'}`
  })
  postMessage({channel_id: serverChannels.botActivityLogsChannelId, content: `<@${callerId}> changed a league status:\r${content}`})
  return updateResponse({application_id, token, content})
}

const leagueSubCommands = {
  'edit': editLeague,
  'activate': activateLeague,
  'disable': disableLeague,
}

const leagueFuncs = async (commandOptions) => 
  handleSubCommands(commandOptions, leagueSubCommands)

const leagueCmd = {
  name: 'league',
  description: 'Functions for editing leagues',
  func: leagueFuncs,
  psaf: true,
  options: [{
    type: 1,
    name: 'edit',
    description: 'Update a league',
    options: [{
      type: 3,
      name: 'league',
      description: 'League',
      required: true,
      autocomplete: true,
    },{
      type: 3,
      name: 'name',
      description: 'League\'s name'
    },{
      type: 3,
      name: 'logo',
      description: 'Logo'
    },{
      type: 3,
      name: 'channel',
      description: 'League\'s channel'
    },{
      type: 3,
      name: 'emoji',
      description: 'League\'s emoji'
    },{
      type: 4,
      name: 'order',
      description: 'Which order in the list'
    }]
  },{
    type: 1,
    name: 'activate',
    description: 'Activate a league',
    options: [{
      type: 3,
      name: 'league',
      description: 'League',
      required: true,
      autocomplete: true,
    }]
  },{
    type: 1,
    name: 'disable',
    description: 'Disable a league',
    options: [{
      type: 3,
      name: 'league',
      description: 'League',
      required: true,
      autocomplete: true,
    }]
  }]
}

export const editLeagueCmd = {
  type: 1,
  name: 'editleague',
  description: 'Update a league',
  func: editLeague,
  psaf: true,
  options: [{
    type: 3,
    name: 'league',
    description: 'League',
    required: true,
    choices: leagueChoices
  },{
    type: 3,
    name: 'name',
    description: 'League\'s name'
  },{
    type: 3,
    name: 'logo',
    description: 'Logo'
  },{
    type: 3,
    name: 'channel',
    description: 'League\'s channel'
  },{
    type: 3,
    name: 'emoji',
    description: 'League\'s emoji'
  },{
    type: 4,
    name: 'order',
    description: 'Which order in the list'
  }]
}

export default [leagueCmd]