import { DiscordRequest } from "../utils.js"
import { msToTimestamp, getPlayerNick, sleep, waitingMsg, optionsToObject, updateResponse, quickResponse, transferMarketStatus, isManager } from "../functions/helpers.js"
import { globalTransferBan, globalTransferBanMessage, globalTransferClosedMessage, serverChannels, serverRoles, transferBanStatus } from "../config/psafServerConfig.js"
import { seasonPhases } from "./season.js"
import { getAllNationalities } from "../functions/allCache.js"
import { TWO_WEEKS_MS } from "../config/constants.js"

const getConfirmTransferComponents = ({isValidated, isActive}={}) => ({
  components: [{
    type: 1,
    components: [{
      type: 2,
      label: "Confirm",
      style: 3,
      custom_id: "confirm_transfer",
      disabled: !isValidated
    },{
      type: 2,
      label: "Cancel",
      style: 4,
      custom_id: "cancel_transfer",
      disabled: !isActive
    }]
  }]
})
const getReleaseComponents = ({isValidated, isActive}={}) => ({
  components: [{
    type: 1,
    components: [{
      type: 2,
      label: "Confirm",
      style: 3,
      custom_id: "confirm_release",
      disabled: !isValidated
    },{
      type: 2,
      label: "Cancel",
      style: 4,
      custom_id: "cancel_release",
      disabled: !isActive
    }]
  }]
})

const getDealComponents = ({isActive}={}) => ({
  components: [{
    type: 1,
    components: [{
      type: 2,
      label: "Cancel",
      style: 4,
      custom_id: "cancel_transfer",
      disabled: !isActive
    }]
  }]
})

