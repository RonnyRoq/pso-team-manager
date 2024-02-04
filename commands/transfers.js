import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { DiscordRequest } from "../utils.js"
import { addPlayerPrefix, removePlayerPrefix, getCurrentSeason, getPlayerNick, optionsToObject, msToTimestamp, waitingMsg, updateResponse } from "../functions/helpers.js"
import { innerRemoveConfirmation, innerRemoveRelease } from "./confirm.js"
import { seasonPhases } from "./season.js"

const logWebhook = process.env.WEBHOOK
const clubPlayerRole = '1072620805600592062'

const innerTransferAction = async ({teams, contracts, seasonsCollect, guild_id, playerId, team, seasons, desc, callerId, amount=0, pendingLoan}) => {
  const [dbTeam, playerResp] = await Promise.all([
    teams.findOne({id: team}),
    DiscordRequest(`/guilds/${guild_id}/members/${playerId}`, {}),
  ])
  if(!pendingLoan){
    await contracts.updateMany({playerId, endedAt:null}, {$set: {endedAt: Date.now()}})
  }
  const currentSeason = await getCurrentSeason(seasonsCollect)
  const playerTransfer = await playerResp.json();
  playerTransfer.roles = playerTransfer.roles || []
  const teamFrom = await teams.findOne({active:true, $or:[...playerTransfer.roles.map(role=>({id:role})), {id:'1'}]}) //little trick to force the search if the array is empty (no roles)
  const playerName = getPlayerNick(playerTransfer);
  const displayName = teamFrom ? removePlayerPrefix(teamFrom.shortName, playerName) : playerName
  const transferAmount = teamFrom ? (pendingLoan ? pendingLoan.amount : amount) : 0
  const updatedPlayerName = addPlayerPrefix(dbTeam.shortName, displayName)
  const payload = {
    nick: updatedPlayerName,
    roles: [...new Set([...playerTransfer.roles.filter(role => !(role === clubPlayerRole || role === teamFrom?.id)), team, clubPlayerRole])]
  }
  const loanDetails = pendingLoan ? {phase: pendingLoan.phase, until: pendingLoan.until, originalTeam: teamFrom?.id} : {}
  await Promise.all([
    contracts.insertOne({id: Date.now(), at: Date.now(), playerId, team, until: currentSeason+seasons, desc, ...loanDetails, isLoan: !!pendingLoan}),
    teams.updateOne({id: dbTeam?.id}, {$set: {budget: dbTeam.budget-transferAmount}}),
    teamFrom ? teams.updateOne({id: teamFrom.id}, {$set: {budget: teamFrom.budget+transferAmount}}) : Promise.resolve(),
    DiscordRequest(`guilds/${guild_id}/members/${playerId}`, {
      method: 'PATCH',
      body: payload
    })
  ])
  return teamFrom ? (
    pendingLoan ?
     loanMessage({playerId, team, teamFromId: teamFrom.id, callerId, amount: transferAmount, desc, ...loanDetails}) 
     : teamTransferMessage({playerId, team, teamFromId: teamFrom.id, seasons, callerId, amount: transferAmount, desc}) 
   ): transferMessage({playerId, team, seasons, callerId, desc})
}

const transferMessage = ({playerId, team, seasons, desc, callerId}) => `# :bust_in_silhouette: Free agent :arrow_right: <@&${team}>\r> <@${playerId}>\r> for ${seasons} seasons.\r*(from <@${callerId}>)*${desc ? `\r${desc}`: ''}`
const teamTransferMessage = ({playerId, teamFromId, team, seasons, amount, desc, callerId}) => 
`# <@&${teamFromId}> :arrow_right: <@&${team}>\r> <:EBit:1128310625873961013> ${new Intl.NumberFormat('en-US').format(amount)} EBits\r> <@${playerId}>\r> for ${seasons} seasons.\r*(from <@${callerId}>)*${desc ? `\r${desc}`: ' '}`
const loanMessage = ({playerId, team, teamFromId, callerId, amount, phase, until}) => 
`# <@&${teamFromId}> :arrow_right: <@&${team}>\r> <:EBit:1128310625873961013> ${new Intl.NumberFormat('en-US').format(amount)} EBits\r> <@${playerId}>\r> **LOAN** until season ${until}, beginning of ${seasonPhases[phase].desc}.\r*(from <@${callerId}>)*`
const endOfLoanMessage = ({playerId, team, teamFromId, callerId}) =>
`# <@&${teamFromId}> :arrow_right: <@&${team}>\r> <@${playerId}>\r> **LOAN ENDED** Player is returning to his club.\r*(from <@${callerId}>)*`

