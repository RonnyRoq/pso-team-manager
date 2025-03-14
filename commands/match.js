import { ObjectId, ReturnDocument } from "mongodb";
import { elimMatchDaysSorted, matchDays, serverChannels, serverRoles } from "../config/psafServerConfig.js";
import { deleteMessage, followUpResponse, getCurrentSeason, getFlags, getPlayerNick, handleSubCommands, isTopAdminRole, msToTimestamp, optionsToObject, postMessage, postWaiting, publicFollowUpResponse, quickResponse, silentResponse, updatePost, updateResponse, waitingMsg } from "../functions/helpers.js";
import { DiscordRequest } from "../utils.js";
import { sleep } from "../functions/helpers.js";
import { parseDate } from "./timestamp.js";
import { formatDMLineup } from "./lineup/lineup.js";
import { getAllPlayers } from "../functions/playersCache.js";
import { getAllLeagues, getAllNationalities } from "../functions/allCache.js";
import { getFastCurrentSeason } from "./season.js";

const matchLogChannelId = '1151131972568092702'

export const getMatchTeams = (home, away, isInternational, nationalTeams, teams) => (
   Promise.all([
    isInternational ? nationalTeams.findOne({shortname: home}) : teams.findOne({id: home}),
    isInternational ? nationalTeams.findOne({shortname: away}) : teams.findOne({id: away})
  ])
)

export const getMatchTeamsSync = (home, away, isInternational, allNationalTeams, allTeams) => ([
  isInternational ? allNationalTeams.find(nationalTeam=> nationalTeam.shortname === home) : allTeams.find(team=> team.id === home),
  isInternational ? allNationalTeams.find(nationalTeam=> nationalTeam.shortname === away) : allTeams.find(team=> team.id === away),
])

export const updateMatchMessage = async ({match, channel, post, content}) => {
  if(match.messageId) {
    await updatePost({channel_id: channel, messageId: match.messageId, content: post})
  }
  if(match.logId) {
    await updatePost({channel_id: matchLogChannelId, messageId: match.logId, content})
  }
  if(match.scheduleMessage) {
    await updatePost({channel_id:serverChannels.scheduleChannelId, messageId: match.scheduleMessage, content})
  }
}

export const formatMatch = async (league, homeTeam, awayTeam, match) => {
  let response = `<${league.emoji}> **| ${league.name}${match.group? ` ${match.group}` : ' '} ${match.matchday}** - ${match.dateTimestamp ? `<t:${match.dateTimestamp}:F>` : 'No date'}`
  let extra = `\rID: ${match?._id}`
  if(homeTeam && awayTeam) {
    if(league.isInternational) {
      const homeFlag = await getFlags(homeTeam)
      const awayFlag = await getFlags(awayTeam)
      response += `\r> ${homeFlag} **${homeTeam.name} :vs: ${awayTeam.name}** ${awayFlag}`
    } else {
      response += `\r> ${homeTeam.flag} ${homeTeam.disqualified || !homeTeam.active ?':no_entry_sign: ':''}${homeTeam.emoji} <@&${homeTeam.id}> :vs: <@&${awayTeam.id}> ${awayTeam.emoji}${awayTeam.disqualified || !awayTeam.active ?':no_entry_sign: ':''} ${awayTeam.flag}`
    }
    response += `\r> ${match.homeScore} : ${match.awayScore}${match.isFF ? ' **ff**': ''}`
  } else {
    extra += `\rERROR: please report this in a ticket with the time of the request and the match ID.`
  }
  
  if(match.refs) {
    const refsArray = match.refs.split(',')
    extra += '\rRefs: '+refsArray.map(ref=> `<@${ref}>`).join(', ')
  }
  if(match.streamers) {
    const streamersArray = match.streamers.split(',')
    extra += '\rStreamer(s): '+streamersArray.map(streamer=> `<@${streamer}>`).join(', ')
  }
  
  return [response, extra]
}

export const updateMatch = async ({currentLeague, homeTeam, awayTeam, match, homeScore, awayScore, ff}) => {
  const channel = currentLeague.channel || currentLeague.value
  const hScore = homeScore || match.homeScore || '?'
  const aScore = awayScore || match.awayScore || '?'
  const isFF = ff !== undefined ? ff : match.isFF || false
  const [post, extra] = await formatMatch(currentLeague, homeTeam, awayTeam, {...match, homeScore:hScore, awayScore:aScore, isFF})
  const content = post + extra
  await updateMatchMessage({match, channel, post, content})
  return content
}

export const formatMatchResult = async (league, homeTeam, awayTeam, match, callerId, homeEntries, awayEntries) => {
  let content = '# '
  if(match.isInternational) {
    const homeFlag = await getFlags(homeTeam)
    const awayFlag = await getFlags(awayTeam)
    content += `<${league.emoji}> | ${homeFlag} **${homeTeam.name} ${match.homeScore} - ${match.awayScore} ${awayTeam.name}** ${awayFlag}`
  } else {
    content += `<${league.emoji}> | ${homeTeam.emoji} ${homeTeam.name} ${match.homeScore} - ${match.awayScore} ${awayTeam.name} ${awayTeam.emoji}`
  }
  const allEntries = homeEntries.concat(awayEntries)
  const allGoals = allEntries.filter(player => player.Goals > 0).sort((a,b)=> b.Goals - a.Goals)
  const allAssists = allEntries.filter(player => player.Assists > 0).sort((a,b)=> b.Assists - a.Assists)
  content += `\r${allGoals.map(player=> `:soccer:x${player.Goals} ${player.name.substring(0, 18)}`).join('\r')}`
  content += `\r${allAssists.map(player=> `:athletic_shoe:x${player.Assists} ${player.name.substring(0, 18)}`).join('\r')}`
  content += `\rFrom: <@${callerId}>`
  const {homeStats, homeScore, awayStats, awayScore} = match
  const matchStatEmbed = {
    timestamp: match.dateOfMatch,
    title: 'Match Stats',
    fields: [{
      name: homeTeam.name,
      value: Object.values(homeStats).join('\r'),
      inline: true,
    }, {
      name: `${homeScore} - ${awayScore}`,
      value: Object.keys(homeStats).map(value=> `**${value}**`).join('\r'),
      inline: true,
    },{
      name: awayTeam.name,
      value: Object.values(awayStats).join('\r'),
      inline: true,
    }]
  }
  const headerPlayer = `Pos   | Name (Discord)       | Score | Passes | Assists | Shots | Goals | Tackles | Interceptions | Catches | Saves \r`
  const playerMap = (playerStats) => `${playerStats.pos.toUpperCase().padStart(5)} | ${playerStats.name.substring(0, 18).padEnd(18)}${playerStats.id? '✅': '🔍'} | ${playerStats.Score.padStart(5)} | ${playerStats.Passes.padStart(6)} | ${
    playerStats.Assists.padStart(7) } | ${playerStats.Shots.padStart(5)} | ${playerStats.Goals.padStart(5)} | ${playerStats.Tackles.padStart(7)} | ${
      playerStats.Interceptions.padStart(13)} | ${playerStats["GK Catches"].padStart(7)} | ${playerStats["GK Saves"].padStart(5)}`
  const homeStatsTxt = headerPlayer + homeEntries.map(playerMap).join('\r')
  const awayStatsTxt = headerPlayer + awayEntries.map(playerMap).join('\r')
  const homeContent = `## ${homeTeam.name} Players\r`+
    '```'+homeStatsTxt+'```';
  const awayContent = `## ${awayTeam.name} Players\r`+
    '```'+awayStatsTxt+'```';
  
  return {
    content,
    embeds: [
      matchStatEmbed
    ],
    homeContent,
    awayContent
  }
}

