
import {
  InteractionResponseType,
} from 'discord-interactions';
import { msToTimestamp } from "../functions/helpers.js"
import { DiscordRequest } from "../utils.js"

export const now = ({interaction_id, token}) => {
  const timestamp = msToTimestamp(Date.now())
  return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `<t:${timestamp}:F> < t:${timestamp}:F >`,
        flags: 1 << 6
      }
    }
  })
}

export const nowCmd = {
  name: 'now',
  description: 'Gives the current time as a timestamp',
  type: 1
}