export const transferAction = async ({interaction_id, token, application_id, message, dbClient, callerId, guild_id}) => {
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })
  const {done, content} = await dbClient(async ({teams, contracts, seasonsCollect, confirmations, pendingDeals, pendingLoans}) => {
    const confirmation = await confirmations.findOne({adminMessage: message.id})
    if(confirmation) {
      console.log(confirmation)
      const {playerId, team, seasons} = confirmation
      const pendingDeal = await pendingDeals.findOne({playerId, destTeam:team, approved: true})
      if(pendingDeal && pendingDeal.destTeam !== team) {
        return {content:`<@${playerId}> has a deal with a different team, can't confirm`}
      }
      let pendingLoan
      if(!pendingDeal) {
        pendingLoan = await pendingLoans.findOne({playerId, approved: true})
      }
      const content = await innerTransferAction({teams, contracts, seasonsCollect, seasons, guild_id, playerId, team, callerId, amount: pendingDeal?.amount, pendingLoan})
      await innerRemoveConfirmation({reason: `Approved by <@${callerId}>`, ...confirmation, confirmations, pendingDeals, pendingLoans})
      return {done: true, content}
    }
    return {content: 'No confirmation found for transfer.'}
  })
  if(done){
    await DiscordRequest(logWebhook, {
      method: 'POST',
      body: {content}
    })
  }
  return DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      content,
      flags: InteractionResponseFlags.EPHEMERAL
    }
  })
}

export const transfer = async ({options, guild_id, application_id, interaction_id, token, dbClient, callerId}) => {
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })
  const {player: playerId, team, seasons, desc} = Object.fromEntries(options.map(({name, value})=> [name, value]))
  const content = await dbClient(async ({teams, contracts, seasonsCollect})=> (
    innerTransferAction({teams, contracts, seasonsCollect, guild_id, playerId, team, seasons, desc, callerId, amount: 0})
  ))
  await DiscordRequest(logWebhook, {
    method: 'POST',
    body: {
      content
    }
  })
  return await DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      content,
      flags: InteractionResponseFlags.EPHEMERAL
    }
  })
}

export const teamTransfer = async ({options, guild_id, interaction_id, token, dbClient, callerId, application_id}) => {
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })
  const {player:playerId, team, amount, seasons, desc} = optionsToObject(options)
  const content = await dbClient(async ({teams, contracts, seasonsCollect})=> (
    innerTransferAction({teams, contracts, seasonsCollect, guild_id, playerId, team, seasons, desc, callerId, amount})
  ))
  await DiscordRequest(logWebhook, {
    method: 'POST',
    body: {
      content
    }
  })
  return await DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      content,
      flags: InteractionResponseFlags.EPHEMERAL
    }
  })
}

const SEVENDAYSMS = 604800000
export const renew = async ({dbClient, member, callerId, options, res}) => {
  const {seasons} = optionsToObject(options)
  const name = getPlayerNick(member)
  return await dbClient(async({contracts, seasonsCollect, players, teams})=>{
    const [currentSeasonObj, allTeams, currentContract] = await Promise.all([
      seasonsCollect.findOne({endedAt: null}),
      teams.find({active:true}).toArray(),
      contracts.findOne({playerId: callerId, endedAt: null})
    ])
    if(currentContract === null) {
      return res.send({
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `Could not find an existing contract. Please sign with a team or open a ticket if you're already playing with a team.`,
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      })
    }
    const lastContractUpdate = currentContract?.updatedAt || currentContract?.at || currentSeasonObj.startedAt
    if(lastContractUpdate+SEVENDAYSMS > Date.now() && currentContract.until > (currentSeasonObj.season + 1)) {
      return res.send({
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `You already signed a contract on <t:${msToTimestamp(lastContractUpdate)}:F>, please wait 7 days before renewing.`,
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      })
    } else {
      const allTeamIds = allTeams.map(({id})=> id)
      const team = member.roles.find(role=>allTeamIds.includes(role))
      const objTeam = allTeams.find(({id})=> id === team)
      await Promise.all([
        players.updateOne({id: callerId}, {$set:{
          nick: name, 
        }}, {upsert: true}),
        contracts.updateOne({playerId: callerId, endedAt: null}, {$set: {
          playerId: callerId,
          team,
          at: currentContract?.at || Date.now(), 
          until: seasons+currentContract.until,
          updatedAt: Date.now()
        }}, {upsert: true})
      ])
      const content = `<@${callerId}> renewed his contract with ${objTeam.name} for ${seasons} season${seasons!==1 ? 's':''} (until Season ${seasons+currentContract.until})`
      return res.send({
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content
        }
      })
    }
  })
}