export const formatDMMatch = async (league, homeTeam, awayTeam, match, homeLineup, awayLineup, isInternational, allPlayers) => {
  let response = `## PSAF Match starting\r`
  const embeds= []
  let homeFlags, awayFlags
  if(isInternational) {
    homeFlags = await getFlags(homeTeam)
    awayFlags = await getFlags(awayTeam)
    response += `\r${homeFlags} **${homeTeam.name} :vs: ${awayTeam.name}** ${awayFlags}`
  } else {
    homeFlags = homeTeam.flag
    awayFlags = awayTeam.flag
    response += `\r${homeFlags} ${homeTeam.disqualified?':no_entry_sign: ':''}${homeTeam.emoji} **${homeTeam.name}** :vs: **${awayTeam.name}** ${awayTeam.emoji}${awayTeam.disqualified?':no_entry_sign: ':''} ${awayFlags}`
  }
  if(match.password) {
    const lobbyEmbed = {
      type: 'rich',
      title: `<${league.emoji}> **| ${league.name}${match.group? ` ${match.group}` : ' '} ${match.matchday}** - <t:${match.dateTimestamp}:F>`,
      fields: []
    }
    lobbyEmbed.fields.push({name: 'Match Id', value: match._id.toString()})
    lobbyEmbed.fields.push({name: 'Lobby name', value: `PSAF ${homeTeam.name} vs ${awayTeam.name}`})
    lobbyEmbed.fields.push({name: 'Password', value: match.password})
    if(match.refs) {
      lobbyEmbed.fields.push({name: 'Referee(s)', value: match.refs.split(',').map(ref=> ref?`<@${ref}>`:'').join(', ')})
    } else {
      lobbyEmbed.fields.push({name: 'NO REFEREE', value: `${homeTeam.name} is responsible for creating the lobby. Don't forget to export stats at the end.`})
    }
    if(match.streamers) {
      lobbyEmbed.fields.push({name: 'Streamer(s)', value: match.streamers.split(',').map(ref=> ref?`<@${ref}>`:'').join(', ')})
    }
    embeds.push(lobbyEmbed)
  }
  const nonLineupAttributes = ['_id', 'team', 'matchId', 'vs']
  if(homeLineup) {
    const homeEmbed = {
      type: 'rich',
      title: `${homeFlags} ${homeTeam.emoji || ''} ${homeTeam.name}`,
      color: homeTeam.color,
    }
    const lineup = Object.fromEntries(
      Object.entries(homeLineup)
        .filter(([name])=> !nonLineupAttributes.includes(name))
        .map(([name, value])=> [name, {id: value, name: getPlayerNick(allPlayers.find(player=> player?.user?.id === value))}])
    )
    homeEmbed.description = formatDMLineup(lineup)
    embeds.push(homeEmbed)
  }
  if(awayLineup) {
    const awayEmbed = {
      type: 'rich',
      title: `${awayFlags} ${awayTeam.emoji || ''} ${awayTeam.name}`,
      color: awayTeam.color,
    }
    const lineup = Object.fromEntries(
      Object.entries(awayLineup)
        .filter(([name])=> !nonLineupAttributes.includes(name))
        .map(([name, value])=> [name, {id: value, name: getPlayerNick(allPlayers.find(player=> player?.user?.id === value))}])
    )
    awayEmbed.description = formatDMLineup(lineup)
    embeds.push(awayEmbed)
  }
  return {content:response, embeds}
}

export const internalCreateMatch = async ({league, home, away, isInternational=false, dateTimestamp, matchday, teams, matches, nationalTeams, seasonsCollect, leagueConfig, group, order}) => {
  const currentLeague = await leagueConfig.findOne({value: league})
  if(!currentLeague) {
    return `Can't find League ${league}.`
  }
  let response = `<${currentLeague.emoji}> **| ${currentLeague.name}${group? ` ${group}` : ' '} ${matchday}** - ${dateTimestamp ? `<t:${dateTimestamp}:F>` : 'No date'}`  
  const homeScore = '?'
  const awayScore = '?'
  let insertResult
  const season = await getCurrentSeason(seasonsCollect)
  console.log(home, away)
  const [homeTeam, awayTeam] = await getMatchTeams(home, away, isInternational, nationalTeams, teams)
  if(isInternational) {
    const homeFlag = await getFlags(homeTeam)
    const awayFlag = await getFlags(awayTeam)
    response += `\r> ${home === serverRoles.unknownTeam ? `<@&${home}>`:`${homeFlag} **${homeTeam.name}`} :vs: ${away === serverRoles.unknownTeam ? `<@&${away}>`:`${awayTeam.name}** ${awayFlag}`}`
  } else {
    response += `\r> ${homeTeam.flag} ${homeTeam.disqualified?':no_entry_sign: ':''}${homeTeam.emoji} <@&${homeTeam.id}> :vs: <@&${awayTeam.id}> ${awayTeam.emoji}${awayTeam.disqualified?':no_entry_sign: ':''} ${awayTeam.flag}`
  }
  response += `\r> ${homeScore} : ${awayScore}`
  const orderInsert = order ? {order} : {}
  
  insertResult = await matches.insertOne({
    home,
    away,
    dateTimestamp,
    league,
    matchday,
    homeScore,
    awayScore,
    isInternational,
    season,
    createdDate: Date.now(),
    group,
    ...orderInsert
  })
  response += `\rID: ${insertResult.insertedId}`
  const messageResp = await DiscordRequest(`/channels/${matchLogChannelId}/messages`, {
    method: 'POST',
    body: {
      content: response,
    }
  })
  const logResp = await messageResp.json()
  await matches.updateOne({_id: new ObjectId(insertResult.insertedId)}, {$set: {logId: logResp.id}})
  return response
}

const createMatch = async ({application_id, token, options, dbClient, isInternational}) => {
  const {home, away, league, matchday, date, timezone = 0, timestamp} = optionsToObject(options)
  let dateTimestamp = timestamp
  if(!dateTimestamp) {
    const parsedDate = parseDate(date, timezone)
    dateTimestamp = msToTimestamp(Date.parse(parsedDate))
  }
  const response = await dbClient(async ({teams, matches, nationalTeams, seasonsCollect, leagueConfig})=> {
    return internalCreateMatch({league, home, away, isInternational, dateTimestamp, matchday, teams, matches, nationalTeams, seasonsCollect, leagueConfig})
  })

  return updateResponse({application_id, token, content: response})
}

export const match = async ({application_id, token,  options, dbClient}) => {
  return createMatch({application_id, token, options, dbClient})
}

export const internationalMatch = async ({application_id, token, options, dbClient}) => {
  return createMatch({application_id, token, options, dbClient, isInternational: true})
}

