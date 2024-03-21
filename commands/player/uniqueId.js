import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { optionsToObject } from "../../functions/helpers.js"
import { DiscordRequest } from "../../utils.js"


export const addUniqueId = async ({dbClient, interaction_id, token, callerId, options}) => {
  const {uniqueid} = optionsToObject(options)
  const content = await dbClient(async ({players})=> {
    const dbPlayer = await players.findOne({id: callerId})
    if(dbPlayer.uniqueId) {
      return `<@${callerId}> is already known to have a profile as ${dbPlayer.uniqueId}`
    }
    await players.updateOne({id: callerId}, {$set: {uniqueId:uniqueid}})
    return `Saved ${uniqueid} onto <@${callerId}>`
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
export const addUniqueIdCmd = {
  name: 'adduniqueid',
  description: 'Add your PSO Unique ID',
  type: 1,
  options: [{
    type: 3,
    name: 'uniqueid',
    description: 'PSO Unique ID',
    required: true,
  }]
}