import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { DiscordRequest } from "../../utils.js"
import { optionsToObject, updateResponse, waitingMsg } from "../../functions/helpers.js"
import { globalTransferBan, globalTransferBanMessage, serverChannels, serverRoles, transferBanStatus } from "../../config/psafServerConfig.js"
import { seasonPhases } from "../season.js"


const twoWeeksMs = 1209600033

const preDealChecks = async({guild_id, player, member, contracts, teams, confirmations}) => {
  if(!member.roles.includes(serverRoles.clubManagerRole)) {
    return {message: 'This command is restricted to Club Managers'}
  }
  if(globalTransferBan) {
    return {message: globalTransferBanMessage}
  }
  const [discPlayerResp, destTeam, ongoingLoan, ongoingConfirmation] = await Promise.all([
    DiscordRequest(`/guilds/${guild_id}/members/${player}`, {}),
    teams.findOne({active: true, $or: member.roles.map(id=>({id}))}),
    contracts.findOne({isLoan: true, endedAt: null, playerId: player}),
    confirmations.findOne({playerId: player})
  ])
  if(destTeam.transferBan === transferBanStatus.transferBan) {
    return {message: `Your team <@&${destTeam.id}> is banned from doing transfers.`}
  }
  if(ongoingLoan) {
    return {message: `<@${player}> is on loan with <@&${ongoingLoan.team}>, you can't make a deal with this player.`}
  }
  if(ongoingConfirmation) {
    return {message: `<@${player}> is already confirming for <@&${ongoingConfirmation.team}>.`}
  }
  const discPlayer = await discPlayerResp.json()
  const sourceTeam = await teams.findOne({active: true, $or: discPlayer.roles.map((id)=>({id}))})
  if(sourceTeam.transferBan) {
    return {message: `You cannot recruit <@${player}> as <@&${sourceTeam.id}> is banned from doing transfers.`}
  }
  
  if(discPlayer.roles.includes(serverRoles.clubManagerRole)) {
    return {message:`Cannot recruit <@${player}> ; Club Manager of ${sourceTeam.name}.`}
  }
  if(sourceTeam.id === destTeam.id) {
    return {message:`You can't buy <@${player}, he's already in your team, ${destTeam.name}.`}
  }
  return {sourceTeam, destTeam}
}


export const deal = async ({dbClient, options, guild_id, interaction_id, token, application_id, channel_id, callerId, member})=> {
  await waitingMsg({interaction_id, token})
  const {player, amount, desc} = optionsToObject(options)
  
  const response = await dbClient(async ({teams, confirmations, contracts, pendingDeals})=> {
    const {message, sourceTeam, destTeam} = await preDealChecks({guild_id, player, member, contracts, teams, confirmations})
    if(message) {
      //If the checks returned a message, we stop here and return it.
      return message
    }
    const response = `<@${callerId}> requests a transfer <@${player}> from ${sourceTeam.emoji} ${sourceTeam.name} to ${destTeam.emoji} ${destTeam.name}\rFor <:EBit:1128310625873961013>**${new Intl.NumberFormat('en-US').format(amount)} Ebits**\r${desc?desc:''}`
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
              custom_id: "cancel_deal"
            }]
          }],
          content: response
        }
      })
    ])

    const [dealPost, adminPost] = await Promise.all([dealPostResp.json(), adminPostResp.json()])
    await pendingDeals.insertOne({
      playerId: player,
      teamFrom: sourceTeam.id,
      destTeam: destTeam.id,
      amount,
      expiresOn: Date.now()+twoWeeksMs,
      messageId: dealPost.id,
      adminMessage: adminPost.id
    })
    
    return 'Request posted'
  })
  return await DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      content: response,
      flags: InteractionResponseFlags.EPHEMERAL
    }
  })
}

const activePhase = (phase, phasesCount) => ((phase) % phasesCount)

export const loan = async ({interaction_id, guild_id, application_id, token, member, options, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const {player, amount} = optionsToObject(options)
  if(!member.roles.includes(serverRoles.clubManagerRole)) {
    return updateResponse({application_id, token, content: 'This command is restricted to Club Managers'})
  }
  const message = await dbClient(async ({pendingLoans, teams, seasonsCollect, contracts, confirmations}) => {
    const {message, sourceTeam, destTeam} = await preDealChecks({guild_id, player, member, contracts, teams, confirmations})
    if(message) {
      //If the checks returned a message, we stop here and return it.
      return message
    }
    await pendingLoans.updateOne({
      playerId: player,
      destTeam: destTeam.id
    },{
      $set:{
        playerId: player,
        teamFrom: sourceTeam.id,
        destTeam: destTeam.id,
        amount,
        expiresOn: Date.now()+twoWeeksMs,
      }
    }, {upsert: true})
    const seasonObj = await seasonsCollect.findOne({endedAt: null})
    const currentSeasonPhase = seasonPhases.findIndex(({name})=> seasonObj.phase === name)
    let currentPhaseIndex = currentSeasonPhase
    const phasesCount = seasonPhases.length
    if(seasonObj.phaseStartedAt + (twoWeeksMs) < Date.now()) {
      console.log('increasing')
      currentPhaseIndex = (currentPhaseIndex+1) % phasesCount
    }
    const options = [activePhase(currentPhaseIndex, phasesCount), activePhase(currentPhaseIndex+1, phasesCount)]

    const content = `When would <@${player}>'s loan end?`
    const components = [{
      type: 1,
      components: options.map(option => {
        let season = seasonObj.season
        if(option <= currentSeasonPhase) {
          season = seasonObj.season+1
        }
        return {
          type: 2,
          label: `Season ${season}, ${seasonPhases[option].desc}`,
          style: 2,
          custom_id: `loan_${player}_${option}`
        }
      })
    }]
    await DiscordRequest(`/webhooks/${application_id}/${token}`, {
      method: 'POST',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: InteractionResponseFlags.EPHEMERAL,
        content,
        components
      }
    })
  })
  if(message) {
    return updateResponse({application_id, token, content: message})
  }
}

export const dealCmd = {
  name: 'deal',
  description: 'Make a deal over a player',
  type: 1,
  options: [{
    type: 6,
    name: 'player',
    description: 'Player to transfer',
    required: true
  },{
    type: 4,
    name: 'amount',
    description: 'How much for the deal (enter 1000000 for 1M)',
    min_value: 0,
    required: true
  },{
    type: 3,
    name: 'desc',
    description: 'Any comments such as minimum amount of seasons'
  }]
}

export const loanCmd = {
  name: 'loan',
  description: 'Request a loan for a player',
  type: 1,
  options: [{
    type: 6,
    name: 'player',
    description: 'Player to loan',
    required: true
  },{
    type: 4,
    name: 'amount',
    description: 'How much for the deal (enter 1000000 for 1M)',
    min_value: 0,
    required: true
  }]
}