export const setContract = async ({dbClient, guild_id, options, res, callerId}) => {
  const {player, seasons} = optionsToObject(options)
  const playerResp = await DiscordRequest(`/guilds/${guild_id}/members/${player}`, {})
  const discPlayer = await playerResp.json()
  const name = getPlayerNick(discPlayer)
  return await dbClient(async({contracts, seasonsCollect, players, teams})=>{
    const [currentSeasonObj, allTeams, currentContract] = await Promise.all([
      seasonsCollect.findOne({endedAt: null}),
      teams.find({active:true}).toArray(),
      contracts.findOne({playerId: player, endedAt: null})
    ])
    
    const allTeamIds = allTeams.map(({id})=> id)
    const team = discPlayer.roles.find(role=>allTeamIds.includes(role))
    const objTeam = allTeams.find(({id})=> id === team)
    await Promise.all([
      players.updateOne({id: player}, {$set:{
        nick: name, 
      }}, {upsert: true}),
      contracts.updateOne({playerId: player, endedAt: null}, {$set: {
        playerId: player,
        team,
        at: currentContract?.at || Date.now(), 
        until: seasons+currentSeasonObj.season,
        updatedAt: Date.now()
      }}, {upsert: true})
    ])
    const content = `<@${callerId}> set <@${player}> contract with ${objTeam.name} for ${seasons} season${seasons!==1 ? 's':''}`
    return res.send({
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content
      }
    })
  })
}

export const releaseAction = async ({interaction_id, token, application_id, guild_id, message, callerId, dbClient}) => {
  await waitingMsg({interaction_id, token})

  const {done, content} = await dbClient(async ({teams, contracts, pendingReleases}) => {
    const release = await pendingReleases.findOne({adminMessage: message.id})
    if(release) {
      console.log(release)
      const {playerId, team} = release
      const [dbTeam, playerResp] = await Promise.all([
        teams.findOne({id: team}),
        DiscordRequest(`/guilds/${guild_id}/members/${playerId}`, {}),
        contracts.updateMany({playerId, endedAt: null}, {$set: {endedAt: Date.now()}})
      ])
      const discPlayer = await playerResp.json();
      if(!dbTeam) {
        return "No transfer happened"
      }
  
      const playerName = getPlayerNick(discPlayer)
      let updatedPlayerName = removePlayerPrefix(dbTeam.shortName, playerName)
      const payload= {
        nick: updatedPlayerName,
        roles: discPlayer.roles.filter(playerRole=> ![team, clubPlayerRole].includes(playerRole))
      }
      await DiscordRequest(`guilds/${guild_id}/members/${playerId}`, {
        method: 'PATCH',
        body: payload
      })
      await innerRemoveRelease({reason: `Approved by <@${callerId}>`, ...release, pendingReleases})
      
      const content = `# <@&${team}> :arrow_right: Free agent\r> <@${playerId}>\r*(from <@${callerId}>)*`
      return {content, done: true}
    }
    return {content: 'No pending release found for transfer.'}
  })
  if(done){
    await DiscordRequest(logWebhook, {
      method: 'POST',
      body: {content}
    })
  }
  return updateResponse({application_id, token, content})
}