export const matchId = async ({interaction_id, token, application_id, options, dbClient}) => {
  const {home, away} = optionsToObject(options)
  const currentSeason = getFastCurrentSeason()
  return dbClient(async ({matches, leagueConfig})=> {
    const allLeagues = await leagueConfig.find({}).toArray()
    const foundMatches = await matches.find({home, away}).sort({dateTimestamp: 1}).toArray()
    if(foundMatches.length === 0) {
      return silentResponse({interaction_id, token, content: `Match <@&${home}> - <@&${away}> not found`})
    }
    const matchPosts = foundMatches.map(({league, matchday, home, away, dateTimestamp, season, _id})=> ({
      content:`Season: ${season} ${allLeagues.find(fixLeague=>fixLeague.value === league)?.name || ''} ${matchday} <@&${home}> - <@&${away}> <t:${dateTimestamp}:F> ${_id}`,
      components: [{
        type: 1,
        components: [{
          type: 2,
          label: `Enter Result`,
          style: 2,
          custom_id: `match_result_${_id}`,
          disabled: currentSeason !== season
        },{
          type: 2,
          label: `Enter Exported Stats`,
          style: 3,
          custom_id: `match_stats_${_id}`,
          disabled: currentSeason !== season
        }]
      }]
    }))
    await silentResponse({interaction_id, token, content: 'Found matches: '});
    for await (const matchPost of matchPosts) {
      await followUpResponse({application_id, token, content: matchPost.content, components: matchPost.components})
    }
  })
}

export const editAMatchInternal = async ({id, home, away, league, matchday, date, timezone = 0, timestamp, teams, matches, nationalTeams, leagueConfig, order}) => {
  const matchId = new ObjectId(id)
  const match = await matches.findOne(matchId)
  if(!match) {
    return `Match ${id} not found`
  }
  const homeId = home || match.home
  const awayId = away || match.away
  const [homeTeam, awayTeam] = await getMatchTeams(homeId, awayId, match.isInternational, nationalTeams, teams)

  let dateTimestamp = match.dateTimestamp
  if(date || timestamp) {
    dateTimestamp = timestamp && timestamp.replace( /\D+/g, '')
    if(!dateTimestamp) {
      const parsedDate = parseDate(date, timezone)
      dateTimestamp = msToTimestamp(Date.parse(parsedDate))
    }
  }
  const leaguePick = league || match.league
  const currentLeague = await leagueConfig.findOne({value: leaguePick})
  if(!currentLeague) {
    return `League ${leaguePick} not found`
  }
  const matchDayPick = matchday || match.matchday
  const orderInsert = order ? {order} : {}
  const payloadToSet = {
    home: homeId,
    away: awayId,
    dateTimestamp,
    league: leaguePick,
    matchday: matchDayPick,
    password: null,
    ...orderInsert
  }
  await matches.updateOne({"_id": matchId}, {$set: payloadToSet})
  const updatedMatch = {...match, ...payloadToSet}
  const response = await updateMatch({currentLeague, homeTeam, awayTeam, match:updatedMatch})
  return response
}

export const editAMatch = async ({application_id, token, options, callerId, dbClient}) => {
  const optionsObj = optionsToObject(options)
  await postMessage({channel_id: serverChannels.botActivityLogsChannelId, content: `<@${callerId}> edited match ${optionsObj.id} : ${JSON.stringify(optionsObj)}`})
  const response = await dbClient(async ({teams, matches, nationalTeams, leagueConfig}) => {
    return editAMatchInternal({...optionsObj, teams, matches, nationalTeams, leagueConfig})
  })
  return updateResponse({application_id, token, content: `Updated \r`+response})
}

export const moveMatch = async ({interaction_id, application_id, token, options, callerId, dbClient}) => {
  await waitingMsg({interaction_id, token})
  return editMatch({application_id, token, options, callerId, dbClient})
}

// keeping space for divergences down the line. If v11 force a copy paste, get rid of the duplicates
export const editMatch = async ({application_id, token, options, callerId, dbClient}) => {
  return editAMatch({application_id, token, options, callerId, dbClient})
}

export const editInterMatch = async ({application_id, token, options, callerId, dbClient}) => {
  return editAMatch({application_id, token, options, callerId, dbClient})
}