const confirm = async ({member, callerId, interaction_id, application_id, guild_id, channel_id, token, options, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const {team, seasons} = optionsToObject(options)
  
  if(globalTransferBan) {
    return updateResponse({application_id, token, content: globalTransferBanMessage})
  }
  
  const response = await dbClient(async ({teams, players, confirmations, pendingDeals, pendingLoans, config})=> {
    const [marketStatus, allTeams, dbPlayer, allCountries, previousConfirmation, pendingDeal, pendingLoan] = await Promise.all([
      transferMarketStatus(config),
      teams.find({active: true}).toArray(),
      players.findOne({id: callerId}),
      getAllNationalities(),
      confirmations.findOne({playerId: callerId}),
      pendingDeals.findOne({playerId: callerId, destTeam: team, approved: true}),
      pendingLoans.findOne({playerId: callerId, destTeam: team, approved: true})
    ])
    if(!marketStatus.active) {
      return globalTransferClosedMessage
    }
    const currentTeam = allTeams.find(({id}) => member.roles.includes(id))
    const teamToJoin = allTeams.find(({id})=> id === team)
    const deal = pendingDeal || pendingLoan
    /*if(seasons < 2) {
      return 'Season ending soon, you can only confirm for 2 seasons (end of this season and the one after).'
    }*/
    if(currentTeam) {
      if(currentTeam.transferBan) { 
        return `Your team <@&${currentTeam.id}> is banned from doing exit transfers, you cannot leave it.`
      }
      if(!deal) {
        console.log(`${getPlayerNick(member)} tried to confirm for ${teamToJoin?.name} but no deal`)
        return 'You can only confirm a transfer to teams your club has a deal with.'
      }
      if(deal.destTeam !== team) {
        return `You can only confirm for <@&${deal.destTeam}> as your club has agreed a deal with them.`
      }
    }
    if(member.roles.includes(serverRoles.matchBlacklistRole) || member.roles.includes(serverRoles.permanentlyBanned)) {
      return 'Can\'t join a team while blacklisted.'
    }
    if(!member.roles.includes(serverRoles.verifiedRole)){
      return 'Please verify before confirming.'
    }
    if(member.roles.includes(serverRoles.presidentRole)) {
      return 'As a PRESIDENT, YOU ARE TOO POWERFUL TO CHANGE CLUBS :\'D'
    }
    if(!teamToJoin) {
      return 'Please select an active team.'
    }
    if(teamToJoin.transferBan === transferBanStatus.transferBan) {
      return `<@&${teamToJoin.id}> is banned from doing transfers, you cannot join it.`
    }
    if(previousConfirmation) {
      return `You already sent a confirmation to <@&${previousConfirmation.team}>, confirmation will expire after two weeks on <t:${msToTimestamp(previousConfirmation.expiresOn)}:F>`
    }
    if(!dbPlayer?.nat1) {
      return 'First time player, please use /register and select a nationality'
    }

    const nat1 = dbPlayer?.nat1
    const nat2 = dbPlayer?.nat2
    const nat3 = dbPlayer?.nat3
    const updatedPlayer = {
      nick: getPlayerNick(member),
    }
    await players.updateOne({id: callerId}, {$set: updatedPlayer}, {upsert: true})
    const {flag: flag1 =''} = allCountries.find(({name})=> name === nat1) || {}
    const {flag: flag2 =''} = allCountries.find(({name})=> name === nat2) || {}
    const {flag: flag3 = ''} = allCountries.find(({name})=> name === nat3) || {}
    
    const response = pendingLoan ? 
    `${flag1}${flag2}${flag3}<@${callerId}> requests to join ${teamToJoin.name} on a loan until Season ${pendingLoan.until}, Beginning of ${seasonPhases[pendingLoan.phase]?.desc}`
    : `${flag1}${flag2}${flag3}<@${callerId}> requests to join ${teamToJoin.name} for ${seasons} season${seasons=== 1 ? '' :'s'}`

    const [postResponse, adminResponse] = await Promise.all([
      DiscordRequest(`/channels/${channel_id}/messages`, {
        method: 'POST',
        body: {
          content: response
        }
      }),
      DiscordRequest(`/channels/${serverChannels.confirmationTransferChannel}/messages`, {
        method: 'POST',
        body: {
          ...getConfirmTransferComponents({isActive:true, isValidated: true}),
          content: `${member.roles.includes(serverRoles.suspisciousRole)? ':warning':''}${flag1}${flag2}${flag3}<@${callerId}> requests to join <@&${team}> ${pendingLoan ? `on a loan until Season ${pendingLoan.until}, Beginning of ${seasonPhases[pendingLoan.phase]?.desc}`: `for ${seasons} season${seasons=== 1 ? '' :'s'}`}${deal ? 
            `\r${pendingLoan ? 'LOAN' : 'TRANSFER'}: <@&${deal.teamFrom}> -> <@&${deal.destTeam}> <:EBit:1128310625873961013>**${new Intl.NumberFormat('en-US').format(deal.amount)} Ebits**\rDeal link: https://discord.com/channels/${guild_id}/${serverChannels.confirmationTransferChannel}/${deal.adminMessage}`:''}`,
        }
      })
    ])
    const [message, adminMessage] = await Promise.all([postResponse.json(), adminResponse.json()])
    
    await confirmations.insertOne({
      playerId: callerId,
      playerName: getPlayerNick(member),
      team,
      teamName: teamToJoin.name,
      seasons,
      expiresOn: Date.now()+TWO_WEEKS_MS,
      messageId: message.id,
      adminMessage: adminMessage.id
    })
    return 'Request posted'
  })


  return updateResponse({application_id, token, content: response})
}

export const releasePlayer = async ({member, callerId, interaction_id, application_id, channel_id, guild_id, token, options, dbClient}) => {
  const {team, player, reason} = optionsToObject(options)
  if(!isManager(member)) {
    return quickResponse({interaction_id, token, content: 'This command is restricted to Club Managers', isEphemeral: true})
  }
  if(!member.roles.includes(team)) {
    return quickResponse({interaction_id, token, content: 'You can only release your own players :) Select the correct team', isEphemeral: true})
  }
  await waitingMsg({interaction_id, token})
  const playerResp = await DiscordRequest(`/guilds/${guild_id}/members/${player}`, { method: 'GET' })
  const discPlayer = await playerResp.json()

  const response = await dbClient(async ({teams, pendingReleases, contracts})=> {
    const [dbTeam, pendingRelease, activeLoanContract] = await Promise.all([
      teams.findOne({active: true, id: team}),
      pendingReleases.findOne({playerId: player, team}),
      contracts.findOne({playerId: player, endedAt: null, isLoan: true})
    ])
    if(!dbTeam) {
      return `Can't find the team <@&${team}> you're trying to release <@${player}> from.`
    }
    if(!discPlayer.roles.includes(team)) {
      return `<@${player}> doesn't play in <@&${team}>.`
    }
    if(dbTeam.transferBan) {
      return `You cannot release players as <@&${dbTeam.id}> is transfer banned.`
    }
    if(activeLoanContract) {
      return `<@${player}> is on loan, you can't release him.`
    }
    if(isManager(discPlayer)) {
      return `<@${player}> is a Club Manager, please open a ticket if you're trying to release him.`
    }
    if(discPlayer.roles.includes(serverRoles.presidentRole)) {
      return `<@${player}> is a PRESIDENT, he's too powerful to be released :'D`
    }
    if(pendingRelease) {
      return `You already requested for <@${player}> to be released.`
    }
    if(discPlayer.roles.includes(serverRoles.matchBlacklistRole) || discPlayer.roles.includes(serverRoles.permanentlyBanned)) {
      return 'Can\'t release a blacklisted player.'
    }
    
    const response = `<@${callerId}> wants to release <@${player}> from <@&${team}>`
    const [postResponse, adminResponse] = await Promise.all([
      DiscordRequest(`/channels/${channel_id}/messages`, {
        method: 'POST',
        body: {
          content: response
        }
      }),
      DiscordRequest(`/channels/${serverChannels.confirmationTransferChannel}/messages`, {
        method: 'POST',
        body: {
          ...getReleaseComponents({isActive:true, isValidated: true}),
          content: response + `\rReason: ${reason}`
        }
      })
    ])
    const [message, adminMessage] = await Promise.all([postResponse.json(), adminResponse.json()])
    
    await pendingReleases.insertOne({
      playerId: player,
      playerName: getPlayerNick(discPlayer),
      team,
      teamName: dbTeam.name,
      expiresOn: Date.now()+TWO_WEEKS_MS,
      messageId: message.id,
      adminMessage: adminMessage.id
    })
    return 'Request posted'
  })

  return updateResponse({application_id, token, content: response})
}

export const innerRemoveRelease =  async ({reason, messageId, adminMessage, playerId, pendingReleases}) => {
  const channelId = serverChannels.confirmationChannelId
  const [baseMessageResp, adminMessageResp] = await Promise.all([
    DiscordRequest(`/channels/${channelId}/messages/${messageId}`, {method: 'GET'}),
    DiscordRequest(`/channels/${serverChannels.confirmationTransferChannel}/messages/${adminMessage}`, {method: 'GET'})
  ])
  const [baseMessage, confAdmin] = await Promise.all([baseMessageResp.json(), adminMessageResp.json()])
  
  await Promise.all([
    pendingReleases.deleteMany({playerId}),
    DiscordRequest(`/channels/${channelId}/messages/${messageId}`, {
      method: 'PATCH',
      body: {
        content: baseMessage.content + `\r${reason}`
      }
    }),
    DiscordRequest(`/channels/${serverChannels.confirmationTransferChannel}/messages/${adminMessage}`, {
      method: 'PATCH',
      body: {
        ...getReleaseComponents({isActive:false}),
        content: confAdmin.content +`\r${reason}`,
      }
    })
  ]);
  return 'Done.'
}

export const innerRemoveConfirmation = async ({reason, messageId, adminMessage, playerId, pendingDeals, pendingLoans, confirmations, isDeal}) => {
  const channelId = isDeal ? serverChannels.dealsChannelId : serverChannels.confirmationChannelId
  console.log(`isDeal? ${isDeal}`)
  console.log(channelId, messageId)
  console.log(serverChannels.confirmationTransferChannel, adminMessage)
  const [baseMessageResp, adminMessageResp] = await Promise.all([
    DiscordRequest(`/channels/${channelId}/messages/${messageId}`, {method: 'GET'}),
    DiscordRequest(`/channels/${serverChannels.confirmationTransferChannel}/messages/${adminMessage}`, {method: 'GET'})
  ])
  const [baseMessage, confAdmin] = await Promise.all([baseMessageResp.json(), adminMessageResp.json()])
  
  await Promise.all([
    confirmations.deleteMany({playerId}),
    pendingDeals.deleteMany({playerId}),
    pendingLoans.deleteMany({playerId}),
    DiscordRequest(`/channels/${channelId}/messages/${messageId}`, {
      method: 'PATCH',
      body: {
        content: baseMessage.content + `\r${reason}`
      }
    }),
    DiscordRequest(`/channels/${serverChannels.confirmationTransferChannel}/messages/${adminMessage}`, {
      method: 'PATCH',
      body: {
        ...isDeal ? getConfirmTransferComponents({isValidated: false, isActive: false}) : getDealComponents({isActive:false}),
        content: confAdmin.content +`\r${reason}`,
      }
    })
  ]);
  return 'Done.'
}

export const innerRemoveDeal = async ({reason, messageId, adminMessage}) => {
  const [baseMessageResp, adminMessageResp] = await Promise.all([
    DiscordRequest(`/channels/${serverChannels.dealsChannelId}/messages/${messageId}`, {method: 'GET'}),
    DiscordRequest(`/channels/${serverChannels.confirmationTransferChannel}/messages/${adminMessage}`, {method: 'GET'})
  ])
  const [baseMessage, confAdmin] = await Promise.all([baseMessageResp.json(), adminMessageResp.json()])
  try{
    await Promise.all([
      DiscordRequest(`/channels/${serverChannels.dealsChannelId}/messages/${messageId}`, {
        method: 'PATCH',
        body: {
          content: baseMessage.content + `\r${reason}`
        }
      }),
      DiscordRequest(`/channels/${serverChannels.confirmationTransferChannel}/messages/${adminMessage}`, {
        method: 'PATCH',
        body: {
          ...getDealComponents({isActive: false}),
          content: confAdmin.content +`\r${reason}`,
        }
      })
    ]);
  } catch (e) {
    console.log(e)
  }
}

export const checkConfirmations = async({dbClient}) => {
  await dbClient(async ({confirmations, pendingDeals})=> {
    const [allConfirmations, allPendingDeals, pendingLoans] = await Promise.all([
      confirmations.find({validated: null}).toArray(),
      pendingDeals.find({approved: null}).toArray()
    ])
    for (const pendingDeal of allPendingDeals) {
      const {expiresOn} = pendingDeal
      if(expiresOn < Date.now()) {
        await innerRemoveDeal({reason: "Expired", ...pendingDeal, dbClient})
      }
    }
    for (const confirmation of allConfirmations) {
      const {playerId, team, seasons, adminMessage, expiresOn} = confirmation
      if(expiresOn < Date.now()) {
        await innerRemoveConfirmation({reason: "Expired", ...confirmation, pendingDeals, pendingLoans, confirmations})
      } else {
        const approvedDeal = await pendingDeals.findOne({playerId, approved: true})
        if(approvedDeal) {
          const body = {
            content: `<@${playerId}> requests to join <@&${team}> for ${seasons} season${seasons=== 1 ? '' :'s'}`,
            ...getConfirmTransferComponents({isValidated: true, isActive: true})
          }
          await DiscordRequest(`/channels/${serverChannels.confirmationTransferChannel}/messages/${adminMessage}`, {
            method: 'PATCH',
            body
          })
          await dbClient(({confirmations})=> confirmations.updateOne({playerId}, {$set: {validated: true}}))
          await sleep(500)
        }
      }
    }
  })
  
  return 1
}

export const pendingConfirmations = (async ({interaction_id, guild_id, token, application_id, dbClient})=>{
  await waitingMsg({interaction_id, token})
  const updatedConfs = await checkConfirmations({guild_id, dbClient})
  return updateResponse({application_id, token, content: `Updated ${updatedConfs} confirmations`})
})

const confirmCmd = {
  name: 'confirm',
  description: 'Join a team',
  type: 1,
  psaf: true,
  func: confirm,
  options: [{
    type: 8,
    name: 'team',
    description: 'Team',
    required: true,
  },{
    type: 4,
    name: 'seasons',
    description: 'How many seasons',
    required: true,
    min_value: 1,
    max_value: 3
  }]
}

const releaseCmd = {
  name: 'releaseplayer',
  description: 'Release a player from your team',
  type: 1,
  psaf: true,
  func: releasePlayer,
  options: [{
    type: 6,
    name: 'player',
    description: 'Player',
    required: true,
  },{
    type: 8,
    name: 'team',
    description: 'Team',
    required: true,
  },{
    type: 3,
    name: 'reason',
    description: 'Tell the admins why you want to release this player.',
    required: true,
  }]
}

export default [confirmCmd, releaseCmd]