import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { optionsToObject } from "../../functions/helpers.js"
import { DiscordRequest } from "../../utils.js"

export const addSteamId = async ({dbClient, interaction_id, token, options}) => {
  const {player, steam} = optionsToObject(options)
  const content = await dbClient(async ({players})=> {
    const dbPlayer = await players.findOne({id: player})
    console.log(player, player)
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