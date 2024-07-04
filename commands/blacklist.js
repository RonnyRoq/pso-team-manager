import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { DiscordRequest } from "../utils.js"
import { getAllPlayers } from "../functions/playersCache.js"
import { serverRoles } from "../config/psafServerConfig.js"
import { optionsToObject, waitingMsg } from "../functions/helpers.js"

export const blacklist = async ({interaction_id, token, dbClient, application_id, options}) => {
  await waitingMsg({interaction_id, token})
  const {player, until} = optionsToObject(options)
  const content = await dbClient(({blacklists})=> {

  })
}

export const showBlacklist = async ({interaction_id, token, guild_id, application_id, dbClient}) => {
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
  const allBlacklistedPlayers = allPlayers.filter(({roles})=> roles.includes(serverRoles.matchBlacklistRole))
  const blackListedEntries = await dbClient(async ({players})=> {
    const allDbPlayers = await players.find({desc: {$exists: true}}).toArray()
    return allBlacklistedPlayers.map(({user})=> `<@${user.id}> - ${allDbPlayers.find(({id})=> id === user.id)?.desc || ''}`)
  })
  let messages = []
  let currentMessage = '';

  for(const blackListedEntry of blackListedEntries) {
    if(currentMessage.length + blackListedEntry.length > 1800) {
      messages.push(currentMessage)
      currentMessage = ''
    }
    currentMessage += blackListedEntry+'\r'
  }
  messages.push(currentMessage)
  await DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      content: 'Blacklisted players:',
      flags: InteractionResponseFlags.EPHEMERAL,
    }
  })
  messages.forEach(async (content) => await DiscordRequest(`/webhooks/${application_id}/${token}`, {
    method: 'POST',
    body: {
      content: content || '--',
      flags: InteractionResponseFlags.EPHEMERAL,
    }
  }))
}

export const showBlacklistCmd = {
  name: 'showblacklist',
  description: 'Show the blacklisted players',
  type: 1
}