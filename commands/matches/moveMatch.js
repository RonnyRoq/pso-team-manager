import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { fixturesChannels, serverChannels, serverRoles } from "../../config/psafServerConfig.js"
import { msToTimestamp, quickResponse, updateResponse, waitingMsg } from "../../functions/helpers.js"
import { editAMatchInternal, formatMatch } from "../match.js"
import { DiscordRequest } from "../../utils.js"
import { ObjectId } from "mongodb"
import { parseDate } from "../timestamp.js"
import { twoWeeksMs } from "../../config/constants.js"

const oneWeekMs = 604800016

export const moveMatch = async ({interaction_id, token, application_id, dbClient, member, callerId}) => {
  await waitingMsg({interaction_id, token})
  if(!member.roles.includes(serverRoles.clubManagerRole)) {
    return updateResponse({application_id, token, content: 'This command is restricted to club managers'})
  }
  const response = await dbClient(async ({teams, matches, nationalities})=> {
    const userTeam = await teams.findOne({active:true, $or: member.roles.map(id=> ({id}))})
    if(!userTeam) {
      return `Can't find the team for ${callerId}`
    }
    const startOfDay = new Date()
    startOfDay.setUTCHours(0,0,0,0)
    const aWeekLater = new Date(Date.now()+oneWeekMs)
    aWeekLater.setUTCHours(23,59,59,999)
    
    const request = {finished: null, $or: [{home: userTeam.id}, {away: userTeam.id}], dateTimestamp: {$gte: msToTimestamp(startOfDay.getTime()), $lte: msToTimestamp(aWeekLater.getTime())}}
    const weekMatches = await matches.find(request, {dateTimestamp: 1}).toArray()
    const allNationalTeams = await nationalities.find({}).toArray()
    const allTeams = await teams.find({active:true}).toArray()
    const response = []
    for (const match of weekMatches) {
      const homeTeam = match.isInternational ? allNationalTeams.find(({name})=>name===match.home) : allTeams.find(({id})=> id === match.home)
      const awayTeam = match.isInternational ? allNationalTeams.find(({name})=>name===match.away) : allTeams.find(({id})=> id === match.away)
      const currentLeague = fixturesChannels.find(({value})=> value === match.league)
      response.push({content: formatMatch(currentLeague, homeTeam, awayTeam, match, true, match.isInternational), matchId: match._id.toString()})
    }
    return response
  })
  if(!response[0]) {
    return updateResponse({application_id, token, content:response})
  }

  await updateResponse({application_id, token, content: 'Matches this week:'})
  for await (const matchContent of response){
    const {content, matchId} = matchContent
    await DiscordRequest(`/webhooks/${application_id}/${token}`, {
      method: 'POST',
      body: {
        content: content,
        flags: InteractionResponseFlags.EPHEMERAL,
        components: [{
          type: 1,
          components: [{
            type: 2,
            label: `Move the match`,
            style: 1,
            custom_id: `movematch_${matchId}`
          }]
        }]
      }
    })
  }
}

export const moveMatchPrompt = async ({interaction_id, token, custom_id, dbClient}) => {
  const [,id] = custom_id.split('_')
  const matchId = new ObjectId(id)
  await dbClient(async ({matches, nationalities, teams})=> {
    const match = await matches.findOne(matchId)
    const {isInternational, home, away, dateTimestamp} = match || {}
    let homeTeam, awayTeam
    if(isInternational) {
      [homeTeam, awayTeam] = await Promise.all([
        nationalities.findOne({name: home}),
        nationalities.findOne({name: away})
      ])
    } else {
      [homeTeam, awayTeam] = await Promise.all([
        teams.findOne({active:true, id: home}),
        teams.findOne({active:true, id: away})
      ])
    }
    const matchTime = new Date(dateTimestamp*1000).toTimeString()

    const modal = {
      title: `${matchTime} ${homeTeam.name} - ${awayTeam.name}`.substring(0, 44),
      custom_id: `move_the_match_${id}`,
      components: [{
        type: 1,
        components: [{
          type: 4,
          custom_id: "match_time",
          label: `Enter the match date time same as /timestamp`,
          style: 1,
          required: true
        }]
      },{
        type: 1,
        components: [{
          type: 4,
          custom_id: "timezone",
          label: 'Your timezone: UK/CET/Turkey (UK by default)',
          style: 1
        }]
      }]
    }
    
    await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
      method: 'POST',
      body: {
        type : InteractionResponseType.MODAL,
        data: modal
      }
    })
  })
}

