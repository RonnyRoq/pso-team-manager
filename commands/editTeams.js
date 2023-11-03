import { InteractionResponseType, InteractionResponseFlags } from "discord-interactions"
import { DiscordRequest } from "../utils.js"
import { displayTeam, optionsToObject } from "../functions/helpers.js"

export const editTeam = async ({interaction_id, token, options, dbClient}) => {
  let response = "No teams found"
  const {team, palmares, emoji, city, flag, shortname, name, logo} = Object.fromEntries(options.map(({name, value})=> [name, value]))
  const roles = [{id: team}]
  return await dbClient(async ({teams})=>{
    const team = (await teams.findOne({$or:roles})) || {}
    const payload = {
      shortName: shortname || team.shortName,
      name: name || team.name,
      description: palmares || team.description,
      emoji: emoji || team.emoji,
      city: city || team.city,
      flag: flag || team.flag,
      logo: logo || team.logo
    }
    teams.updateOne({id: team.id}, {$set: payload})
    const updatedTeam = await teams.findOne({id:team.id})
    response = displayTeam(updatedTeam)
    return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
      method: 'POST',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: response,
          flags: InteractionResponseFlags.EPHEMERAL
        }
      }
    })
  })
}

export const activateTeam = async ({interaction_id, token, application_id, options, dbClient}) => {
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: 1 << 6
      }
    }
  })
  const {team} = optionsToObject(options)
  const content = await dbClient(async ({teams})=>{
    const dbTeam = await teams.findOne({id: team})
    if(dbTeam.active) {
      return `<@&${team}> is already active.`
    } else {
      await teams.updateOne({id: team}, {$set: {active: true}})
      return `Activated <@&${team}>. Transfers are now available.`
    }
  })
  return await DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      content,
      flags: InteractionResponseFlags.EPHEMERAL
    }
  })
}


export const editTeamCmd =  {
  name: 'editteam',
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
  }]
}

export const activateTeamCmd = {
  name: 'activateteam',
  description: 'Activate a team',
  type: 1,
  options: [{
    type: 8,
    name: 'team',
    description: 'Team',
    required: true
  }]
}