import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { DiscordRequest } from "../utils.js"
import { msToTimestamp, getPlayerNick, sleep, waitingMsg, optionsToObject, updateResponse, quickResponse } from "../functions/helpers.js"
import { serverChannels, serverRoles } from "../config/psafServerConfig.js"
import commandsRegister from "../commandsRegister.js"
import { seasonPhases } from "./season.js"

const twoWeeksMs = 1209600033

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

export const register = async ({member, callerId, interaction_id, guild_id, application_id, token, options, dbClient}) => {
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })
  const {nationality, extranat, steam, uniqueid} = optionsToObject(options)
  
  const content = await dbClient(async ({players, nationalities})=> {
    const [dbPlayer, allCountries] = await Promise.all([
      players.findOne({id: callerId}),
      nationalities.find({}).toArray(),
    ])
    const nat1 = dbPlayer?.nat1 || nationality
    const nat2 = dbPlayer?.nat1 ? dbPlayer.nat2 : (extranat !== nationality ? extranat : null)
    const nat3 = dbPlayer?.nat3
    let steamId = dbPlayer?.steam
    if(steamId && !steamId.includes("steamcommunity.com/profiles/") && !steamId.includes("steamcommunity.com/id/")) {
      steamId = steam
    }
    const uniqueId = dbPlayer?.uniqueId || uniqueid

    const {flag: flag1 = ''} = allCountries.find(({name})=> name === nat1) || {}
    const {flag: flag2 = ''} = allCountries.find(({name})=> name === nat2) || {}
    const {flag: flag3 = ''} = allCountries.find(({name})=> name === nat3) || {}
    let userDetails = `${flag1}${flag2}${flag3}<@${callerId}>\rSteam: ${dbPlayer?.steam}\rUnique ID: ${dbPlayer?.uniqueId}`
    
    if(member.roles.includes(serverRoles.registeredRole) && dbPlayer) {
      return `You're already registered:\r${userDetails}`
    }
    if(member.roles.includes(serverRoles.matchBlacklistRole)) {
      return 'Can\'t register while blacklisted.'
    }
    if(!member.roles.includes(serverRoles.verifiedRole)){
      return 'Please verify before confirming.'
    }
    if(!steamId) {
      return 'Please enter your Steam ID. If you can\'t, please open a ticket and get your PSO Unique ID ready.'
    }
    if(!steamId.includes("steamcommunity.com/profiles/") && !steamId.includes("steamcommunity.com/id/") ) {
      return 'Invalid Steam ID. Please enter the URL shown when you are in your Steam profile page.'
    }
    if(!nationality) {
      return 'Please select a nationality'
    }
    if(extranat && extranat === nationality) {
      return 'No need to enter the same nationality as an extra one :)'
    }
    if(!allCountries.find(({name})=> name === nationality)) {
      return `Can't find ${nationality}, please select one of the nationalities of the autofill`
    }
    if(extranat && !allCountries.find(({name})=> name === extranat)) {
      return `Can't find ${extranat}, please select one of the nationalities of the autofill`
    }

    const updatedPlayer = {
      nick: getPlayerNick(member),
      nat1,
      nat2,
      nat3,
      steam: steamId,
      uniqueId,
    }
    await players.updateOne({id: callerId}, {$set: updatedPlayer}, {upsert: true})
    const payload = {
      roles: [...new Set([...member.roles, serverRoles.registeredRole])]
    }
    userDetails = `${flag1}${flag2}${flag3}<@${callerId}>\rSteam: ${steamId}\rUnique ID: ${uniqueId}`
    DiscordRequest(`guilds/${guild_id}/members/${callerId}`, {
      method: 'PATCH',
      body: payload
    })
    
    const content = `Registered:\r${userDetails}`
    await DiscordRequest(`/channels/${serverChannels.registrationsChannelId}/messages`, {
        method: 'POST',
        body: {
          content,
        }
      })
    return content
  })


  return await DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      content,
      flags: InteractionResponseFlags.EPHEMERAL
    }
  })
}

