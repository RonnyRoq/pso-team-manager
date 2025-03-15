import { DiscordRequest } from "../../utils.js"
import { isManager, optionsToObject, transferMarketStatus, updateResponse, waitingMsg } from "../../functions/helpers.js"
import { globalTransferBan, globalTransferBanMessage, globalTransferClosedMessage, serverChannels, serverRoles, transferBanStatus } from "../../config/psafServerConfig.js"
import { seasonPhases } from "../season.js"
import { TWO_WEEKS_MS } from "../../config/constants.js"

const preDealChecks = async({guild_id, player, member, contracts, teams, confirmations, config}) => {
  if(!member.roles.includes(serverRoles.clubManagerRole)) {
    return {message: 'This command is restricted to Club Managers'}
  }
  if(globalTransferBan) {
    return {message: globalTransferBanMessage}
  }
  const [marketStatus, discPlayerResp, destTeam, ongoingLoan, ongoingConfirmation] = await Promise.all([
    transferMarketStatus(config),
    DiscordRequest(`/guilds/${guild_id}/members/${player}`, {}),
    teams.findOne({active: true, $or: member.roles.map(id=>({id}))}),
    contracts.findOne({isLoan: true, endedAt: null, playerId: player}),
    confirmations.findOne({playerId: player})
  ])
  if(!marketStatus.active) {
    return globalTransferClosedMessage
  }
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
  
  if(isManager(discPlayer)) {
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
  
  const response = await dbClient(async ({teams, confirmations, contracts, pendingDeals, config})=> {
    const {message, sourceTeam, destTeam} = await preDealChecks({guild_id, player, member, contracts, teams, confirmations, config})
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
      expiresOn: Date.now()+TWO_WEEKS_MS,
      messageId: dealPost.id,
      adminMessage: adminPost.id
    })
    
    return 'Request posted'
  })
  return updateResponse({application_id, token, content:response})
}

const activePhase = (phase, season, phasesCount) => {
  return {
    phase: ((phase) % phasesCount),
    season: season + Math.floor((phase) / phasesCount)
  }
}

export const loan = async ({interaction_id, guild_id, application_id, token, member, options, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const {player, amount} = optionsToObject(options)
  if(!member.roles.includes(serverRoles.clubManagerRole)) {
    return updateResponse({application_id, token, content: 'This command is restricted to Club Managers'})
  }
  const message = await dbClient(async ({pendingLoans, teams, seasonsCollect, contracts, confirmations, config}) => {
    const {message, sourceTeam, destTeam} = await preDealChecks({guild_id, player, member, contracts, teams, confirmations, config})
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
        expiresOn: Date.now()+TWO_WEEKS_MS,
      }
    }, {upsert: true})
    const seasonObj = await seasonsCollect.findOne({endedAt: null})
    const currentSeasonPhase = seasonPhases.findIndex(({name})=> seasonObj.phase === name)
    let targetPhaseIndex = currentSeasonPhase
    let targetSeason = seasonObj.season
    const phasesCount = seasonPhases.length
    if(seasonObj.phaseStartedAt + (TWO_WEEKS_MS) < Date.now()) {
      console.log('increasing')
      targetSeason += Math.floor((targetPhaseIndex+1) / phasesCount)
      targetPhaseIndex = (targetPhaseIndex+1) % phasesCount
    }
    console.log('targetPhaseIndex', targetPhaseIndex)
    console.log('phasesCount', phasesCount)
    console.log(activePhase(targetPhaseIndex, targetSeason, phasesCount))
    const options = [activePhase(targetPhaseIndex+1, targetSeason, phasesCount), activePhase(targetPhaseIndex+2, targetSeason, phasesCount)]

    const content = `When would <@${player}>'s loan end?`
    const components = [{
      type: 1,
      components: options.map(option => ({
        type: 2,
        label: `Season ${option.season}, ${seasonPhases[option.phase].desc}`,
        style: 2,
        custom_id: `loan_${player}_${option.season}_${option.phase}`
      }))
    }]
    await updateResponse({application_id, token, content, components})
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