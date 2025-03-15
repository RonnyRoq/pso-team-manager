import { DiscordRequest, isValidHttpUrl } from "../utils.js"
import { displayTeam, handleSubCommands, isNumeric, optionsToObject, updateResponse, waitingMsg } from "../functions/helpers.js"
import { serverChannels, serverRoles } from "../config/psafServerConfig.js"
import { releaseTeamPlayers } from "./transfers.js"

const editTeam = async ({application_id, token, options, dbClient}) => {
  let response = "No teams found"
  const {team, palmares, emoji, city, flag, shortname, name, logo, channel} = Object.fromEntries(options.map(({name, value})=> [name, value]))
  const roles = [{id: team}]
  let newChannel = channel
  if(channel){
    if(isValidHttpUrl(channel)) {
      const channelUrl = new URL(channel)
      if (channelUrl.hostname === 'discord.com') {
        const pathArray = channelUrl.pathname.split('/')
        newChannel = pathArray.length > 0 ? pathArray[pathArray.length-1] : ''
      }
    }
  }
  if(!isNumeric(newChannel)) {
    newChannel = ''
  }
  return await dbClient(async ({teams})=>{
    const team = (await teams.findOne({$or:roles})) || {}
    const payload = {
      shortName: shortname || team.shortName,
      name: name || team.name,
      description: palmares || team.description,
      emoji: emoji || team.emoji,
      city: city || team.city,
      flag: flag || team.flag,
      logo: logo || team.logo,
      channel: newChannel || team.channel
    }
    await teams.updateOne({id: team.id}, {$set: payload})
    const updatedTeam = await teams.findOne({id:team.id})
    response = displayTeam(updatedTeam)
    return updateResponse({application_id, token, content: response})
  })
}

export const updateTeamStatus = async ({team, active=false, dbClient})=> {
  return dbClient(async ({teams})=>{
    const dbTeam = await teams.findOne({id: team})
    if(!dbTeam) {
      return `Cannot find <@&${team}>`
    }
    if(active && dbTeam?.active) {
      return `<@&${team}> is already active.`
    } else if(!active && !dbTeam?.active) {
      return `<@&${team}> is already inactive`
    } else {
      await teams.updateOne({id: team}, {$set: {active: active}})
      return `Updated <@&${team}>. Transfers are now ${active ? 'available':'unavailable'}.`
    }
  })
}

const disableTeam = async (params) => updateTeamStatusCommand({...params, active: false})
const activateTeam = async (params) => updateTeamStatusCommand({...params, active: true})

const updateTeamStatusCommand = async ({token, application_id, options, dbClient, active}) => {
  const {team} = optionsToObject(options)
  console.log(team, active)
  const content = await updateTeamStatus({team, active, dbClient})
  return updateResponse({application_id, token, content})
}

const releasePlayers = async ({member, token, guild_id, application_id, options, dbClient}) => {
  if(!member.roles.includes(serverRoles.presidentRole)) {
    return updateResponse({content:'reserved to presidents', application_id, token})
  }
  const {team} = optionsToObject(options)
  const content = await releaseTeamPlayers({team, guild_id, dbClient})
  return updateResponse({application_id, token, content})
}

const acceptTeam = async ({dbClient, options, interaction_id, token, guild_id, application_id}) => {
  await waitingMsg({interaction_id, token})
  const {team} = optionsToObject(options)
  const content = await dbClient(async ({teams})=>{
    const [dbTeam, teamRoleResp] = await Promise.all([
      teams.findOne({id: team}),
      DiscordRequest(`guilds/${guild_id}/roles/${team}`)
    ])
    const teamRole = await teamRoleResp.json()
    if(!dbTeam) {
      return `Can't find team ${team}`
    }
    const channelResp = await DiscordRequest(`/channels/${dbTeam.channelId}`)
    const channel = await channelResp.json()
    if(channel.guild_id !== dbTeam.guildId) {
      return `Channel ${dbTeam.channelId} not found in guild ${dbTeam.guildId}`
    }
    if(channel.parent_id !== serverChannels.pgCategory) {
      return `Team's Channel ${dbTeam.channelId} not in PG category`
    }
    if(!teamRole) {
      return `Can't find role ${team}`
    }
    await DiscordRequest(`/channels/${dbTeam.channelId}`, {
      method: 'PATCH',
      body: {
        parent_id: serverChannels.clubsCategory,
      }
    })
    return 'No errors'
  })
  return updateResponse({application_id, token, content})
}

const editTeamSubCommands = {
  'details': editTeam,
  'activate': activateTeam,
  'disable': disableTeam,
  'releaseplayers': releasePlayers,
  'accept': acceptTeam, 
}

const editTeamGroup = (commandOptions) => 
  handleSubCommands(commandOptions, editTeamSubCommands)

const editTeamCmd =  {
  name: 'details',
  description: 'Edit team details',
  type: 1,
  options: [{
    type: 8,
    name: 'team',
    description: 'Team',
    required: true
  },{
    type: 3,
    name: 'palmares',
    description: 'palmares'
  },{
    type: 3,
    name: 'emoji',
    description: 'Emoji'
  },{
    type: 3,
    name: 'city',
    description: 'City'
  },{
    type: 3,
    name: 'flag',
    description: 'Flag'
  },{
    type: 3,
    name: 'logo',
    description: 'Logo'
  },{
    type: 3,
    name: 'shortname',
    description: 'Team\'s short name (max 4 chars)'
  },{
    type: 3,
    name: 'name',
    description: 'Team\'s name'
  },{
    type: 3,
    name: 'channel',
    description: 'Team\'s channel'
  }]
}

export const activateTeamCmd = {
  name: 'activate',
  description: 'Activate a team',
  type: 1,
  options: [{
    type: 8,
    name: 'team',
    description: 'Team',
    required: true
  }]
}


const disableTeamCmd = {
  name: 'disable',
  description: 'Disable a team',
  type: 1,
  options: [{
    type: 8,
    name: 'team',
    description: 'Team',
    required: true
  }]
}

const releasePlayersCmd = {
  name: 'releaseplayers',
  description: 'Release all the players. THIS CANNOT BE UNDONE',
  type: 1,
  options: [{
    type: 8,
    name: 'team',
    description: 'Team',
    required: true
  }]
}

const teamCmd = {
  name: 'editteam',
  description: 'Edit a team',
  func: editTeamGroup,
  psaf: true,
  options: [
    editTeamCmd,
    activateTeamCmd,
    disableTeamCmd,
    releasePlayersCmd
  ]
}

export default [teamCmd]