export const confirm = async ({member, callerId, interaction_id, application_id, channel_id, token, options, dbClient}) => {
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })
  const {team, seasons, nationality, extranat} = Object.fromEntries(options.map(({name, value})=> [name, value]))
  
  const response = await dbClient(async ({teams, players, nationalities, confirmations, pendingDeals, pendingLoans})=> {
    const [allTeams, dbPlayer, allCountries, previousConfirmation, pendingDeal, pendingLoan] = await Promise.all([
      teams.find({active: true}).toArray(),
      players.findOne({id: callerId}),
      nationalities.find({}).toArray(),
      confirmations.findOne({playerId: callerId}),
      pendingDeals.findOne({playerId: callerId, destTeam: team, approved: true}),
      pendingLoans.findOne({playerId: callerId, destTeam: team, approved: true})
    ])
    const currentTeam = allTeams.find(({id}) => member.roles.includes(id))
    const teamToJoin = allTeams.find(({id})=> id === team)
    if(currentTeam) {
      const deal = pendingDeal || pendingLoan
      if(!deal) {
        console.log(`${getPlayerNick(member)} tried to confirm for ${teamToJoin.name} but no deal`)
        return 'You can only confirm a transfer to teams your club has a deal with.'
      }
      if(deal.destTeam !== team) {
        return `You can only confirm for <@&${deal.destTeam}> as your club has agreed a deal with them.`
      }
    }
    if(member.roles.includes(serverRoles.matchBlacklistRole)) {
      return 'Can\'t join a team while blacklisted.'
    }
    if(!member.roles.includes(serverRoles.verifiedRole)){
      return 'Please verify before confirming.'
    }
    if(!teamToJoin) {
      return 'Please select an active team.'
    }
    if(previousConfirmation) {
      return `You already sent a confirmation to <@&${previousConfirmation.team}>, confirmation will expire after two weeks on <t:${msToTimestamp(previousConfirmation.expiresOn)}:F>`
    }
    if(!dbPlayer?.nat1 && !nationality) {
      return 'First time player, please select a nationality when using /confirm'
    }

    if(!dbPlayer?.nat1 && extranat && extranat === nationality) {
      return 'No need to enter the same nationality as an extra one :)'
    }
    if(!dbPlayer?.nat1 && !allCountries.find(({name})=> name === nationality)) {
      return `Can't find ${nationality}, please select one of the nationalities of the autofill`
    }
    if(!dbPlayer?.nat1 && extranat && !allCountries.find(({name})=> name === extranat)) {
      return `Can't find ${extranat}, please select one of the nationalities of the autofill`
    }

    const nat1 = dbPlayer?.nat1 || nationality
    const nat2 = dbPlayer?.nat1 ? dbPlayer.nat2 : (extranat !== nationality ? extranat : null)
    const nat3 = dbPlayer?.nat3
    const updatedPlayer = {
      nick: getPlayerNick(member),
      nat1,
      nat2,
      nat3,
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
          content: `<@${callerId}> requests to join <@&${team}> for ${seasons} season${seasons=== 1 ? '' :'s'}`,
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
      expiresOn: Date.now()+twoWeeksMs,
      messageId: message.id,
      adminMessage: adminMessage.id
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

export const releasePlayer = async ({member, callerId, interaction_id, application_id, channel_id, guild_id, token, options, dbClient}) => {
  const {team, player, reason} = optionsToObject(options)
  if(!member.roles.includes(serverRoles.clubManagerRole)) {
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
    if(activeLoanContract) {
      return `<@${player}> is on loan, you can't release him.`
    }
    if(discPlayer.roles.includes(serverRoles.clubManagerRole)) {
      return `<@${player}> is a Club Manager, please open a ticket if you're trying to release him.`
    }
    if(pendingRelease) {
      return `You already requested for <@${player}> to be released.`
    }
    if(discPlayer.roles.includes(serverRoles.matchBlacklistRole)) {
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
      expiresOn: Date.now()+twoWeeksMs,
      messageId: message.id,
      adminMessage: adminMessage.id
    })
    return 'Request posted'
  })

  return updateResponse({application_id, token, content: response})
}

export const innerRemoveRelease =  async ({reason, messageId, adminMessage, playerId, pendingReleases}) => {
  const channelId = serverChannels.confirmationChannelId
  console.log(channelId, messageId)
  console.log(serverChannels.confirmationTransferChannel, adminMessage)
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
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })
  const updatedConfs = await checkConfirmations({guild_id, dbClient})
  return await DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      content: `Updated ${updatedConfs} confirmations`,
      flags: InteractionResponseFlags.EPHEMERAL
    }
  })
})

commandsRegister.confirm = confirm
commandsRegister.updateconfirm = pendingConfirmations

export const confirmCmd = {
  name: 'confirm',
  description: 'Join a team',
  type: 1,
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
    max_value: 10
  },{
    type: 3,
    name: 'nationality',
    description: 'Nationality',
    autocomplete: true
  },{
    type: 3,
    name: 'extranat',
    description: 'Extra Nationality',
    autocomplete: true
  }]
}

export const registerCmd = {
  name: 'register',
  description: 'Register with PSAF',
  type: 1,
  options: [{
    type: 3,
    name: 'nationality',
    description: 'Nationality',
    autocomplete: true,
    required: true
  },{
    type: 3,
    name: 'steam',
    description: 'Your steam profile URL, like https://steamcommunity.com/profiles/123456789',
    required: true,
  },{
    type: 3,
    name: 'extranat',
    description: 'Extra Nationality',
    autocomplete: true
  },{
    type: 3,
    name: 'uniqueid',
    description: 'Your PSO unique ID',
  }]
}

export const releaseCmd = {
  name: 'releaseplayer',
  description: 'Release a player from your team',
  type: 1,
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

export const updateConfirmCmd = {
  name: 'updateconfirm',
  description: 'debug',
  type: 1
}