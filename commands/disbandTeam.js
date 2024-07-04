import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { getPlayerNick, optionsToObject, removePlayerPrefix, sleep } from "../functions/helpers.js"
import { DiscordRequest } from "../utils.js"
import { serverRoles, serverChannels } from "../config/psafServerConfig.js"
import { getAllPlayers } from "../functions/playersCache.js"

const logWebhook = process.env.WEBHOOK

export const disbandTeam = async ({interaction_id, token, options}) => {
  const {team} = optionsToObject(options)
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `Are you sure you want to disband <@&${team}> ? This cannot be undone. (dismiss this message if you don't want to do this)`,
        components: [{
          type: 1,
          components: [{
            type: 2,
            label: `Confirm - remove blacklist`,
            style: 4,
            custom_id: `confirm_delete_${team}`
          },{
            type: 2,
            label: `Confirm - keep players blacklisted`,
            style: 4,
            custom_id: `confirm_delete_${team}_keepblacklist`
          }]
        }],
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })
}

export const disbandTeamConfirmed = async ({interaction_id, custom_id, guild_id, token, member, callerId, dbClient}) => {
  if(!member.roles.find(role => role === serverRoles.presidentRole)) {
    return await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
      method: 'POST',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `Only Presidents can disband`,
          flags: InteractionResponseFlags.EPHEMERAL
        }
      }
    })
  }
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })
  let id = custom_id.substr("confirm_delete_".length)
  let keepBlacklist = false
  if(id.includes('_keepblacklist')) {
    keepBlacklist = true
    id = id.substr(0, id.length-'_keepblacklist'.length)
  }
  const totalPlayers = await getAllPlayers(guild_id)
  const disbandedTeam = await dbClient(async ({contracts, teams})=>{
    const teamToDisband = await teams.findOne({id})
    await teams.updateOne({id}, {$set: {active: false, logoMsg: null, teamMsg: null}})
    await contracts.updateMany({team: id, endedAt: null}, {$set: {endedAt: Date.now()}})
    return teamToDisband
  })
  if(disbandTeam.logoMsg) {
    await DiscordRequest(`channels/${serverChannels.clubsChannelId}/messages/${disbandTeam.logoMsg}/`, {method: 'DELETE'})
  }
  if(disbandTeam.clubMsg) {
    await DiscordRequest(`channels/${serverChannels.clubsChannelId}/messages/${disbandTeam.clubMsg}/`, {method: 'DELETE'})
  }
  const teamPlayers = totalPlayers.filter((player) => player.roles.includes(id))
  const rolesToFilter = keepBlacklist ?
    [id, serverRoles.clubManagerRole, serverRoles.clubPlayerRole] 
    : [id, serverRoles.clubManagerRole, serverRoles.clubPlayerRole, serverRoles.matchBlacklistRole]
  await teamPlayers.forEach(async discPlayer => {
    const playerName = getPlayerNick(discPlayer)
    let updatedPlayerName = removePlayerPrefix(disbandedTeam.shortName, playerName)
    const payload= {
      nick: updatedPlayerName,
      roles: discPlayer.roles.filter(playerRole=> !rolesToFilter.includes(playerRole))
    }
    await DiscordRequest(`guilds/${guild_id}/members/${discPlayer.user.id}`, {
      method: 'PATCH',
      body: payload
    })
    await sleep(500)
  })
  const log = [
    `# <@&${id}> has been disbanded.\rThe following players are now free agents:`,
    ...teamPlayers.map(discPlayer => `<@${discPlayer.user.id}>`),
    `*from <@${callerId}>*`
  ]

  await DiscordRequest(logWebhook, {
    method: 'POST',
    body: {
      content: log.join('\r')
    }
  })
}

export const disbandTeamCmd = {
  name: 'disbandteam',
  description: 'Disband a team',
  type: 1,
  options: [{
    type: 8,
    name: 'team',
    description: 'Team',
    required: true,
  }]
}