export const internalEndMatch = async ({id, homeScore, awayScore, ff, dbClient, callerId}) => {
  const matchId = new ObjectId(id)
  return dbClient(async ({teams, matches, nationalTeams, leagueConfig}) => {
    const match = await matches.findOne(matchId)
    if(!match) {
      return `Match ${id} not found`
    }
    
    const [homeTeam, awayTeam] = await getMatchTeams(match.home, match.away, match.isInternational, nationalTeams, teams)
    
    const activeTeams = await teams.find({}).toArray()
    const currentLeague = await leagueConfig.findOne({value: match.league})
    await matches.updateOne({"_id": matchId}, {$set: {
      homeScore,
      awayScore,
      isFF: ff,
      finished: true,
      finishedBy: callerId
    }})
    const updatedMatch = await matches.findOne({"_id": matchId})
    console.log(updatedMatch)

    const winner = homeScore !== awayScore ? (homeScore>awayScore ? match.home: match.away) : undefined
    if(currentLeague.knockout && winner) {
      const stageIndex = elimMatchDaysSorted.findIndex(matchday=> matchday === updatedMatch.matchday)
      const matchOrder = (match.order || 0)
      const setPayload = {}
      if(matchOrder % 2 === 0){
        setPayload.home = winner
      } else {
        setPayload.away = winner
      }
      console.log(setPayload)
      console.log(match.league, stageIndex, elimMatchDaysSorted[stageIndex+1], Math.floor(matchOrder/2), matchOrder)
      const nextOrder = Math.floor(matchOrder/2)
      await matches.updateOne({league: match.league, matchday:elimMatchDaysSorted[stageIndex+1], order:nextOrder ? nextOrder: null}, {$set: setPayload})
      const nextMatch = await matches.findOne({league: match.league, matchday:elimMatchDaysSorted[stageIndex+1], order:nextOrder ? nextOrder: null})
      console.log('nextMatch')
      console.log(nextMatch)
      if(nextMatch) {
        const home = activeTeams.find(team=> team.id === nextMatch.home)
        const away = activeTeams.find(team=> team.id === nextMatch.away)
        const response = await updateMatch({currentLeague, homeTeam: home, awayTeam: away, match: nextMatch})
        console.log(response)
      }
    }
    const response = await updateMatch({currentLeague, homeTeam, awayTeam, homeScore, awayScore, match:updatedMatch, ff})
    return `Updated \r`+response
  })
}
export const internalEndMatchStats = async ({id, matchDetails, guild_id, callerId, dbClient}) => {
  const matchId = new ObjectId(id)
  const allPlayers = await getAllPlayers(guild_id)
  return dbClient(async ({teams, matches, nationalTeams, nationalContracts, players, playerStats, leagueConfig}) => {
    const match = await matches.findOne(matchId)
    if(!match) {
      return `Match ${id} not found`
    }
    const season = getFastCurrentSeason()
    
    const [homeTeam, awayTeam] = await getMatchTeams(match.home, match.away, match.isInternational, nationalTeams, teams)
    const activeTeams = await teams.find({}).toArray()
    //Trying to get the list of potential players...
    let matchPlayers
    if(match.isInternational) {
      console.log(homeTeam.name, awayTeam.name)
      const dbPlayers = await nationalContracts.find({season, selection: {$in: [homeTeam.shortname, awayTeam.shortname]}}).toArray()
      console.log(dbPlayers)
      const dbPlayerIds = dbPlayers.map(dbPlayer=>dbPlayer.playerId)
      matchPlayers = allPlayers.filter(player => dbPlayerIds.includes(player.user.id))
        .map(player=> ({...player, ingamename: dbPlayers.find(dbPlayer=> dbPlayer.id === player.user.id)?.ingamename || getPlayerNick(player)})).sort((a, b)=> b.ingamename.length - a.ingamename.length)
    } else {
      matchPlayers = allPlayers.filter(player=> player.roles.includes(match.home) || player.roles.includes(match.away))
      const dbPlayers = await players.find({$or: matchPlayers.map(player=> ({id: player.user.id}))}).toArray()
      matchPlayers = matchPlayers.map(player=> ({...player, ingamename: dbPlayers.find(dbPlayer=> dbPlayer.id === player.user.id)?.ingamename || getPlayerNick(player)})).sort((a, b)=> b.ingamename.length - a.ingamename.length)
    }
    console.log(matchPlayers)
  
    const shortHome = matchDetails.home.trim().toLowerCase().substring(0, 6)
    const shortAway = matchDetails.away.trim().toLowerCase().substring(0, 6)
    const isSwapped = homeTeam.name.toLowerCase().includes(shortAway) || awayTeam.name.toLowerCase().includes(shortHome)
    const homeScore = isSwapped ? matchDetails.awayScore : matchDetails.homeScore
    const awayScore = isSwapped ? matchDetails.homeScore : matchDetails.awayScore
    const homeStats = isSwapped ? matchDetails.awayStats : matchDetails.homeStats
    const awayStats = isSwapped ? matchDetails.homeStats : matchDetails.awayStats
    const homeLineup = isSwapped ? matchDetails.awayLineup : matchDetails.homeLineup
    const awayLineup = isSwapped ? matchDetails.homeLineup : matchDetails.awayLineup
    
    const homeEntries = Object.entries(homeLineup).map(([pos, stats])=> ({
        matchId: match._id,
        homeAway: 'home',
        team: match.home,
        pos,
        savedBy: callerId,
        ...stats,
        id: matchPlayers.find(player => player.ingamename.toLowerCase().includes(stats.name.substring(0, 15).toLowerCase()))?.user?.id
      })
    )
    const awayEntries = Object.entries(awayLineup).map(([pos, stats])=> ({
        matchId: match._id,
        homeAway: 'away',
        team: match.away,
        pos,
        savedBy: callerId,
        ...stats,
        id: matchPlayers.find(player => player.ingamename.toLowerCase().includes(stats.name.substring(0, 15).toLowerCase()))?.user?.id
      })
    )
    const statsToSave = [...homeEntries, ...awayEntries]
    
    const currentLeague = await leagueConfig.findOne({value: match.league})
    const channel = currentLeague.channel || currentLeague.value
    const updatedMatch = await matches.findOneAndUpdate({"_id": matchId}, {$set: {
      homeScore,
      awayScore,
      homeStats,
      awayStats,
      dateOfMatch: matchDetails.dateOfMatch,
      isFF: false,
      finished: true,
      finishedBy: callerId
    }}, {returnDocument: ReturnDocument.AFTER})
    console.log(updatedMatch)
    await playerStats.deleteMany({matchId})
    await playerStats.insertMany(statsToSave)
    
    const winner = homeScore !== awayScore ? (homeScore>awayScore ? match.home: match.away) : undefined
    if(currentLeague.knockout && winner) {
      const stageIndex = elimMatchDaysSorted.findIndex(matchday=> matchday === updatedMatch.matchday)
      const matchOrder = (match.order || 0)
      const setPayload = {}
      if(matchOrder % 2 === 0){
        setPayload.home = winner
      } else {
        setPayload.away = winner
      }
      console.log(setPayload)
      console.log(match.league, stageIndex, elimMatchDaysSorted[stageIndex+1], Math.floor(matchOrder/2), matchOrder)
      const nextOrder = Math.floor(matchOrder/2)
      await matches.updateOne({season, league: match.league, matchday:elimMatchDaysSorted[stageIndex+1], order:nextOrder ? nextOrder: null}, {$set: setPayload})
      const nextMatch = await matches.findOne({season, league: match.league, matchday:elimMatchDaysSorted[stageIndex+1], order:nextOrder ? nextOrder: null})
      console.log('nextMatch')
      console.log(nextMatch)
      if(nextMatch) {
        const home = activeTeams.find(team=> team.id === nextMatch.home)
        const away = activeTeams.find(team=> team.id === nextMatch.away)
        const response = await updateMatch({currentLeague, homeTeam: home, awayTeam: away, match: nextMatch})
        console.log(response)
      }
    }

    const [post, extra] = await formatMatch(currentLeague, homeTeam, awayTeam, {...updatedMatch, homeScore, awayScore})
    const response = post + extra
    const {content, embeds, homeContent, awayContent} = await formatMatchResult(currentLeague, homeTeam, awayTeam, updatedMatch, callerId, homeEntries, awayEntries)
    await updateMatchMessage({match, channel, post, content: post+'\r'+content})
    await postMessage({channel_id: serverChannels.matchResultsChannelId, content, embeds})
    await postMessage({channel_id: serverChannels.matchResultsChannelId, content: homeContent})
    await postMessage({channel_id: serverChannels.matchResultsChannelId, content: awayContent})
    return `Updated \r`+response
  })
}

export const resetMatch = async ({token, application_id, options, dbClient}) => {
  const {id} = optionsToObject(options)

  const matchId = new ObjectId(id)
  const content = await dbClient(async ({teams, matches, nationalTeams, leagueConfig}) => {
    const match = await matches.findOne(matchId)
    if(!match) {
      return `Match ${id} not found`
    }
    const currentLeague = await leagueConfig.findOne({value: match.league})
    const [homeTeam, awayTeam] = await getMatchTeams(match.home, match.away, match.isInternational, nationalTeams, teams)

    const channel = currentLeague.channel || currentLeague.value
    const resetValues = {
      homeScore: '?',
      awayScore: '?',
      isFF: null,
      finished: null
    }
    const updatedMatch = await matches.findOneAndUpdate({"_id": matchId}, {$set: resetValues})
    const [post, extra] = await formatMatch(currentLeague, homeTeam, awayTeam, {...updatedMatch, ...resetValues})
    const response = post + extra
    updateMatchMessage({match, channel, post, content: response})
    return `Match has been reset \r`+response
  })
  return updateResponse({application_id, token, content})
}

