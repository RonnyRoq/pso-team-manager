import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { getPlayerNick, optionsToObject, quickResponse } from "../../functions/helpers.js"
import { DiscordRequest } from "../../utils.js"
import { serverChannels } from "../../config/psafServerConfig.js"

export const addSteamId = async ({dbClient, interaction_id, token, options}) => {
  const {player, steam} = optionsToObject(options)
  const content = await dbClient(async ({players})=> {
    const dbPlayer = await players.findOne({id: player})
    if(dbPlayer.steam) {
      return `<@${player}> is already known to have a profile as ${dbPlayer.steam}`
    }
    await players.updateOne({id: player}, {$set: {steam}})
    return `Saved ${steam} onto <@${player}>`
  })
  return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content
      }
    }
  })
}

export const addSteam = async ({dbClient, interaction_id, token, callerId, options}) => {
  const {steam} = optionsToObject(options)
  const content = await dbClient(async ({players})=> {
    const dbPlayer = await players.findOne({id: callerId})
    if(dbPlayer.steam) {
      return `<@${callerId}> is already known to have a profile as ${dbPlayer.steam}`
    }
    await players.updateOne({id: callerId}, {$set: {steam}})
    return `Saved ${steam} onto <@${callerId}>`
  })
  return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content
      }
    }
  })
}

export const setName = async ({dbClient, interaction_id, token, callerId, member, options}) => {
  const {ingamename} = optionsToObject(options)
  const content = await dbClient(async({players}) => {
    const dbPlayer = await players.findOne({id: callerId})
    await players.updateOne({id: callerId}, {$set: {ingamename}})
    return `Updated PSO Name ${dbPlayer.ingamename || getPlayerNick(member)} => ${ingamename} for <@${callerId}>`
  })
  DiscordRequest(`/channels/${serverChannels.nameChangesChannelId}/messages`,{
    method: 'POST',
    body: {
      content
    }
  })
  return quickResponse({interaction_id, token, content, isEphemeral: true})
}

export const addSteamIdCmd = {
  name: 'addsteamid',
  description: 'Add a steam Id for a player',
  type: 1,
  options: [{
    type: 6,
    name: 'player',
    description: 'Player',
    required: true,
  }, {
    type: 3,
    name: 'steam',
    description: 'Steam Account (full url)',
    required: true,
  }]
}

export const addSteamCmd = {
  name: 'addsteam',
  description: 'Add your steam Id',
  type: 1,
  options: [{
    type: 3,
    name: 'steam',
    description: 'Steam Account (full url)',
    required: true,
  }]
}

export const setNameCmd = {
  name: 'setname',
  description: 'Set your ingame name',
  type: 1,
  options: [{
    type: 3,
    name: 'ingamename',
    description: 'Your name as it appears in PSO',
    required: true,
  }]
}