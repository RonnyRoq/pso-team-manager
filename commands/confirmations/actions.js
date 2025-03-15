import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { innerRemoveConfirmation, innerRemoveDeal, innerRemoveRelease } from "../confirm.js"
import { DiscordRequest } from "../../utils.js"
import { serverChannels } from "../../config/psafServerConfig.js"
import { getPlayerNick, isManager, postMessage, silentResponse, updateResponse, waitingMsg } from "../../functions/helpers.js"
import { seasonPhases } from "../season.js"
import { TWO_WEEKS_MS } from "../../config/constants.js"
import { ObjectId } from "mongodb"

export const removeConfirmation = async ({dbClient, interaction_id, token, message }) => {
  const content = await dbClient(async({confirmations, pendingDeals, pendingLoans})=> {
    const confirmation = await confirmations.findOne({adminMessage: message.id})
    return innerRemoveConfirmation({reason: 'Denied by admin', ...confirmation, confirmations, pendingDeals, pendingLoans})
  })
  return silentResponse({interaction_id, token, content})
}

export const removeRelease = async ({dbClient, interaction_id, token, message }) => {
  const content = await dbClient(async({pendingReleases})=> {
    const release = await pendingReleases.findOne({adminMessage: message.id})
    return innerRemoveRelease({reason: 'Denied by admin', ...release, pendingReleases})
  })
  return silentResponse({interaction_id, token, content})
}

export const removeDeal = async ({dbClient, message, interaction_id, token }) => {
  const content = await dbClient(async({confirmations, pendingDeals, pendingLoans}) => {
    const pendingDeal = await pendingDeals.findOne({adminMessage: message.id})
    return innerRemoveConfirmation({reason: 'Denied by admin', ...pendingDeal, dbClient, isDeal: true, pendingDeals, pendingLoans, confirmations})
  })
  return silentResponse({interaction_id, token, content})
}
export const removeLoan = async ({dbClient, message, interaction_id, token }) => {
  const content = await dbClient(async({confirmations, pendingDeals, pendingLoans}) => {
    const pendingDeal = await pendingLoans.findOne({adminMessage: message.id})
    return innerRemoveConfirmation({reason: 'Denied by admin', ...pendingDeal, dbClient, isDeal: true, pendingDeals, pendingLoans, confirmations})
  })
  return silentResponse({interaction_id, token, content})
}

export const declineDealAction =  async ({member, application_id, interaction_id, token, dbClient, custom_id, callerId}) => {
  await waitingMsg({interaction_id, token})
  if(!isManager(member)) {
    return updateResponse({application_id, token, content:"Only managers can approve deals"})
  }
  const dealId = custom_id.substr("decline_deal_".length)
  const _id = new ObjectId(dealId)
  const content = await dbClient(async ({pendingDeals}) => {
    const pendingDeal = await pendingDeals.findOne({_id, approved: null})
    if(!pendingDeal) {
      return "Can't find the deal you're trying to decline."
    }
    if(!member.roles.includes(pendingDeal?.teamFrom)){
      console.log(`${getPlayerNick(member)} tries to decline transfer of ${pendingDeal.playerId} but ${member.roles} doesnt include ${pendingDeal.teamFrom}`)
      return "Can't decline a deal for a team you're not a Manager of."
    }

    await innerRemoveDeal({reason: `Declined by <@${callerId}>`, ...pendingDeal})
    await pendingDeals.deleteOne({_id})
    return 'Deal declined'
  })
  return updateResponse({application_id, token, content})
}

export const declineLoanAction =  async ({member, application_id, interaction_id, token, dbClient, custom_id, callerId}) => {
  await waitingMsg({interaction_id, token})
  if(!isManager(member)) {
    return updateResponse({application_id, token, content: "Only managers can approve deals"})
  }
  const loanId = custom_id.substr("decline_loan_".length)
  const _id = new ObjectId(loanId)
  const content = await dbClient(async ({pendingLoans}) => {
    const pendingDeal = await pendingLoans.findOne({_id, approved: null})
    if(!pendingDeal) {
      return "Can't find the loan you're trying to decline."
    }
    if(!member.roles.includes(pendingDeal?.teamFrom)){
      console.log(`${getPlayerNick(member)} tries to decline loan of ${pendingDeal.playerId} but ${member.roles} doesnt include ${pendingDeal.teamFrom}`)
      return "Can't decline a loan for a team you're not a Manager of."
    }

    await innerRemoveDeal({reason: `Declined by <@${callerId}>`, ...pendingDeal})
    await pendingLoans.deleteOne({_id})
    return 'Loan declined'
  })
  return updateResponse({application_id, token, content})
}