export const internalPublishMatch = async ({league, matchday, postping=true, seasonsCollect, teams, matches, nationalTeams, matchDays, leagueConfig}) => {
  const currentLeague = await leagueConfig.findOne({value:league, active: true})
  if(!currentLeague) {
    return `Cannot find League ${currentLeague}. Please check if the league is active and you entered your choice correctly.`
  }
  const channel = currentLeague.channel || currentLeague.value
  const season = await getCurrentSeason(seasonsCollect)
  const matchDay = await matchDays.findOne({league, season, matchday})
  let imageMessageId = null
  if(matchDay && matchDay.posted !== true ) {
    const imageToPost = matchDay?.image || currentLeague.defaultImage
    if(imageToPost) {
      const resp = await DiscordRequest(`/channels/${channel}/messages`, {
        method: 'POST',
        body: {
          content: imageToPost,
        }
      })
      const postResp = await resp.json()
      imageMessageId = postResp.id
    }
  }
  const [allTeams, allNationalTeams] = await Promise.all([teams.find({}).toArray(), nationalTeams.find({}).toArray()])
  const matchCursor = matches.find({league, matchday, season, messageId: null}, {sort: {dateTimestamp: 1}})
  let matchCount = 0
  for await (const match of matchCursor) {
    const [homeTeam, awayTeam] = getMatchTeamsSync(match.home, match.away, match.isInternational, allNationalTeams, allTeams)   
    const [matchContent] = await formatMatch(currentLeague, homeTeam, awayTeam, match)
    const messageResp = await postMessage({channel_id: channel, content: matchContent})
    const message = await messageResp.json()
    await matches.updateOne({_id: match._id}, {$set: {messageId: message.id}})
    if(match.isInternational) {
      /*const [homeFlag, awayFlag] = await Promise.all([getFlags(homeTeam), getFlags(awayTeam)])
      await DiscordRequest(`/channels/${message.channel_id}/messages/${message.id}/reactions/${homeFlag}/@me`, {method: 'PUT', body:{}})
      await sleep(300)
      await DiscordRequest(`/channels/${message.channel_id}/messages/${message.id}/reactions/🇽/@me`, {method: 'PUT', body:{}})
      await sleep(300)
      await DiscordRequest(`/channels/${message.channel_id}/messages/${message.id}/reactions/${awayFlag}/@me`, {method: 'PUT', body:{}})*/
    } else {
      const [,homeEmoji, homeEmojiId] = homeTeam.emoji.split(':')
      const [,awayEmoji, awayEmojiId] = awayTeam.emoji.split(':')
      await DiscordRequest(`/channels/${message.channel_id}/messages/${message.id}/reactions/${homeEmoji}:${homeEmojiId.substring(0, homeEmojiId.length -1)}/@me`, {method: 'PUT', body:{}})
      await sleep(300)
      await DiscordRequest(`/channels/${message.channel_id}/messages/${message.id}/reactions/🇽/@me`, {method: 'PUT', body:{}})
      await sleep(300)
      await DiscordRequest(`/channels/${message.channel_id}/messages/${message.id}/reactions/${awayEmoji}:${awayEmojiId.substring(0, awayEmojiId.length -1)}/@me`, {method: 'PUT', body:{}})
    }
    matchCount++
    //forced to wait otherwise we get blocked by the API limits
    await sleep(500)
  }
  let endMessageId = null
  if(postping) {
    const pingRole = currentLeague.pingRole ? (currentLeague.pingRole === 'everyone' ? '@everyone': `<@&${currentLeague.pingRole}>`):'Everyone'
    const endMessage = `[ ${pingRole} ]--[ **${currentLeague.name}** | VOTE YOUR WINNERS! ]`
    const resp = await DiscordRequest(`/channels/${channel}/messages`, {
      method: 'POST',
      body: {
        content: endMessage,
      }
    })
    const endMessageResp = await resp.json()
    endMessageId = endMessageResp.id
  }
  await Promise.all([
    matchDays.updateOne({league, matchday}, {$set: {posted:true, imageMessageId, endMessageId}}),
    leagueConfig.updateOne({value: league}, {$set: {currentMatchDay: matchday}})
  ])
  return `Posted ${matchCount} matches.`
}

export const unpublishMatch = async ({member, interaction_id, token, application_id, options, dbClient}) => {
  if(!member.roles.find(role=>isTopAdminRole(role))) {
    return quickResponse({interaction_id, token, content: 'Command restricted', isEphemeral: true})
  }
  await waitingMsg({interaction_id, token})
  const {league, matchday} = optionsToObject(options)
  const content = await dbClient(async({matches, seasonsCollect, matchDays, leagueConfig})=> {
    const currentLeague = await leagueConfig.findOne({value: league})
    if(!currentLeague) {
      return `Cannot find the League ${league}`
    }
    const channel = currentLeague.channel || currentLeague.value
    const season = await getCurrentSeason(seasonsCollect)
    const matchDay = await matchDays.findOne({league, season, matchday})
    if(matchDay){
      console.log(matchDay)
      if(matchDay.imageMessageId) {
        await deleteMessage({channel_id: channel, messageId: matchDay.imageMessageId})
      }
      if(matchDay.endMessageId) {
        await deleteMessage({channel_id: channel, messageId: matchDay.endMessageId})
      }
    }
    const matchCursor = matches.find({league, matchday, season, messageId: {$ne: null}}, {sort: {dateTimestamp: 1}})
    let matchCount = 0
    for await (const match of matchCursor) {
      try{
        console.log(match)
        await deleteMessage({channel_id:channel, messageId: match.messageId})
      } catch (e) {
        console.log('Failed to delete message')
        console.log(e.message)
      }
      await matches.updateOne({_id:match._id}, {$set: {messageId:null}})
      matchCount++
      sleep(500)
    }
    await matchDays.updateOne({league, matchday}, {$set: {posted:false, imageMessageId:null, endMessageId:null}})
    return `${currentLeague.name} ${matchday} cleared. ${matchCount} matches unposted.`
  })
  return updateResponse({application_id, token, content})
}

export const publishMatch = async ({interaction_id, token, application_id, options, dbClient}) => {
  const {league, matchday, postping} = optionsToObject(options)
  await waitingMsg({interaction_id, token})
  const content = await dbClient(async ({teams, matches, nationalTeams, matchDays, seasonsCollect, leagueConfig}) => 
    internalPublishMatch({league, matchday, postping, teams, matches, matchDays, nationalTeams, seasonsCollect, leagueConfig})
  )

  return updateResponse({application_id, token, content})
}

export const getMatchesSummary = async({dbClient}) => {
  const matchesData = await getMatchesOfDay({forSite: true, finished: true, dbClient})
  const timestamp = msToTimestamp(Date.now())
  const messages = [`# <t:${timestamp}:d> Results`]
  const allLeagues = await getAllLeagues()
  const leagues = new Array(allLeagues.length)
  matchesData.forEach((match => {
    const indexToAdd = allLeagues.findIndex((league) => league.name === match.league.name)
    leagues[indexToAdd] = [...(leagues[indexToAdd]||[]), match]
  }))
  
  leagues.forEach((leagueMatches, index) => {
    if(leagueMatches?.length > 0) {
      const message = `## ${allLeagues[index].name} <${allLeagues[index].emoji}>\r`
      const matchesMessage = leagueMatches.map(({isInternational, homeTeam, awayTeam, homeFlag, awayFlag, homeLineup, awayLineup, homeScore, awayScore, isFF}) => (
        isInternational ? (
          `> ${homeFlag} **${homeTeam.name} ${homeScore} : ${awayScore}${isFF ? ' **ff**': ''} ${awayTeam.name}** ${awayFlag}`
        ) : (
          `> ${homeTeam.flag} ${homeTeam.emoji}${homeLineup ? '✅' : '❓'} <@&${homeTeam.id}> ${homeScore} : ${awayScore}${isFF ? ' **ff**': ''} <@&${awayTeam.id}> ${awayLineup ? '✅' : '❓'}${awayTeam.emoji} ${awayTeam.flag}`
        )
      )).join('\r')
      messages.push(message+matchesMessage)
    }
  })
  return messages
}

const postRefStats = async ({options, channel_id, interaction_id, token, dbClient}) => {
  const {season} = optionsToObject(options)
  const content = await getRefStatsPost({season, dbClient})
  await silentResponse({interaction_id, token, content:'Posting...'})
  return postMessage({channel_id, content})
}