export const moveMatchModalResponse = async ({interaction_id, token, callerId, member, custom_id, components, dbClient}) => {
  const [,,,id] = custom_id.split('_')
  const entries = components.map(({components})=> components[0])
  const {match_time, timezone='UK'} = Object.fromEntries(entries.map(entry=> [entry.custom_id, entry.value]))
  let timezoneOption
  //await waitingMsg({interaction_id, token})
  switch(timezone.toLowerCase()) {
    case 'turkey':
    case 'turkiye':
      timezoneOption = 2
      break;
    case 'cet':
      timezoneOption = 1
      break;
    default:
      timezoneOption = 0
  }
  console.log(match_time)
  const suggestedTime = parseDate(match_time, timezoneOption)
  const timeOfTheRequest = Date.now()
  const expiryTime = Date.now() + twoWeeksMs
  const dateTimestamp = msToTimestamp(Date.parse(suggestedTime))
  console.log(dateTimestamp)
  await dbClient(async ({moveRequest, teams, matches})=> {
    const requesterTeamObj = await teams.findOne({active:true, $or: member.roles.map(id=> ({id}))})
    const requesterTeam = requesterTeamObj.id
    const matchId = new ObjectId(id)
    const match = await matches.findOne(matchId)
    const destinationTeam = match.home === requesterTeam ? match.away : match.home
    await moveRequest.updateOne({id, requesterTeam, destinationTeam}, {$set: {id, requester: callerId, requesterTeam, destinationTeam, dateTimestamp, expiryTime, timeOfTheRequest }}, {upsert: true})
    const resp = await DiscordRequest(`/channels/${serverChannels.moveMatchChannelId}/messages`, {
      method: 'POST',
      body: {
        content: `<@${callerId}> requests to move <@&${match.home}> - <@&${match.away}>, initially at <t:${match.dateTimestamp}:F>\rto <t:${dateTimestamp}:F>`
      }
    })
    const message = await resp.json()
    await moveRequest.updateOne({id, requesterTeam, destinationTeam}, {$set: {message: message.id}})
  })
  await quickResponse({interaction_id, token, content: `Request posted`, isEphemeral: true})
}

export const listMatchMoves = async ({interaction_id, token, application_id, member, dbClient}) => {
  if(!member.roles.includes(serverRoles.clubManagerRole)) {
    return quickResponse({interaction_id, token, content: 'Only Club Managers can list deals.', isEphemeral:true})
  }
  await waitingMsg({interaction_id, token})
  
  const{team, allTeams, matchesToMove, teamMatches} = await dbClient(async ({moveRequest, teams, matches})=> {
    const orArg = [...member.roles.map(id=> ({id})), {_id:'__'}]
    console.log(orArg)
    const team = await teams.findOne({$or: orArg, active: true})
    const allTeams = await teams.find({active:true}).toArray()
    const moveRequestFilter = {destinationTeam: team.id}
    console.log(moveRequestFilter)
    const matchesToMove = await moveRequest.find(moveRequestFilter).toArray()
    const matchesRequest = {$or: matchesToMove.map(({id})=> ({_id: new ObjectId(id)}))}
    console.log(matchesRequest)
    const teamMatches = await (matchesToMove.length === 0 ? Promise.resolve([]) : matches.find(matchesRequest).toArray())
    return {
      team,
      allTeams,
      matchesToMove,
      teamMatches
    }
  })
  const content = matchesToMove.length > 0 ? `Move requests for <@&${team.id}>:\r` : `No requests to move a match for <@&${team.id}>.`
  await DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      content,
      flags: InteractionResponseFlags.EPHEMERAL,
    }
  })
  for await (const matchToMove of matchesToMove) {
    console.log(matchToMove)
    console.log(teamMatches)
    const match = teamMatches.find(({_id})=> (_id.toString() === matchToMove.id))
    console.log(match)
    const homeTeam = allTeams.find(({id})=> id === match.home)
    const awayTeam = allTeams.find(({id})=> id === match.away)
    const currentLeague = fixturesChannels.find(({value})=> value === match.league)
    const content = `${formatMatch(currentLeague, homeTeam, awayTeam, match)}\rRequested time: <t:${matchToMove.dateTimestamp}:F>`
    await DiscordRequest(`/webhooks/${application_id}/${token}`, {
      method: 'POST',
      body: {
        content,
        components: [{
          type: 1,
          components: [{
            type: 2,
            label: "Approve",
            style: 3,
            custom_id: "approve_matchmove_"+matchToMove._id.toString(),
          }, {
            type: 2,
            label: "Decline",
            style: 4,
            custom_id: "decline_matchmove_"+matchToMove._id.toString(),
          }],
        }],
        flags: InteractionResponseFlags.EPHEMERAL,
      }
    })
  }
}

