import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { innerRemoveConfirmation, innerRemoveDeal } from "../confirm.js"
import { DiscordRequest } from "../../utils.js"
import { ObjectId } from "mongodb"
import { serverRoles } from "../../config/psafServerConfig.js"

export const removeConfirmation = async ({dbClient, interaction_id, token, message }) => {
  const content = await dbClient(async({confirmations, pendingDeals})=> {
    const confirmation = await confirmations.findOne({adminMessage: message.id})
    return innerRemoveConfirmation({reason: 'Denied by admin', ...confirmation, confirmations, pendingDeals})
  })
  
  return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content,
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })
}

export const removeDeal = async ({dbClient, message, interaction_id, token }) => {
  const content = dbClient(async({confirmations, pendingDeals}) => {
    const pendingDeal = await pendingDeals.findOne({adminMessage: message.id})
    return innerRemoveConfirmation({reason: 'Denied by admin', ...pendingDeal, dbClient, isDeal: true, pendingDeals, confirmations})
  })
  
  return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content,
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })
}

export const declineDealAction =  async ({member, application_id, interaction_id, token, dbClient, custom_id, callerId}) => {
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })
  if(!member.roles.includes(serverRoles.clubManagerRole)) {
    return DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
      method : 'PATCH',
      body: {
        content: "Only managers can approve deals",
        flags: InteractionResponseFlags.EPHEMERAL
      }
    })
  }
  const dealId = custom_id.substr("decline_deal_".length)
  const content = await dbClient(async ({pendingDeals}) => {
    const pendingDeal = await pendingDeals.findOne({...new ObjectId(dealId), approved: null})
    if(!pendingDeal) {
      return "Can't find the deal you're trying to approve."
    }
    if(!member.roles.includes(pendingDeal?.teamFrom)){
      return "Can't decline a deal for a team you're not a Manager of."
    }

    await innerRemoveDeal({reason: `Declined by <@${callerId}>`, ...pendingDeal})
    await pendingDeals.deleteOne({...new ObjectId(dealId)})
    return 'Deal declined'
  })
  return DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method : 'PATCH',
    body: {
      content,
      flags: InteractionResponseFlags.EPHEMERAL
    }
  })
}

export const approveDealAction = async ({member, application_id, interaction_id, token, dbClient, custom_id, callerId}) => {
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })
  if(!member.roles.includes(serverRoles.clubManagerRole)) {
    return DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
      method : 'PATCH',
      body: {
        content: "Only managers can approve deals",
        flags: InteractionResponseFlags.EPHEMERAL
      }
    })
  }
  const dealId = custom_id.substr("approve_deal_".length)
  const content = await dbClient(async ({pendingDeals}) => {
    const pendingDeal = await pendingDeals.findOne({...new ObjectId(dealId), approved: null})
    if(!pendingDeal) {
      return "Can't find the deal you're trying to approve."
    }
    if(!member.roles.includes(pendingDeal?.teamFrom)){
      return "Can't approve a deal for a team you're not a Manager of."
    }

    await innerRemoveDeal({reason: `Approved by <@${callerId}>`, ...pendingDeal, dbClient})
    await pendingDeals.updateOne({...new ObjectId(dealId)}, {$set: {approved: true}})
    return 'Deal approved'
  })
  return DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method : 'PATCH',
    body: {
      content,
      flags: InteractionResponseFlags.EPHEMERAL
    }
  })
}