export const updateCurrentRefStatsPost = async ({dbClient}) => {
  const {content, msgRefStats} = await getRefStatsPost({dbClient})
  if(msgRefStats) {
    await updatePost({channel_id: serverChannels.seasonStats, messageId: msgRefStats, content})
  }
}

export const getRefStatsPost = async ({season, dbClient}) => {
  const {refs, msgRefStats, seasonReturned} = await getRefStatsLeaderboard({season, dbClient})
  return {content: `## Season ${seasonReturned}\rMatch result stats:\r`+refs.map(ref=> `<@${ref._id}>: ${ref.finishedCount}`).join('\r'), msgRefStats}
}

export const getRefStatsLeaderboard = async ({season, dbClient}) => {
  /*const parsedDate = parseDate('Today')
  const startOfDay = new Date(parsedDate)
  const endParsedDate = parseDate('7 days ago')
  const endOfDay = new Date(endParsedDate)
  const startDateTimestamp = msToTimestamp(Date.parse(startOfDay))
  const endDateTimestamp = msToTimestamp(Date.parse(endOfDay))*/
  return dbClient(async ({matches, seasonsCollect}) => {
    let seasonToFind = season || getFastCurrentSeason()
    let selectedSeason = await seasonsCollect.findOne({season: seasonToFind})

    const refs = await matches.aggregate([
      {
        $match: {
          season: seasonToFind,
          finished: true, 
          finishedBy: {
            '$ne': null
          },
          //dateTimestamp: { $gt: startDateTimestamp, $lt: endDateTimestamp}
        }
      }, {
        $group: {
          '_id': '$finishedBy',
          'finishedCount': {
            '$count': {}
          }
        }
      }, {
        $sort: {
          'finishedCount': -1
        }
      }
    ]).toArray()
    return {refs, msgRefStats: selectedSeason?.msgRefStats, seasonReturned: seasonToFind}
  })
}

export const getMatchesOfDay = async ({date='today', finished=false, dbClient, forSite= false, isSchedule = false}) => {
  const parsedDate = parseDate(date)
  const startOfDay = new Date(parsedDate)
  startOfDay.setUTCHours(0,0,0,0)
  const endOfDay = new Date(parsedDate)
  endOfDay.setUTCHours(23,59,59,999)
  const startDateTimestamp = msToTimestamp(Date.parse(startOfDay))
  const endDateTimestamp = msToTimestamp(Date.parse(endOfDay))
  
  return dbClient(async ({teams, matches, nationalTeams, lineups}) => {
    const finishedArg = forSite ? {} : (finished ? {finished: true} : {$or: [{finished:false}, {finished:null}]})
    let lineupsOfDay = []
    const [allTeams, allNationalTeams, matchesOfDay, allNationalities] = await Promise.all([
      teams.find({}).toArray(),
      nationalTeams.find({}).toArray(),
      matches.find({dateTimestamp: { $gt: startDateTimestamp, $lt: endDateTimestamp}, ...finishedArg}).sort({dateTimestamp:1}).toArray(),
      getAllNationalities(),
    ])
    const allLeagues = await getAllLeagues()
    if(forSite) {
      lineupsOfDay = await lineups.find({matchId: {$in: matchesOfDay.map(match=> match._id.toString())}}).toArray()
    }
    if(forSite){
      return matchesOfDay.map(match => {
        const [homeTeam, awayTeam] = getMatchTeamsSync(match.home, match.away, match.isInternational, allNationalTeams, allTeams)
        const league = allLeagues.find(({value})=> value === match.league)
        const homeLineup = lineupsOfDay.find(lineup => lineup.matchId === match._id.toString() && match.home === lineup.team)
        const awayLineup = lineupsOfDay.find(lineup => lineup.matchId === match._id.toString() && match.away === lineup.team)
        const homeFlag = match.isInternational ? allNationalities.filter(nationality=> homeTeam.eligibleNationalities.includes(nationality.name)).map(nat=>nat.flag).join('') : ''
        const awayFlag = match.isInternational ? allNationalities.filter(nationality=> awayTeam.eligibleNationalities.includes(nationality.name)).map(nat=>nat.flag).join('') : ''
        return {
          ...match,
          homeLineup,
          awayLineup,
          homeTeam,
          awayTeam,
          homeFlag,
          awayFlag,
          league,
        }
      })
    } else {
      const headerLine = {content: `${matchesOfDay.length} match${matchesOfDay.length >1?'es':''} on <t:${startDateTimestamp}:d>.`}
      let response = [{matchToPush: headerLine, streamerMatch: headerLine}]
      for (const match of matchesOfDay) {
        const [homeTeam, awayTeam] = getMatchTeamsSync(match.home, match.away, match.isInternational, allNationalTeams, allTeams)
        const channels = []
        if(homeTeam.channel){
          channels.push(homeTeam.channel)
        }
        if(awayTeam.channel) {
          channels.push(awayTeam.channel)
        }
        const currentLeague = allLeagues.find(({value})=> value === match.league)
        const [post, extra] = await formatMatch(currentLeague, homeTeam, awayTeam, match)
        const content = post+extra
        const matchToPush = {
          content,
          matchId: match._id.toString(),
          shortName: `${homeTeam.name} vs ${awayTeam.name}`,
          channels,
          components: [{
          type: 1,
          components: [{
            type: 2,
            label: `Referee`,
            style: 1,
            custom_id: `referee_${match._id}`
          }, {
            type: 2,
            label: `Enter Result`,
            style: 1,
            custom_id: `match_result_${match._id}`
          },{
            type: 2,
            label: `Enter Exported Stats`,
            style: 3,
            custom_id: `match_stats_${match._id}`
          }, {
            type: 2,
            label: `Streamer`,
            style: 1,
            custom_id: `streamer_${match._id}`
          }]
        }]}
        const streamerMatch = {
          content,
          matchId: match._id.toString(),
          shortName: `${homeTeam.name} vs ${awayTeam.name}`,
          channels,
          components: [{
          type: 1,
          components: [{
            type: 2,
            label: `Streamer`,
            style: 1,
            custom_id: `streamer_${match._id}`
          }]
        }]}
        response.push({matchToPush, streamerMatch})
      }
      if(isSchedule) {
        const channelsToPush = new Map()
        for await (const oneResp of response) {
          const {matchToPush, streamerMatch} = oneResp
          const {matchId, content, shortName, components, channels} = matchToPush
          const body = matchId ? {
            content,
            components
          } : {
            content
          }
          const streamerBody = matchId ? {
            content: streamerMatch.content,
            components: streamerMatch.components
          } : {
            content: streamerMatch.content
          }
          const messageResp = await DiscordRequest(`/channels/${serverChannels.scheduleChannelId}/messages`, {
            method: 'POST',
            body
          })
          const message = await messageResp.json()
          const streamMessageResp = await postMessage({...streamerBody, channel_id: serverChannels.streamersChannelId})
          const streamMessage = await streamMessageResp.json()
          if(shortName) {
            const threadResp = await DiscordRequest(`/channels/${serverChannels.scheduleChannelId}/messages/${message.id}/threads`, {
              method: 'POST',
              body: {
                name: shortName
              }
            })
            const thread = await threadResp.json()
            await matches.updateOne({_id: new ObjectId(matchId)}, {$set: {scheduleMessage: message.id, streamMessage: streamMessage.id, thread: thread.id}})
            await DiscordRequest(`/channels/${thread.id}/messages`, {
              method: 'POST',
              body: {
                content: 'Thread with lineups and scheduling:'
              }
            })
          }
          
          if(channels) {
            for (const channel of channels) {
              const currentChannel = channelsToPush.get(channel) || []
              channelsToPush.set(channel, [content, ...currentChannel])
            }
          }
        }
        for await (const [channel, contents] of Array.from(channelsToPush)) {
          await postMessage({channel_id:channel, content:'Matches of the day:'})
          await sleep(500)
          for await (const content of contents) {
            await postMessage({channel_id: channel, content})
            await sleep(500)
          }
        }
      }
      return response
    }
  })
  
}

