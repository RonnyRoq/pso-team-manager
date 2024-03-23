import { serverChannels } from "../../config/psafServerConfig.js"
import { optionsToObject, quickResponse } from "../../functions/helpers.js"
import { DiscordRequest } from "../../utils.js"

const setTransferBan = async ({interaction_id, token, options, callerId, dbClient, banned}) => {
  const {team} = optionsToObject(options)
  const content = await dbClient(async ({teams})=> {
    const dbTeam = await teams.findOne({id: team})
    if(!dbTeam) {
      return `<@&${team}> not found for transfer ban.`
    }
    await teams.updateOne({id: team}, {$set: {transferBan: true}})
    return `<@&${team}> transfers are now ${banned ? 'banned' : 'available'}. (from <@${callerId}>)`
  })
  await DiscordRequest(`/channels/${serverChannels.logsChannelId}/messages`,{
    method: 'POST',
    body: {
      content
    }
  })
  return quickResponse({interaction_id, token, content, isEphemeral:true})
}

export const addTransferBan = async ({interaction_id, token, options, callerId, dbClient}) => {
  return setTransferBan({interaction_id, token, options, callerId, dbClient, banned: true})
}

export const removeTransferBan = async ({interaction_id, token, options, callerId, dbClient}) => {
  return setTransferBan({interaction_id, token, options, callerId, dbClient, banned: false})
}

export const addTransferBanCmd = {
  name: 'addtransferban',
  description: 'Ban a team from doing transfers',
  type: 1,
  options: [{
    type: 8,
    name: 'team',
    description: 'Team'
  }]
}

export const removeTransferBanCmd = {
  ...addTransferBanCmd,
  name:'removetransferban',
  description: 'Allow a team to do transfers again'
}