export const approveMoveMatch = async ({interaction_id, token, application_id, callerId, custom_id, dbClient}) => {
  const [,,id] = custom_id.split('_')
  const matchToMoveId = new ObjectId(id)
  await waitingMsg({interaction_id, token})
  
  const updatedMatch = await dbClient(async ({moveRequest, teams, nationalities, matches})=> {
    const matchToMove = await moveRequest.findOne(matchToMoveId)
    const updatedMatch = await editAMatchInternal({id: matchToMove.id, timestamp: matchToMove.dateTimestamp, teams, nationalities, matches})
    const resp = await DiscordRequest(`/channels/${serverChannels.moveMatchChannelId}/messages/${matchToMove.message}`, {method: 'GET'})
    const moveRequestMessage = await resp.json()
    await DiscordRequest(`/channels/${serverChannels.moveMatchChannelId}/messages/${matchToMove.message}`, {
      method: 'PATCH',
      body: {
        content: moveRequestMessage.content+`\rAccepted by <@${callerId}>. New date is <t:${matchToMove.dateTimestamp}:F>`
      }
    })
    await DiscordRequest(`/channels/${serverChannels.scheduleChannelId}/messages`, {
      method: 'POST',
      body: {
        content: `Match moved, requested by <@${matchToMove.requester}> accepted by <@${callerId}>.\r${updatedMatch}`
      }
    })
    await matchToMove.deleteOne(matchToMoveId)
    return updatedMatch
  })
  
  return await updateResponse({application_id, token, content: `Move confirmed:\r${updatedMatch}`})
}

export const declineMoveMatch = async ({interaction_id, token, application_id, callerId, custom_id, dbClient}) => {
  const [,,id] = custom_id.split('_')
  const matchToMoveId = new ObjectId(id)
  await waitingMsg({interaction_id, token})
  await dbClient(async ({moveRequest})=> {
    const matchToMove = await moveRequest.findOne(matchToMoveId)
    const resp = await DiscordRequest(`/channels/${serverChannels.moveMatchChannelId}/messages/${matchToMove.message}`, {method: 'GET'})
    const moveRequestMessage = await resp.json()
    await DiscordRequest(`/channels/${serverChannels.moveMatchChannelId}/messages/${matchToMove.message}`, {
      method: 'PATCH',
      body: {
        content: moveRequestMessage.content+`\rDECLINED by <@${callerId}>.`
      }
    })    
    await matchToMove.deleteOne(matchToMoveId)
  })

  return await updateResponse({application_id, token, content: `Move declined.`})
}

export const moveMatchCmd = {
  name: 'movematch',
  description: 'Move one of your matches',
  type: 1,
}

export const listMovesCmd = {
  name: 'listmoves',
  description: 'List my match move requests',
  type: 1
}