export const getPastMatches = async ({dbClient}) => {
  const now = msToTimestamp(Date.now())
  
  return await dbClient(async ({teams, matches, nationalTeams}) => {
    const finishedArg = {$or: [{finished:false}, {finished:null}]}
    const allTeams = await teams.find({}).toArray()
    const allNationalTeams = await nationalTeams.find({}).toArray()
    const matchesOfDay = await matches.find({dateTimestamp: { $lt: now}, ...finishedArg}).sort({dateTimestamp:1}).toArray()
    let response = [{content: `${matchesOfDay.length} unfinished match${matchesOfDay.length >1?'es':''} on <t:${now}:d>.`}]
    for (const match of matchesOfDay) {
      const [homeTeam, awayTeam] = getMatchTeamsSync(match.home, match.away, match.isInternational, allNationalTeams, allTeams)
      const allLeagues = await getAllLeagues()
      const currentLeague = allLeagues.find(({value})=> value === match.league)
      const [post, extra] = await formatMatch(currentLeague, homeTeam, awayTeam, match)
      response.push({content: post + extra, matchId: match._id.toString()})
    }
    return response
  })
}

const nonMatchAttributes = ['_id', 'matchId', 'team', 'name']
const toViewLineup = (rawLineup={}, allPlayers, lineupStats) => (
  Object.fromEntries(
    Object.entries(rawLineup)
    .filter(([key])=> !nonMatchAttributes.includes(key))
    .map(([key, value])=> (
      [
        key, {
          id: value,
          name: getPlayerNick(allPlayers.find(player=> player?.user?.id === value)),
          ...(lineupStats.find(playerStat => playerStat.id === value) || {})
        }
      ]
    ))
  )
)

export const getMatch = async ({id, dbClient}) => {
  const allPlayers = await getAllPlayers(process.env.GUILD_ID)
  return await dbClient(async({teams, matches, nationalTeams, lineups, playerStats}) => {
    const matchId = new ObjectId(id)
    const match = await matches.findOne({_id: matchId})
    const matchLineups = await lineups.find({matchId: id}).toArray()
    const lineupStats = await playerStats.find({matchId: id}).toArray()

    const allNationalTeams = await nationalTeams.find({}).toArray()
    const allTeams = await teams.find().toArray()
    const [homeTeam, awayTeam] = getMatchTeamsSync(match.home, match.away, match.isInternational, allNationalTeams, allTeams)
    const homeRawLineup = matchLineups.find(lineup=> lineup.team === homeTeam.id)
    const awayRawLineup = matchLineups.find(lineup=> lineup.team === awayTeam.id)
    const allLeagues = await getAllLeagues()
    const league = allLeagues.find(({value})=> value === match.league)
    const homeLineup = toViewLineup(homeRawLineup, allPlayers, lineupStats)
    const awayLineup = toViewLineup(awayRawLineup, allPlayers, lineupStats)
    return {match, homeTeam, awayTeam, league, allNationalTeams, homeLineup, awayLineup}
  })
}

export const saveMatchStats = async ({id, dbClient, callerId, matchStats}) => {
  const positions = {}
  Object.entries(matchStats).forEach(([key, value])=> {
    const [homeAway, pos, attr] = key.split('_')
    if(attr) {
      let position = positions[`${homeAway}_${pos}`] || {homeAway, pos, matchId: id, savedBy: callerId}
      if(attr !== 'rating' || (homeAway === 'home' && matchStats.homeRating) || (homeAway === 'away' && matchStats.awayRating)) {
        position[attr] = value
      }
      positions[`${homeAway}_${pos}`] = position
    }
  })
  
  const toUpdate = Object.entries(positions).map(([, value])=> value)
  await dbClient(async({playerStats}) => {
    await Promise.all( toUpdate.map(playerStat => playerStats.replaceOne({
      id: playerStat.id, 
      matchId: id,
    }, playerStat, {upsert: true})))
  })
  console.log('done')
}

export const remindMissedMatches = async ({dbClient}) => {
  const response = await getPastMatches({dbClient})
  if(response.length>1) {
    await postMessage({channel_id: serverChannels.scheduleChannelId, content:`# The following matches have been missed and needs to be updated/filled in:`})
    for await (const match of response) {
      await postMessage({
        channel_id: serverChannels.scheduleChannelId,
        content: match.content,
        components: match.matchId ? [{
          type: 1,
          components: [{
            type: 2,
            label: `Enter Result`,
            style: 1,
            custom_id: `match_result_${match.matchId}`
          },{
            type: 2,
            label: `Enter Exported Stats`,
            style: 3,
            custom_id: `match_stats_${match.matchId}`
          }]
        }]: [],
      })
    }
  } else {
    await postMessage({channel_id: serverChannels.scheduleChannelId, content: `## All the matches for today are filled, thanks!`})
  }
}

export const pastMatches = async ({interaction_id, token, application_id, dbClient}) => {
  const response = await getPastMatches({dbClient})
  console.log(response.length)
  if(response.length>0) {
    await quickResponse({interaction_id, token, content: response[0].content})
  }
  await response.forEach(async ({content}, index) => {
    if(index>0) {
      console.log(content)
      await DiscordRequest(`/webhooks/${application_id}/${token}`, {
        method: 'POST',
        body: {
          content: content,
          flags: 0
        }
      })
    }
  });
}

export const matches = async ({interaction_id, token, application_id, options=[], dbClient}) => {
  const {date = "today", post} = optionsToObject(options)
  const response = await getMatchesOfDay({date, dbClient})
  /*if(response.length===0) {
    await quickResponse({interaction_id, token, content: response[0].content, isEphemeral: !post})
  }*/
  if(post) {
    await postWaiting({interaction_id, token})
  } else {
    await waitingMsg({interaction_id, token})
  }
  let index = 0
  for await (const matchContent of response) {
    const {matchToPush} = matchContent
    const {content, components} = matchToPush
    console.log(content, components)
    if(index>0) {
      if(post) {
        await publicFollowUpResponse({application_id, token, content, components })
      } else {
        await followUpResponse({application_id, token, content, components})
      }
    } else {
      if(post) {
        await publicFollowUpResponse({application_id, token, content, components })
      } else {
        await updateResponse({application_id, token, content, components})
      }
    }
    index++
  }
}