export const approveDealAction = async ({member, application_id, interaction_id, token, dbClient, custom_id, guild_id, callerId}) => {
  await waitingMsg({interaction_id, token})
  console.log(guild_id)
  if(!isManager(member)) {
    return DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
      method : 'PATCH',
      body: {
        content: "Only managers can approve deals",
        flags: InteractionResponseFlags.EPHEMERAL
      }
    })
  }
  const dealId = custom_id.substr("approve_deal_".length)
  const _id = new ObjectId(dealId)
  const content = await dbClient(async ({pendingDeals, teams}) => {
    const pendingDeal = await pendingDeals.findOne({_id, approved: null})
    if(!pendingDeal) {
      return "Can't find the deal you're trying to approve."
    }
    
    if(!member.roles.includes(pendingDeal?.teamFrom)){
      console.log(`${getPlayerNick(member)} tries to approve transfer of ${pendingDeal.playerId} but ${member.roles} doesnt include ${pendingDeal.teamFrom}`)
      return "Can't approve a deal for a team you're not a Manager of."
    }

    await innerRemoveDeal({reason: `Approved by <@${callerId}>`, ...pendingDeal, dbClient})
    await pendingDeals.updateOne({_id}, {$set: {approved: true}})
    const team = await teams.findOne({id: pendingDeal.destTeam})
    try{
      const userChannelResp = await DiscordRequest('/users/@me/channels', {
        method: 'POST',
        body:{
          recipient_id: pendingDeal.playerId
        }
      })
      const userChannel = await userChannelResp.json()
      console.log(`Your manager has accepted a transfer offer from ${team?.name} (Message: https://discord.com/channels/${process.env.GUILD_ID}/${serverChannels.dealsChannelId}/${pendingDeal.messageId}). Head to https://discord.com/channels/${process.env.GUILD_ID}/${serverChannels.confirmationChannelId} to finalise the transfer with /confirm.`)
      await postMessage({channel_id: userChannel.id, content: `Your manager has accepted a transfer offer from ${team?.name} (Message: https://discord.com/channels/${process.env.GUILD_ID}/${serverChannels.dealsChannelId}/${pendingDeal.messageId}). Head to https://discord.com/channels/${process.env.GUILD_ID}/${serverChannels.confirmationChannelId} to finalise the transfer with /confirm.`})
    } catch (e) {
      console.log(e.message)
    }
    return 'Deal approved'
  })
  return updateResponse({application_id, token, content})
}


export const approveLoanAction = async ({member, application_id, interaction_id, token, dbClient, custom_id, callerId}) => {
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })
  if(!isManager(member)) {
    return DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
      method : 'PATCH',
      body: {
        content: "Only managers can approve deals",
        flags: InteractionResponseFlags.EPHEMERAL
      }
    })
  }
  const loanId = custom_id.substr("approve_loan_".length)
  const _id = new ObjectId(loanId)
  const content = await dbClient(async ({pendingLoans}) => {
    const pendingDeal = await pendingLoans.findOne({_id, approved: null})
    if(!pendingDeal) {
      return "Can't find the loan you're trying to approve."
    }
    
    if(!member.roles.includes(pendingDeal?.teamFrom)){
      console.log(`${getPlayerNick(member)} tries to approve loan of ${pendingDeal.playerId} but ${member.roles} doesnt include ${pendingDeal.teamFrom}`)
      return "Can't approve a loan for a team you're not a Manager of."
    }

    await innerRemoveDeal({reason: `Approved by <@${callerId}>`, ...pendingDeal, dbClient})
    await pendingLoans.updateOne({_id}, {$set: {approved: true}})
    return 'Loan approved'
  })
  return DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method : 'PATCH',
    body: {
      content,
      flags: InteractionResponseFlags.EPHEMERAL
    }
  })
}

export const finishLoanRequest = async ({member, channel_id, application_id, interaction_id, token, dbClient, custom_id, callerId}) => {
  await waitingMsg({interaction_id, token})
  const [, player, season, phase] = custom_id.split('_')
  await dbClient(async ({pendingLoans, teams, seasonsCollect})=> {
    const pendingLoansPlayer = await pendingLoans.find({playerId: player, approved: null}).toArray()
    const seasonObj = await seasonsCollect.findOne({endedAt: null})
    const team = await teams.findOne({active:true, id: {$in: member.roles}})
    const pendingLoan = pendingLoansPlayer.find(loan => loan.destTeam === team.id)
    let currentPhaseIndex = seasonPhases.findIndex(({name})=> seasonObj.phase === name)
    const phasesCount = seasonPhases.length
    if(seasonObj.phaseStartedAt + (TWO_WEEKS_MS/2) < Date.now()) {
      currentPhaseIndex = (currentPhaseIndex+1) % phasesCount
    }
    const targetSeason = season ? season : ((phase <= currentPhaseIndex) ? seasonObj.season+1 : seasonObj.season)
    await pendingLoans.updateOne({_id: pendingLoan._id}, {$set: {until: targetSeason, phase}})
    const loanRequest = {
      ...pendingLoan,
      until: targetSeason,
      phase
    }
    const sourceTeam = await teams.findOne({id: loanRequest.teamFrom})
    const destTeam = await teams.findOne({id: loanRequest.destTeam})
    const response = `<@${callerId}> requests a loan of <@${player}> from ${sourceTeam.emoji} ${sourceTeam.name} to ${destTeam.emoji} ${destTeam.name}`+
    `\rLoan would end on: Season ${loanRequest.until}, beginning of ${seasonPhases[loanRequest.phase].desc}`+
    `\rFor <:EBit:1128310625873961013>**${new Intl.NumberFormat('en-US').format(loanRequest.amount)} Ebits**`
    const [dealPostResp, adminPostResp] = await Promise.all([
      DiscordRequest(`/channels/${channel_id}/messages`, {
        method: 'POST',
        body: {
          content: response
        }
      }),
      DiscordRequest(`/channels/${serverChannels.confirmationTransferChannel}/messages`, {
        method: 'POST',
        body: {
          components: [{
            type: 1,
            components: [{
              type: 2,
              label: "Cancel",
              style: 4,
              custom_id: "cancel_loan"
            }]
          }],
          content: response
        }
      })
    ])
    const [dealPost, adminPost] = await Promise.all([dealPostResp.json(), adminPostResp.json()])
    await pendingLoans.updateOne({_id: pendingLoan._id}, {$set:{
      messageId: dealPost.id,
      adminMessage: adminPost.id
    }})
  })
  await updateResponse({application_id, token, content: 'Loan offer sent'})
}
