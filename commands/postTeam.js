import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { displayTeam, optionsToObject, postMessage, updateResponse, waitingMsg } from "../functions/helpers.js"
import { getAllPlayers } from "../functions/playersCache.js"
import { getPlayersList } from "./player.js"
import { DiscordRequest } from "../utils.js"
import { serverChannels } from "../config/psafServerConfig.js"
import { getAllNationalities } from "../functions/allCache.js"

export const postTeam = async ({guild_id, interaction_id, token, application_id, options, channel_id, dbClient})=> {
  const {team} = optionsToObject(options)
  await waitingMsg({interaction_id, token})
  const allPlayers = await getAllPlayers(guild_id)
  const content = await dbClient(async ({teams, players, contracts})=>{
    const [dbTeam, allNations, teamContracts] = await Promise.all([
      teams.findOne({active:true, id: team}),
      getAllNationalities(),
      contracts.find({team}).toArray()
    ])
    const displayCountries = Object.fromEntries(allNations.map(({name, flag})=> ([name, flag])))
    let response = displayTeam(dbTeam, true) +'\r'
    response += await getPlayersList(allPlayers, team, displayCountries, players, teamContracts)
    await postMessage({channel_id, content:dbTeam.logo || 'No Logo'})
    return response
  })
  await postMessage({channel_id, content})
  return updateResponse({application_id, token, content: 'Done'})
}

export const postAllTeams = async ({guild_id, application_id, dbClient, interaction_id, token}) => {
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })
  const allPlayers = await getAllPlayers(guild_id)
  await dbClient(async ({teams, players, contracts})=>{
    const [dbTeams, allNations, allContracts] = await Promise.all([
      teams.find({active:true}, {sort: {id: 1}}).toArray(),
      getAllNationalities(),
      contracts.find({endedAt: null}).toArray()
    ])
    const displayCountries = Object.fromEntries(allNations.map(({name, flag})=> ([name, flag])))

    for await (const team of dbTeams) {
      const teamContracts = allContracts.filter((contract) => contract.team === team)
      let content = displayTeam(team, true) +'\r'
      content += await getPlayersList(allPlayers, team.id, displayCountries, players, teamContracts)
      if(!team.teamMsg) {
        const logoResp = await DiscordRequest(`/channels/${serverChannels.clubsChannelId}/messages`, {
          method: 'POST',
          body: {
            content: team.logo || 'No Logo',
          }
        })
        const teamResp = await DiscordRequest(`/channels/${serverChannels.clubsChannelId}/messages`, {
          method: 'POST',
          body: {
            content
          }
        })
        const [logoMsg, teamMsg] = await Promise.all([logoResp.json(), teamResp.json()])
        await teams.updateOne({id: team.id}, {$set: {logoMsg:logoMsg.id, teamMsg:teamMsg.id}})
      }
    }
  })
  return await DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      content: 'done',
      flags: 1 << 6
    }
  })
}

export const innerUpdateTeam = async ({guild_id, team, dbClient}) => {
  const allPlayers = await getAllPlayers(guild_id)
  
  return await dbClient(async ({teams, players, contracts})=>{
    const [dbTeam, allNations, teamContracts] = await Promise.all([
      teams.findOne({active:true, id: team}),
      getAllNationalities(),
      contracts.find({team, endedAt: null}).toArray()
    ])
    const displayCountries = Object.fromEntries(allNations.map(({name, flag})=> ([name, flag])))

    let content = displayTeam(dbTeam, true) +'\r'
    content += await getPlayersList(allPlayers, team, displayCountries, players, teamContracts)
    content += "\r___\r\r"
    if(dbTeam.teamMsg) {
      await DiscordRequest(`/channels/${serverChannels.clubsChannelId}/messages/${dbTeam.logoMsg}`, {
        method: 'PATCH',
        body: {
          content: dbTeam.logo || 'No Logo',
        }
      })
      await DiscordRequest(`/channels/${serverChannels.clubsChannelId}/messages/${dbTeam.teamMsg}`, {
        method: 'PATCH',
        body: {
          content: content.substring(0, 1999)
        }
      })
      try {
        const logoResp = await DiscordRequest(`/channels/${serverChannels.clubsChannelId}/messages/${dbTeam.logoMsg}`)
        const logo = await logoResp.json()
        console.log(logo)
        await teams.updateOne({active:true, id: team}, {$set: {refreshedLogo: logo.content}})
      } catch(e){
        console.log(`can't get the logo for ${dbTeam.name}`)
      }
    }
  })
}

export const updateTeamPost = async ({guild_id, interaction_id, token, application_id, options, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const {team} = optionsToObject(options)
  await innerUpdateTeam({guild_id, team, dbClient})
  return updateResponse({application_id, token, content: 'done'})
}

export const postTeamCmd = {
  name: 'postteam',
  description: 'Post team details',
  type: 1,
  options: [{
    type: 8,
    name: 'team',
    description: 'Team'
  }]
}
export const postAllTeamsCmd = {
  name: 'postallteams',
  description: 'Post all teams details',
  type: 1
}

export const updateTeamPostCmd = {
  name: 'updateteam',
  description: 'Update team details',
  type: 1,
  options: [{
    type: 8,
    name: 'team',
    description: 'Team'
  }]
}