const matchCmd = {
  name: 'match',
  description: 'Enter a match',
  type: 1,
  psaf: true,
  func: match,
  options: [{
    type: 8,
    name: 'home',
    description: 'Home Team',
    required: true
  },{
    type: 8,
    name: 'away',
    description: 'Away Team',
    required: true
  },{
    type: 3,
    name: 'league',
    description: 'League',
    required: true,
    autocomplete: true,
  },{
    type: 3,
    name: 'matchday',
    description: "The matchday, or competition stage",
    choices: matchDays.slice(0,24),
    required: true
  },{
    type: 3,
    name: 'date',
    description: "The date planned for the match (UK timezone by default)",
  },{
    type: 4,
    name: 'timezone',
    description: "Which timezone to apply",
    choices: [{
      name: "UK",
      value: "0"
    }, {
      name: "Central Europe",
      value: "1"
    }, {
      name: "Turkey",
      value: "2"
    }]
  },{
    type: 3,
    name: 'timestamp',
    description: "The exact timestamp for the game (use either date or this)",
  },{
    type: 4,
    name: 'order',
    description: "The order to display the match in an elim tree (quarters are 1-4, semis are 1-2)"
  }]
}


const selectionMatchSubCommands = {
  'create': internationalMatch,
  'edit': editInterMatch,
}

const clubMatchSubCommands = {
  'create': match,
  'edit': editMatch,
  'reset': resetMatch,
}

const selectionMatch = async (commandOptions) => 
  handleSubCommands(commandOptions, selectionMatchSubCommands)

const clubMatch = async (commandOptions) => 
  handleSubCommands(commandOptions, clubMatchSubCommands)

const internationalMatchCmd = {
  name: 'intermatch',
  description: 'Enter an international match',
  type: 1,
  options: [{
    type: 3,
    name: 'home',
    description: 'Home Team',
    autocomplete: true,
    required: true,
  },{
    type: 3,
    name: 'away',
    description: 'Away Team',
    autocomplete: true,
    required: true,
  },{
    type: 3,
    name: 'league',
    description: 'League',
    required: true,
    autocomplete: true,
  },{
    type: 3,
    name: 'matchday',
    description: "The matchday, or competition stage",
    choices: matchDays.slice(0,24),
    required: true
  },{
    type: 3,
    name: 'date',
    description: "The date planned for the match (UK timezone by default)",
  },{
    type: 4,
    name: 'timezone',
    description: "Which timezone to apply",
    choices: [{
      name: "UK",
      value: "0"
    }, {
      name: "Central Europe",
      value: "1"
    }, {
      name: "Turkey",
      value: "2"
    }]
  },{
    type: 3,
    name: 'timestamp',
    description: "The exact timestamp for the game (use either date or this)",
  }]
}

const editMatchCmd = {
  name: 'editmatch',
  description: 'Update a match',
  type: 1,
  options: [
    {
      type: 3,
      name: 'id',
      description: "The Match ID to modify",
      required: true
    },
    ...matchCmd.options.map(option => ({
      ...option,
      required: false
    }))
  ]
}

const editInternationalMatchCmd = {
  name: 'editintermatch',
  description: 'Update an international match',
  type: 1,
  options: [
    {
      type: 3,
      name: 'id',
      description: "The Match ID to modify",
      required: true
    },
    ...internationalMatchCmd.options.map(option => ({
      ...option,
      required: false
    }))
  ]
}


const resetMatchCmd = {
  name: 'resetmatch',
  description: 'Reset a match',
  type: 1,
  options: [
    {
      type: 3,
      name: 'id',
      description: "The Match ID to modify",
      required: true
    }
  ]
}
const selectionMatchCmd = {
  name: 'selectionmatch',
  description: 'Commands for national selection matches',
  psaf: true,
  func: selectionMatch,
  options: [
    {
      ...internationalMatchCmd,
      name: 'create'
    },
    {
      ...editInternationalMatchCmd,
      name: 'edit'
    }, {
      ...resetMatchCmd,
      name: 'reset'
    }
  ]
}

const clubMatchCmd = {
  name: 'clubmatch',
  description: 'Commands for Club matches',
  psaf: true,
  func: clubMatch,
  options: [
    {
      ...matchCmd,
      name: 'create'
    },{
      ...editMatchCmd,
      name: 'edit'
    }, {
      ...resetMatchCmd,
      name: 'reset'
    }
  ]
}

const moveTheMatchCmd = {
  name: 'movethematch',
  description: 'Update a match date',
  type: 1,
  psaf: true,
  func: moveMatch,
  options: [
    {
      type: 3,
      name: 'id',
      description: "The Match ID to modify",
      required: true
    },{
      type: 3,
      name: 'date',
      description: "The date/time planned for the match (UK timezone by default), you can do Tomorrow 18:00",
    },{
      type: 4,
      name: 'timezone',
      description: "Which timezone to apply",
      choices: [{
        name: "UK",
        value: "0"
      }, {
        name: "Central Europe",
        value: "1"
      }, {
        name: "Turkey",
        value: "2"
      }]
    },{
      type: 3,
      name: 'timestamp',
      description: "The exact timestamp for the game (use either date or this)",
    }
  ]
}

const publishMatchCmd = {
  name: 'publishmatch',
  description: 'Publish a matchday',
  type: 1,
  psaf: true,
  func: publishMatch,
  options: [
    {
      type: 3,
      name: 'league',
      description: 'League',
      required: true,
      autocomplete: true,
    },{
      type: 3,
      name: 'matchday',
      description: "The matchday, or competition stage",
      choices: matchDays.slice(0,24),
      required: true
    },{
      type: 5,
      name: 'postping',
      description: "Post the ping in the channel?"
    }
  ]
}

const unPublishMatchCmd = {
  name: 'unpublishmatch',
  description: 'Unpublish a matchday -- WARNING DON\'T TOUCH',
  type: 1,
  psaf: true,
  func: unpublishMatch, 
  options: [
    {
      type: 3,
      name: 'league',
      description: 'League',
      required: true,
      autocomplete: true,
    },{
      type: 3,
      name: 'matchday',
      description: "The matchday, or competition stage",
      choices: matchDays.slice(0,24),
      required: true
    }
  ]
}

const matchIdCmd = {
  name: 'matchid',
  description: 'Get a match\'s ID',
  type: 1,
  psaf: true,
  func: matchId,
  options: [{
    type: 8,
    name: 'home',
    description: 'Home Team',
    required: true
  },{
    type: 8,
    name: 'away',
    description: 'Away Team',
    required: true
  }]
}

const matchesCmd = {
  name: 'matches',
  description: 'List the matches on a day',
  type: 1,
  psaf: true,
  func: matches,
  options: [
    {
      type: 3,
      name: 'date',
      description: "The day you're looking for (UK timezone)"
    },
    {
      type: 5,
      name: 'post',
      description: "Post the matches in the channel?"
    }
  ]
}

const pastMatchesCmd = {
  name: 'pastmatches',
  psaf: true,
  func: pastMatches,
  description: 'List all the unresolved past matches',
  type: 1
}

const postRefStatsCmd = {
  name: 'postrefstats',
  description: 'Post the referee stats',
  type: 1,
  psaf: true,
  func: postRefStats,
  options: [{
    type: 4,
    name: 'season',
    description: "The season to post the stats for",
    required: true,
    min_value: 1,
    max_value: 20
  }]
}

export default [
  clubMatchCmd, selectionMatchCmd,
  moveTheMatchCmd,
  matchesCmd, pastMatchesCmd, matchIdCmd,
  publishMatchCmd, unPublishMatchCmd, postRefStatsCmd
]