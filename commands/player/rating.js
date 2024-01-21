import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { getPlayerNick, optionsToObject, updatePlayerRating } from "../../functions/helpers.js"
import { DiscordRequest } from "../../utils.js"
import { serverChannels } from "../../config/psafServerConfig.js"

const getRatingUpdateMessage = (playerId, oldRating, newRating) => {
  const numNewRating = parseInt(newRating)
  if(!oldRating) {
    return `> 🆕 **- NEW RATING** : <@${playerId}>\r> # ? ➡️ ${numNewRating}`
  }
  const numOldRating = parseInt(oldRating.match(/\d+/)[0])
  if(numOldRating < numNewRating) {
    return `> 🟢 **- UPGRADE:** <@${playerId}>\r> # ${numOldRating} ➡️ ${numNewRating}`
  } else {
    return `> 🔴 **- DOWNGRADE:** <@${playerId}>\r> # ${numOldRating} ➡️ ${numNewRating}`
  }
}

export const setRating = async ({dbClient, interaction_id, guild_id, token, options}) => {
  const {player, rating} = optionsToObject(options)
  const content = await dbClient(async ({players})=> {
    const [discPlayerResp] = await Promise.all([
        DiscordRequest(`/guilds/${guild_id}/members/${player}`, { method: 'GET' }),
        players.updateOne({id: player}, {$set: {rating}}),
      ])
    const discPlayer = await discPlayerResp.json()
    console.log(discPlayer)
    const {name, previousRating} = updatePlayerRating(getPlayerNick(discPlayer), rating)
    console.log(name, previousRating)
    await DiscordRequest(`/channels/${serverChannels.ratingsChannelId}/messages`, {
      method: 'POST',
      body: {
        content: getRatingUpdateMessage(player, previousRating, rating)
      }
    })
    await DiscordRequest(`guilds/${guild_id}/members/${player}`, {
      method: 'PATCH',
      body: {
        nick: name
      }
    })
    return `<@${player}> is now ${rating}`
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

export const setRatingCmd = {
  name: 'setrating',
  description: 'Manually set a player\'s rating',
  type: 1,
  options: [{
    type: 6,
    name: 'player',
    description: 'Player',
    required: true,
  }, {
    type: 4,
    name: 'rating',
    description: 'Player\'s rating',
    min_value: 0,
    max_value: 99,
    required: true,
  }]
}