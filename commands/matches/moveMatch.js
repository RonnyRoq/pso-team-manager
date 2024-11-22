import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { serverChannels, serverRoles } from "../../config/psafServerConfig.js"
import { msToTimestamp, quickResponse, updateResponse, waitingMsg } from "../../functions/helpers.js"
import { editAMatchInternal, formatMatch, getMatchTeams, getMatchTeamsSync } from "../match.js"
import { DiscordRequest } from "../../utils.js"
import { ObjectId } from "mongodb"
import { parseDate } from "../timestamp.js"
import { twoWeeksMs } from "../../config/constants.js"
import { getAllLeagues } from "../../functions/allCache.js"

const oneWeekMs = 604800016

export const moveMatch = async ({interaction_id, token, application_id, dbClient, member, callerId}) => {
  await waitingMsg({interaction_id, token})
  if(!member.roles.includes(serverRoles.clubManagerRole)) {
    return updateResponse({application_id, token, content: 'This command is restricted to club managers'})
  }
  const response = await dbClient(async ({teams, matches, nationalTeams})=> {
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
    const allNationalTeams = await nationalTeams.find({}).toArray()
    const allTeams = await teams.find({active:true}).toArray()
    const response = []
    const allLeagues = await getAllLeagues()
    for await (const match of weekMatches) {
      const [homeTeam, awayTeam] = getMatchTeamsSync(match.home, match.away, match.isInternational, allNationalTeams, allTeams)
      const currentLeague = allLeagues.find(({value})=> value === match.league)
      const [post, extra] = await formatMatch(currentLeague, homeTeam, awayTeam, match)
      response.push({content: post + extra, matchId: match._id.toString()})
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
  await dbClient(async ({matches, nationalTeams, teams})=> {
    const match = await matches.findOne(matchId)
    const {isInternational, home, away, dateTimestamp} = match || {}
    const [homeTeam, awayTeam] = await getMatchTeams(home, away, isInternational, nationalTeams, teams)
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
          style: 1,
          required: false
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
  const {match_time, timezone='UK'} = Object.fromEntries(entries.map(entry=> [entry.custom_id, entry.value.trim()]))
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
  const timestampRegExp = /<t:(\d+):F>/
  const numberRegExp = /^(\d+)$/
  let dateTimestamp = ''
  if(timestampRegExp.test(match_time)) {
    dateTimestamp = timestampRegExp.exec(match_time)?.[1]
  } else if(numberRegExp.test(match_time)) {
    dateTimestamp = match_time
  } else {
    const suggestedTime = parseDate(match_time, timezoneOption)
    console.log(suggestedTime)
    dateTimestamp = msToTimestamp(Date.parse(suggestedTime))
  }
  const timeOfTheRequest = Date.now()
  const expiryTime = Date.now() + twoWeeksMs
  
  if(!numberRegExp.test(dateTimestamp)) {
    return quickResponse({interaction_id, token, content: `${match_time} was interpreted as <t:${dateTimestamp}:F> which is not a valid option. Try again`, isEphemeral: true})
  }
  const content = await dbClient(async ({moveRequest, teams, matches, matchDays})=> {
    const requesterTeamObj = await teams.findOne({active:true, $or: member.roles.map(id=> ({id}))})
    const requesterTeam = requesterTeamObj.id
    const matchId = new ObjectId(id)
    const match = await matches.findOne(matchId)
    if(!match) 
      return `Can't find the requested match`
    const matchDay = await matchDays.findOne({season: match.season, league: match.league, matchday: match.matchday})
    if(matchDay) {
      let beginningOfMatchday = new Date(Number(matchDay.startDateTimestamp+"000"))
      beginningOfMatchday.setHours(0,0,0,0)
      let endOfMatchday = new Date(beginningOfMatchday.getTime()+oneWeekMs-1000)
      const beginningTimestamp = msToTimestamp(beginningOfMatchday.getTime())
      const endingTimestamp = msToTimestamp(endOfMatchday.getTime())
      if(beginningTimestamp > dateTimestamp) {
        return `You requested to move this match at <t:${dateTimestamp}:F> but the match day starts on <t:${beginningTimestamp}:F>`
      }
      if(dateTimestamp > endingTimestamp) {
        return `You requested to move this match at <t:${dateTimestamp}:F> however the deadline to play this match is <t:${endingTimestamp}:F>`
      }
    }
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
    return `Request posted`
  })
  return quickResponse({interaction_id, token, content, isEphemeral: true})
}

export const listMatchMoves = async ({interaction_id, token, application_id, member, dbClient}) => {
  if(!member.roles.includes(serverRoles.clubManagerRole)) {
    return quickResponse({interaction_id, token, content: 'Only Club Managers can list moves.', isEphemeral:true})
  }
  await waitingMsg({interaction_id, token})
  const allLeagues = await getAllLeagues()
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
  await updateResponse({application_id, token, content})
  for await (const matchToMove of matchesToMove) {
    const match = teamMatches.find(({_id})=> (_id.toString() === matchToMove.id))
    const homeTeam = allTeams.find(({id})=> id === match.home)
    const awayTeam = allTeams.find(({id})=> id === match.away)
    const currentLeague = allLeagues.find(({value})=> value === match.league)
    const [post] = await formatMatch(currentLeague, homeTeam, awayTeam, match)
    const content = `${post}\rRequested time: <t:${matchToMove.dateTimestamp}:F>`
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
  
  const content = await dbClient(async ({moveRequest, teams, nationalTeams, matches, leagueConfig})=> {
    const matchToMove = await moveRequest.findOne(matchToMoveId)
    if(!matchToMove) {
      return 'Cannot find the match to move'
    }
    const updatedMatch = await editAMatchInternal({id: matchToMove.id, timestamp: matchToMove.dateTimestamp, teams, nationalTeams, matches, leagueConfig})
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
    await moveRequest.deleteOne({_id: matchToMove._id})
    return `Move confirmed:\r${updatedMatch}`
  })

  return updateResponse({application_id, token, content})
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
    await moveRequest.deleteOne({_id: matchToMoveId})
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