export const freePlayer = async ({interaction_id, token, guild_id, callerId, options, dbClient}) => {
  const {player, team} = optionsToObject(options)
  const content = await dbClient(async ({teams, contracts})=>{
    const [dbTeam, playerResp] = await Promise.all([
      teams.findOne({id: team}),
      DiscordRequest(`/guilds/${guild_id}/members/${player}`, {}),
      contracts.updateMany({playerId: player, endedAt: null}, {$set: {endedAt: Date.now()}})
    ])
    const discPlayer = await playerResp.json();
    if(!dbTeam) {
      return "No transfer happened"
    }

    const playerName = getPlayerNick(discPlayer)
    let updatedPlayerName = removePlayerPrefix(dbTeam.shortName, playerName)
    const payload= {
      nick: updatedPlayerName,
      roles: discPlayer.roles.filter(playerRole=> ![team, clubPlayerRole].includes(playerRole))
    }
    await DiscordRequest(`guilds/${guild_id}/members/${player}`, {
      method: 'PATCH',
      body: payload
    })
    const log = `# <@&${team}> :arrow_right: Free agent\r> <@${player}>\r*(from <@${callerId}>)*`
    await DiscordRequest(logWebhook, {
      method: 'POST',
      body: {
        content: log
      }
    })
    return log
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

export const endLoan = async ({callerId, guild_id, player, playerId, teamToReturn, endLoanTeam, contracts}) => {
  const playerName = getPlayerNick(player);
  const displayName = endLoanTeam ? removePlayerPrefix(endLoanTeam.shortName, playerName) : playerName
  const updatedPlayerName = addPlayerPrefix(teamToReturn.shortName, displayName)
  let playerUpdatePromise
  if(player) {
    const payload = {
      nick: updatedPlayerName,
      roles: [...new Set([...player.roles.filter(role => !(role ===clubPlayerRole || role === endLoanTeam?.id)), teamToReturn?.id, clubPlayerRole])]
    }
    playerUpdatePromise = DiscordRequest(`guilds/${guild_id}/members/${playerId}`, {
      method: 'PATCH',
      body: payload
    })
  } else {
    playerUpdatePromise = Promise.resolve()
  }
  await Promise.all([
    contracts.updateOne({playerId, team: endLoanTeam.id, endedAt: null, isLoan: true}, {$set: {endedAt: Date.now()}}),
    playerUpdatePromise
  ])
  return endOfLoanMessage({playerId, team: teamToReturn.id, teamFromId: endLoanTeam.id, callerId})
}

export const transferCmd = {
  name: 'transfer',
  description: 'Transfer a free agent to a team',
  type: 1,
  options: [{
    type: 6,
    name: 'player',
    description: 'Player',
    required: true
  },{
    type: 8,
    name: 'team',
    description: 'Team',
    required: true
  },{
    type: 4,
    name: 'seasons',
    description: 'How many seasons',
    min_value: 1,
    max_value: 10,
    required: true
  },{
    type: 3,
    name: 'desc',
    description: 'Description (length)'
  }]
}

export const teamTransferCmd = {
  name: 'teamtransfer',
  description: 'Transfer a player from his team to another',
  type: 1,
  options: [{
    type: 6,
    name: 'player',
    description: 'Player',
    required: true
  },{
    type: 8,
    name: 'team',
    description: 'Team to transfer',
    required: true
  },{
    type: 4,
    name: 'amount',
    description: 'Amount (Place 0 if free)',
    required: true,
    min_value: 0,
  },{
    type: 4,
    name: 'seasons',
    description: 'How many seasons',
    min_value: 1,
    max_value: 10,
    required: true
  },{
    type: 3,
    name: 'desc',
    description: 'Description'
  }]
}

export const renewCmd = {
  name: 'renew',
  description: 'Renew a contract for your team. Once every 7 days.',
  type: 1,
  options: [{
    type: 4,
    name: 'seasons',
    description: 'How many seasons',
    min_value: 1,
    max_value: 10,
    required: true
  }]
}
export const setContractCmd = {
  name: 'setcontract',
  description: 'Set a player\'s contract',
  type: 1,
  options: [{
    type: 6,
    name: 'player',
    description: 'Player',
    required: true
  },{
    type: 4,
    name: 'seasons',
    description: 'How many seasons',
    min_value: 1,
    max_value: 10,
    required: true
  }]
}