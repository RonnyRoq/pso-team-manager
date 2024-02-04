import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions";
import { ObjectId, ReturnDocument } from "mongodb";
import { fixturesChannels, matchDays, serverChannels } from "../config/psafServerConfig.js";
import { getCurrentSeason, getPlayerNick, msToTimestamp, optionsToObject, updateResponse, waitingMsg } from "../functions/helpers.js";
import { DiscordRequest } from "../utils.js";
import { sleep } from "../functions/helpers.js";
import { parseDate } from "./timestamp.js";
import { formatDMLineup } from "./lineup.js";
import { getAllPlayers } from "../functions/playersCache.js";

const matchLogChannelId = '1151131972568092702'

export const formatMatch = (league, homeTeam, awayTeam, match, showId, isInternational) => {
  let response = `<${league.emoji}> **| ${league.name} ${match.matchday}** - ${match.dateTimestamp ? `<t:${match.dateTimestamp}:F>` : 'No date'}`
  if(isInternational) {
    response += `\r> ${homeTeam.flag} **${homeTeam.name} :vs: ${awayTeam.name}** ${awayTeam.flag}`
  } else {
    response += `\r> ${homeTeam.flag} ${homeTeam.disqualified?':no_entry_sign: ':''}${homeTeam.emoji} <@&${homeTeam.id}> :vs: <@&${awayTeam.id}> ${awayTeam.emoji}${awayTeam.disqualified?':no_entry_sign: ':''} ${awayTeam.flag}`
  }
  response += `\r> ${match.homeScore} : ${match.awayScore}${match.isFF ? ' **ff**': ''}`
  if(showId) {
    response += `\rID: ${match._id}`
    if(match.refs) {
      const refsArray = match.refs.split(',')
      response += '\r'+refsArray.map(ref=> `<@${ref}>`).join(', ')
    }
  }
  return response
}

export const formatMatchResult = (homeTeam, awayTeam, match, callerId, homeEntries, awayEntries) => {
  let content = '# '
  if(match.isInternational) {
    content += `${homeTeam.flag} **${homeTeam.name} ${match.homeScore} - ${match.awayScore} ${awayTeam.name}** ${awayTeam.flag}`
  } else {
    content += `${homeTeam.emoji} ${homeTeam.name} ${match.homeScore} - ${match.awayScore} ${awayTeam.name} ${awayTeam.emoji}`
  }
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
  const playerMap = (playerStats) => `${playerStats.pos.padStart(5)} | ${playerStats.name.substring(0, 18).padEnd(18)}${playerStats.id? '✅': '🔍'} | ${playerStats.Score.padStart(5)} | ${playerStats.Passes.padStart(6)} | ${
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

export const formatDMMatch = (league, homeTeam, awayTeam, match, homeLineup, awayLineup, isInternational, allPlayers) => {
  let response = `## PSAF Match starting\r`
  const embeds= []
  if(isInternational) {
    response += `\r${homeTeam.flag} **${homeTeam.name} :vs: ${awayTeam.name}** ${awayTeam.flag}`
  } else {
    response += `\r${homeTeam.flag} ${homeTeam.disqualified?':no_entry_sign: ':''}${homeTeam.emoji} **${homeTeam.name}** :vs: **${awayTeam.name}** ${awayTeam.emoji}${awayTeam.disqualified?':no_entry_sign: ':''} ${awayTeam.flag}`
  }
  if(match.password) {
    const lobbyEmbed = {
      type: 'rich',
      title: `<${league.emoji}> **| ${league.name} ${match.matchday}** - <t:${match.dateTimestamp}:F>`,
      fields: []
    }
    lobbyEmbed.fields.push({name: 'Match Id', value: match._id.toString()})
    lobbyEmbed.fields.push({name: 'Lobby name', value: `PSAF ${homeTeam.name} vs ${awayTeam.name}`})
    lobbyEmbed.fields.push({name: 'Password', value: match.password})
    if(match.refs) {
      lobbyEmbed.fields.push({name: 'Referee(s)', value: match.refs.split(',').map(ref=> ref?`<@${ref}>`:'').join(', ')})
    } else {
      lobbyEmbed.fields.push({name: 'NO REFEREE', value: `${homeTeam.name} is responsible for creating the lobby`})
    }
    embeds.push(lobbyEmbed)
  }
  const nonLineupAttributes = ['_id', 'team', 'matchId', 'vs']
  if(homeLineup) {
    const homeEmbed = {
      type: 'rich',
      title: `${homeTeam.flag} ${homeTeam.emoji} ${homeTeam.name}`,
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
      title: `${awayTeam.flag} ${awayTeam.emoji} ${awayTeam.name}`,
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

const createMatch = async ({interaction_id, token, options, dbClient, isInternational}) => {
  const {home, away, league, matchday, date, timezone = 0, timestamp} = optionsToObject(options)
  let dateTimestamp = timestamp
  if(!dateTimestamp) {
    const parsedDate = parseDate(date, timezone)
    dateTimestamp = msToTimestamp(Date.parse(parsedDate))
  }
  const currentLeague = fixturesChannels.find(({value})=> value === league)

  let response = `<${currentLeague.emoji}> **| ${currentLeague.name} ${matchday}** - <t:${dateTimestamp}:F>`
  await dbClient(async ({teams, matches, nationalities, seasonsCollect})=> {
    const homeScore = '?'
    const awayScore = '?'
    let insertResult
    const season = await getCurrentSeason(seasonsCollect)
    if(isInternational) {
      const [homeTeam, awayTeam] = await Promise.all([
        nationalities.findOne({name: home}),
        nationalities.findOne({name: away})
      ])
      response += `\r> ${homeTeam.flag} **${homeTeam.name} :vs: ${awayTeam.name}** ${awayTeam.flag}`
    } else {
      const [homeTeam, awayTeam] = await Promise.all([
        teams.findOne({active:true, id: home}),
        teams.findOne({active:true, id: away})
      ])
      response += `\r> ${homeTeam.flag} ${homeTeam.disqualified?':no_entry_sign: ':''}${homeTeam.emoji} <@&${homeTeam.id}> :vs: <@&${awayTeam.id}> ${awayTeam.emoji}${awayTeam.disqualified?':no_entry_sign: ':''} ${awayTeam.flag}`
    }
    response += `\r> ${homeScore} : ${awayScore}`
    
    insertResult = await matches.insertOne({
      home,
      away,
      dateTimestamp,
      league,
      matchday,
      homeScore,
      awayScore,
      isInternational,
      season
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
  })

  return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: response,
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })
}

export const match = async ({interaction_id, token,  options, dbClient}) => {
  return createMatch({interaction_id, token, options, dbClient})
}

export const internationalMatch = async ({interaction_id, token,  options, dbClient}) => {
  return createMatch({interaction_id, token, options, dbClient, isInternational: true})
}

export const matchId = async ({interaction_id, token, options, dbClient}) => {
  const {home, away} = optionsToObject(options)
  return await dbClient(async ({matches})=> {
    const foundMatches = await matches.find({home, away}).sort({dateTimestamp: 1}).toArray()
    if(foundMatches.length === 0) {
      return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
        method: 'POST',
        body: {
          type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Match <@&${home}> - <@&${away}> not found`,
            flags: 1 << 6
          }
        }
      })
    }
    const response = foundMatches.map(({league, matchday, home, away, dateTimestamp, _id})=> `${fixturesChannels.find(fixLeague=>fixLeague.value === league)?.name || ''} ${matchday} <@&${home}> - <@&${away}> <t:${dateTimestamp}:F> ${_id}`).join('\r')
    return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
      method: 'POST',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: response,
          flags: 1 << 6,
          components: [{
            type: 1,
            components: [{
              type: 2,
              label: `Enter Result`,
              style: 2,
              custom_id: `match_result_${foundMatches[0]._id}`
            },{
              type: 2,
              label: `Enter Exported Stats`,
              style: 2,
              custom_id: `match_stats_${foundMatches[0]._id}`
            }]
          }]
        }
      }
    })
  })
}

export const editAMatchInternal = async ({id, home, away, league, matchday, date, timezone = 0, timestamp, teams, matches, nationalities}) => {
  const matchId = new ObjectId(id)
  const match = await matches.findOne(matchId)
  if(!match) {
    return `Match ${id} not found`
  }
  const homeId = home || match.home
  const awayId = away || match.away
  let homeTeam, awayTeam
  if(match.isInternational) {
    [homeTeam, awayTeam] = await Promise.all([
      nationalities.findOne({name: homeId}),
      nationalities.findOne({name: awayId})
    ])
  } else {
    [homeTeam, awayTeam] = await Promise.all([
      teams.findOne({active:true, id: homeId}),
      teams.findOne({active:true, id: awayId})
    ])
  }
  let dateTimestamp = match.dateTimestamp
  if(date || timestamp) {
    dateTimestamp = timestamp && timestamp.replace( /\D+/g, '')
    if(!dateTimestamp) {
      const parsedDate = parseDate(date, timezone)
      dateTimestamp = msToTimestamp(Date.parse(parsedDate))
    }
  }
  const leaguePick = league || match.league
  const currentLeague = fixturesChannels.find(({value})=> value === leaguePick)
  const channel = currentLeague.channel || currentLeague.value
  const matchDayPick = matchday || match.matchday
  await matches.updateOne({"_id": matchId}, {$set: {
    home: homeId,
    away: awayId,
    dateTimestamp,
    league: leaguePick,
    matchday: matchDayPick,
    password: null
  }})
  const post = formatMatch(currentLeague, homeTeam, awayTeam, {...match, home: homeId, away:awayId, dateTimestamp, matchday: matchDayPick}, false, match.isInternational)
  const response = formatMatch(currentLeague, homeTeam, awayTeam, {...match, home: homeId, away:awayId, dateTimestamp, matchday: matchDayPick}, true, match.isInternational)
  if(match.messageId) {
    await DiscordRequest(`/channels/${channel}/messages/${match.messageId}`, {
      method: 'PATCH',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        content: post
      }
    })
  }
  if(match.logId) {
    await DiscordRequest(`/channels/${matchLogChannelId}/messages/${match.logId}`, {
      method: 'PATCH',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        content: response
      }
    })
  }
  if(match.scheduleMessage) {
    await DiscordRequest(`/channels/${serverChannels.scheduleChannelId}/messages/${match.scheduleMessage}`, {
      method: 'PATCH',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        content: response
      }
    })
  }
  return response
}

export const editAMatch = async ({interaction_id, token, options, dbClient}) => {
  const optionsObj = optionsToObject(options)
  const response = await dbClient(async ({teams, matches, nationalities}) => {
    return await editAMatchInternal({...optionsObj, teams, matches, nationalities})
  })
  
  return await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `Updated \r`+response,
        flags: 1 << 6
      }
    }
  })
}

export const editMatch = async ({interaction_id, token, options, dbClient}) => {
  return editAMatch({interaction_id, token, options, dbClient})
}

export const editInterMatch = async ({interaction_id, token, options, dbClient}) => {
  return editAMatch({interaction_id, token, options, dbClient})
}

export const internalEndMatch = async ({id, homeScore, awayScore, ff, dbClient}) => {
  const matchId = new ObjectId(id)
  return dbClient(async ({teams, matches, nationalities}) => {
    const match = await matches.findOne(matchId)
    if(!match) {
      return `Match ${id} not found`
    }
    
    const [homeTeam, awayTeam] = await Promise.all([
      match.isInternational ? nationalities.findOne({name: match.home}) : teams.findOne({active: true, id: match.home}),
      match.isInternational ? nationalities.findOne({name: match.away}) : teams.findOne({active: true, id: match.away})
    ])
    
    const currentLeague = fixturesChannels.find(({value})=> value === match.league)
    const channel = currentLeague.channel || currentLeague.value
    await matches.updateOne({"_id": matchId}, {$set: {
      homeScore,
      awayScore,
      isFF: ff,
      finished: true
    }})
    const post = formatMatch(currentLeague, homeTeam, awayTeam, {...match, homeScore, awayScore, isFF: ff}, false, match.isInternational)
    const response = formatMatch(currentLeague, homeTeam, awayTeam, {...match, homeScore, awayScore, isFF: ff}, true, match.isInternational)
    if(match.messageId) {
      await DiscordRequest(`/channels/${channel}/messages/${match.messageId}`, {
        method: 'PATCH',
        body: {
          type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          content: post
        }
      })
    }
    if(match.logId) {
      await DiscordRequest(`/channels/${matchLogChannelId}/messages/${match.logId}`, {
        method: 'PATCH',
        body: {
          type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          content: response
        }
      })
    }
    if(match.scheduleMessage) {
      await DiscordRequest(`/channels/${serverChannels.scheduleChannelId}/messages/${match.scheduleMessage}`, {
        method: 'PATCH',
        body: {
          type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          content: response
        }
      })
    }
    return `Updated \r`+response
  })
}
export const internalEndMatchStats = async ({id, matchDetails, guild_id, callerId, dbClient}) => {
  const matchId = new ObjectId(id)
  const allPlayers = await getAllPlayers(guild_id)
  return dbClient(async ({teams, matches, nationalities, players, playerStats}) => {
    const match = await matches.findOne(matchId)
    if(!match) {
      return `Match ${id} not found`
    }
    
    const [homeTeam, awayTeam] = await Promise.all([
      match.isInternational ? nationalities.findOne({name: match.home}) : teams.findOne({active: true, id: match.home}),
      match.isInternational ? nationalities.findOne({name: match.away}) : teams.findOne({active: true, id: match.away})
    ])
    //Trying to get the list of potential players...
    let matchPlayers
    if(match.isInternational) {
      console.log(homeTeam.name, awayTeam.name)
      const dbPlayers = await players.find({nat1: {$in: [homeTeam.name, awayTeam.name]}}).toArray()
      console.log(dbPlayers)
      const dbPlayerIds = dbPlayers.map(dbPlayer=>dbPlayer.id)
      matchPlayers = allPlayers.filter(player => dbPlayerIds.includes(player.user.id))
        .map(player=> ({...player, ingamename: dbPlayers.find(dbPlayer=> dbPlayer.id === player.user.id)?.ingamename}))
      console.log(matchPlayers)
    } else {
      matchPlayers = allPlayers.filter(player=> player.roles.includes(match.home) || player.roles.includes(match.away))
      const dbPlayers = await players.find({$or: matchPlayers.map(player=> ({id: player.user.id}))}).toArray()
      matchPlayers = matchPlayers.map(player=> ({...player, ingamename: dbPlayers.find(dbPlayer=> dbPlayer.id === player.user.id)?.ingamename}))
    }
  
    const shortHome = matchDetails.home.trim().toLowerCase().substring(0, 6)
    const shortAway = matchDetails.away.trim().toLowerCase().substring(0, 6)
    const isSwapped = homeTeam.name.toLowerCase().includes(shortAway) || awayTeam.name.toLowerCase().includes(shortHome)
    const homeScore = isSwapped ? matchDetails.awayScore : matchDetails.homeScore
    const awayScore = isSwapped ? matchDetails.homeScore : matchDetails.awayScore
    const homeStats = isSwapped ? matchDetails.awayStats : matchDetails.homeStats
    const awayStats = isSwapped ? matchDetails.homeStats : matchDetails.awayStats
    const homeLineup = isSwapped ? matchDetails.awayLineup : matchDetails.homeLineup
    const awayLineup = isSwapped ? matchDetails.homeLineup : matchDetails.awayLineup
    
    //console.log(matchPlayers)
    const homeEntries = Object.entries(homeLineup).map(([pos, stats])=> (
      {
        matchId: match._id,
        homeAway: 'home',
        team: match.home,
        pos,
        savedBy: callerId,
        ...stats,
        id: matchPlayers.find(player=> getPlayerNick(player).toLowerCase().includes(stats.name.substring(0,5).toLowerCase())
          || (player.ingamename && player.ingamename.toLowerCase().includes(stats.name.substring(0,5).toLowerCase())))?.user?.id
      }
    ))
    const awayEntries = Object.entries(awayLineup).map(([pos, stats])=> (
      {
        matchId: match._id,
        homeAway: 'away',
        team: match.home,
        pos,
        savedBy: callerId,
        ...stats,
        id: matchPlayers.find(player=> getPlayerNick(player).toLowerCase().includes(stats.name.substring(0,5).toLowerCase())
          || (player.ingamename && player.ingamename.toLowerCase().includes(stats.name.substring(0,5).toLowerCase())))?.user?.id
      }
    ))
    const statsToSave = [...homeEntries, ...awayEntries]
    
    const currentLeague = fixturesChannels.find(({value})=> value === match.league)
    const channel = currentLeague.channel || currentLeague.value
    const updatedMatch = await matches.findOneAndUpdate({"_id": matchId}, {$set: {
      homeScore,
      awayScore,
      homeStats,
      awayStats,
      dateOfMatch: matchDetails.dateOfMatch,
      isFF: false,
      finished: true
    }}, {returnDocument: ReturnDocument.AFTER})
    //console.log(updatedMatch)
    await playerStats.deleteMany({matchId})
    await playerStats.insertMany(statsToSave)
    const post = formatMatch(currentLeague, homeTeam, awayTeam, {...updatedMatch, homeScore, awayScore}, false, match.isInternational)
    const response = formatMatch(currentLeague, homeTeam, awayTeam, {...updatedMatch, homeScore, awayScore}, true, match.isInternational)
    const {content, embeds, homeContent, awayContent} = formatMatchResult(homeTeam, awayTeam, updatedMatch, callerId, homeEntries, awayEntries)
    if(match.messageId) {
      await DiscordRequest(`/channels/${channel}/messages/${match.messageId}`, {
        method: 'PATCH',
        body: {
          type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          content: post
        }
      })
    }
    if(match.logId) {
      await DiscordRequest(`/channels/${matchLogChannelId}/messages/${match.logId}`, {
        method: 'PATCH',
        body: {
          type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          content: response
        }
      })
    }
    if(match.scheduleMessage) {
      await DiscordRequest(`/channels/${serverChannels.scheduleChannelId}/messages/${match.scheduleMessage}`, {
        method: 'PATCH',
        body: {
          type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          content: response
        }
      })
    }
    await DiscordRequest(`/channels/${serverChannels.matchResultsChannelId}/messages`, {
      method: 'POST',
      body: {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        content,
        embeds
      }
    })
    await DiscordRequest(`/channels/${serverChannels.matchResultsChannelId}/messages`, {
      method: 'POST',
      body: {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        content:homeContent
      }
    })
    await DiscordRequest(`/channels/${serverChannels.matchResultsChannelId}/messages`, {
      method: 'POST',
      body: {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        content:awayContent
      }
    })
    return `Updated \r`+response
  })
}

export const endMatch = async ({interaction_id, token, application_id, options, dbClient}) => {
  const {id, homescore, awayscore, ff} = optionsToObject(options)
  await waitingMsg({interaction_id, token})

  const content = await internalEndMatch({id, homeScore:homescore, awayScore:awayscore, ff, dbClient})
  return updateResponse({application_id, token, content})
}

export const resetMatch = async ({interaction_id, token, application_id, options, dbClient}) => {
  const {id} = optionsToObject(options)
  await waitingMsg({interaction_id, token})

  const matchId = new ObjectId(id)
  const content = await dbClient(async ({teams, matches, nationalities}) => {
    const match = await matches.findOne(matchId)
    if(!match) {
      return `Match ${id} not found`
    }
    
    const [homeTeam, awayTeam] = await Promise.all([
      match.isInternational ? nationalities.findOne({name: match.home}) : teams.findOne({active: true, id: match.home}),
      match.isInternational ? nationalities.findOne({name: match.away}) : teams.findOne({active: true, id: match.away})
    ])
    
    const currentLeague = fixturesChannels.find(({value})=> value === match.league)
    const channel = currentLeague.channel || currentLeague.value
    const resetValues = {
      homeScore: '?',
      awayScore: '?',
      isFF: null,
      finished: null
    }
    const updatedMatch = await matches.findOneAndUpdate({"_id": matchId}, {$set: resetValues})
    console.log(updatedMatch)
    const post = formatMatch(currentLeague, homeTeam, awayTeam, {...updatedMatch, ...resetValues}, false, match.isInternational)
    const response = formatMatch(currentLeague, homeTeam, awayTeam, {...updatedMatch, ...resetValues}, true, match.isInternational)
    if(match.messageId) {
      await DiscordRequest(`/channels/${channel}/messages/${match.messageId}`, {
        method: 'PATCH',
        body: {
          type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          content: post
        }
      })
    }
    if(match.logId) {
      await DiscordRequest(`/channels/${matchLogChannelId}/messages/${match.logId}`, {
        method: 'PATCH',
        body: {
          type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          content: response
        }
      })
    }
    return `Match has been reset \r`+response
  })
  return updateResponse({application_id, token, content})
}

export const publishMatch = async ({interaction_id, token, application_id, options, dbClient}) => {
  const {league, matchday, postping} = optionsToObject(options)
  const currentLeague = fixturesChannels.find(({value})=> value === league)
  const channel = currentLeague.channel || currentLeague.value

  DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `Publishing ${currentLeague.name} - ${matchday}...`,
        flags: 1 << 6
      }
    }
  })
  return await dbClient(async ({teams, matches, nationalities}) => {
    const teamsCursor = teams.find({active: true})
    const allTeams = await teamsCursor.toArray()
    const allNationalTeams = await nationalities.find({}).toArray()
    const matchCursor = matches.find({league, matchday, messageId: null}, {sort: {dateTimestamp: 1}})
    for await (const match of matchCursor) {
      const homeTeam = match.isInternational ? allNationalTeams.find(({name})=> name === match.home) : allTeams.find(({id})=> id === match.home)
      const awayTeam = match.isInternational ? allNationalTeams.find(({name})=> name === match.away) : allTeams.find(({id})=> id === match.away)
      const matchContent = formatMatch(currentLeague, homeTeam, awayTeam, match, false, match.isInternational)
      const messageResp = await DiscordRequest(`/channels/${channel}/messages`, {
        method: 'POST',
        body: {
          content: matchContent,
        }
      })
      const message = await messageResp.json()
      matches.updateOne({_id: match._id}, {$set: {messageId: message.id}})
      if(match.isInternational) {
        await DiscordRequest(`/channels/${message.channel_id}/messages/${message.id}/reactions/${homeTeam.flag}/@me`, {method: 'PUT', body:{}})
        await sleep(300)
        await DiscordRequest(`/channels/${message.channel_id}/messages/${message.id}/reactions/🇽/@me`, {method: 'PUT', body:{}})
        await sleep(300)
        await DiscordRequest(`/channels/${message.channel_id}/messages/${message.id}/reactions/${awayTeam.flag}/@me`, {method: 'PUT', body:{}})
      } else {
        const [,homeEmoji, homeEmojiId] = homeTeam.emoji.split(':')
        const [,awayEmoji, awayEmojiId] = awayTeam.emoji.split(':')
        await DiscordRequest(`/channels/${message.channel_id}/messages/${message.id}/reactions/${homeEmoji}:${homeEmojiId.substring(0, homeEmojiId.length -1)}/@me`, {method: 'PUT', body:{}})
        await sleep(300)
        await DiscordRequest(`/channels/${message.channel_id}/messages/${message.id}/reactions/🇽/@me`, {method: 'PUT', body:{}})
        await sleep(300)
        await DiscordRequest(`/channels/${message.channel_id}/messages/${message.id}/reactions/${awayEmoji}:${awayEmojiId.substring(0, awayEmojiId.length -1)}/@me`, {method: 'PUT', body:{}})
      }
      //forced to wait otherwise we get blocked by the API limits
      await sleep(500)
    }
    if(postping) {
      const pingRole = currentLeague.pingRole ? `<@&${currentLeague.pingRole}>`:'@everyone'
      const endMessage = `[ ${pingRole} ]--[ WELCOME BACK TO THE ${currentLeague.name}! VOTE YOUR WINNERS! ]`
      await DiscordRequest(`/channels/${channel}/messages`, {
        method: 'POST',
        body: {
          content: endMessage,
        }
      })
    }
    return DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
      method: 'PATCH',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        content: 'Done',
      }
    })
  })
}

export const getMatchesSummary = async({dbClient}) => {
  const matchesData = await getMatchesOfDay({forSite: true, finished: true, dbClient})
  const timestamp = msToTimestamp(Date.now())
  const messages = [`# <t:${timestamp}:d> Results`]
  const leagues = new Array(fixturesChannels.length)
  matchesData.forEach((match => {
    const indexToAdd = fixturesChannels.findIndex((league) => league.name === match.league.name)
    leagues[indexToAdd] = [...(leagues[indexToAdd]||[]), match]
  }))
  
  leagues.forEach((leagueMatches, index) => {
    if(leagueMatches?.length > 0) {
      const message = `## ${fixturesChannels[index].name} <${fixturesChannels[index].emoji}>\r`
      const matchesMessage = leagueMatches.map(({isInternational, homeTeam, awayTeam, homeScore, awayScore, isFF}) => (
        isInternational ? (
          `> ${homeTeam.flag} **${homeTeam.name} ${homeScore} : ${awayScore}${isFF ? ' **ff**': ''} ${awayTeam.name}** ${awayTeam.flag}`
        ) : (
          `> ${homeTeam.flag} ${homeTeam.emoji} <@&${homeTeam.id}> ${homeScore} : ${awayScore}${isFF ? ' **ff**': ''} <@&${awayTeam.id}> ${awayTeam.emoji} ${awayTeam.flag}`
        )
      )).join('\r')
      messages.push(message+matchesMessage)
    }
  })
  return messages
}

export const getMatchesOfDay = async ({date='today', finished=false, dbClient, forSite= false, isSchedule = false}) => {
  const parsedDate = parseDate(date)
  const startOfDay = new Date(parsedDate)
  startOfDay.setUTCHours(0,0,0,0)
  const endOfDay = new Date(parsedDate)
  endOfDay.setUTCHours(23,59,59,999)
  const startDateTimestamp = msToTimestamp(Date.parse(startOfDay))
  const endDateTimestamp = msToTimestamp(Date.parse(endOfDay))
  
  return dbClient(async ({teams, matches, nationalities, lineups}) => {
    const finishedArg = forSite ? {} : (finished ? {finished: true} : {$or: [{finished:false}, {finished:null}]})
    let lineupsOfDay = []
    const [allTeams, allNationalTeams, matchesOfDay] = await Promise.all([
      teams.find({active: true}).toArray(),
      nationalities.find({}).toArray(),
      matches.find({dateTimestamp: { $gt: startDateTimestamp, $lt: endDateTimestamp}, ...finishedArg}).sort({dateTimestamp:1}).toArray(),
    ])
    if(forSite) {
      lineupsOfDay = await lineups.find({matchId: {$in: matchesOfDay.map(match=> match._id.toString())}}).toArray()
    }
    if(forSite){
      return matchesOfDay.map(match => {
        const homeTeam = match.isInternational ? allNationalTeams.find(({name})=>name===match.home) : allTeams.find(({id})=> id === match.home)
        const awayTeam = match.isInternational ? allNationalTeams.find(({name})=>name===match.away) : allTeams.find(({id})=> id === match.away)
        const league = fixturesChannels.find(({value})=> value === match.league)
        const homeLineup = lineupsOfDay.find(lineup => lineup.matchId === match._id.toString() && match.home === lineup.team)
        const awayLineup = lineupsOfDay.find(lineup => lineup.matchId === match._id.toString() && match.home === lineup.team)
        return {
          ...match,
          homeLineup,
          awayLineup,
          homeTeam,
          awayTeam,
          league,
        }
      })
    } else {
      let response = [{content: `${matchesOfDay.length} match${matchesOfDay.length >1?'es':''} on <t:${startDateTimestamp}:d>.`}]
      for (const match of matchesOfDay) {
        const homeTeam = match.isInternational ? allNationalTeams.find(({name})=>name===match.home) : allTeams.find(({id})=> id === match.home)
        const awayTeam = match.isInternational ? allNationalTeams.find(({name})=>name===match.away) : allTeams.find(({id})=> id === match.away)
        const currentLeague = fixturesChannels.find(({value})=> value === match.league)
        response.push({content: formatMatch(currentLeague, homeTeam, awayTeam, match, true, match.isInternational), matchId: match._id.toString(), components: [{
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
          }]
        }]})
      }
      if(isSchedule) {
        for await (const match of response) {
          const {matchId, content, components} = match
          const body = matchId ? {
            content,
            components
          } : {
            content
          }
          const messageResp = await DiscordRequest(`/channels/${serverChannels.scheduleChannelId}/messages`, {
            method: 'POST',
            body
          })
          const message = await messageResp.json()
          await matches.updateOne({_id: new ObjectId(matchId)}, {$set: {scheduleMessage: message.id}})
        }
      }
      return response
    }
  })
  
}

export const getPastMatches = async ({dbClient}) => {
  const now = msToTimestamp(Date.now())
  
  return await dbClient(async ({teams, matches, nationalities}) => {
    const finishedArg = {$or: [{finished:false}, {finished:null}]}
    const allTeams = await teams.find({active: true}).toArray()
    const allNationalTeams = await nationalities.find({}).toArray()
    const matchesOfDay = await matches.find({dateTimestamp: { $lt: now}, ...finishedArg}).sort({dateTimestamp:1}).toArray()
    let response = [{content: `${matchesOfDay.length} unfinished match${matchesOfDay.length >1?'es':''} on <t:${now}:d>.`}]
    for (const match of matchesOfDay) {
      const homeTeam = match.isInternational ? allNationalTeams.find(({name})=>name===match.home) : allTeams.find(({id})=> id === match.home)
      const awayTeam = match.isInternational ? allNationalTeams.find(({name})=>name===match.away) : allTeams.find(({id})=> id === match.away)
      const currentLeague = fixturesChannels.find(({value})=> value === match.league)
      response.push({content: formatMatch(currentLeague, homeTeam, awayTeam, match, true, match.isInternational), matchId: match._id.toString()})
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
  return await dbClient(async({teams, matches, nationalities, lineups, playerStats}) => {
    const matchId = new ObjectId(id)
    const match = await matches.findOne({_id: matchId})
    const matchLineups = await lineups.find({matchId: id}).toArray()
    const lineupStats = await playerStats.find({matchId: id}).toArray()

    let homeTeam, awayTeam
    const allNationalTeams = await nationalities.find({}).toArray()
    if(match.isInternational) {
      const nationalTeams = await nationalities.find({name: {$in: [match.home, match.away]}})
      homeTeam = nationalTeams.find(nation => nation.name === match.home)
      awayTeam = nationalTeams.find(nation => nation.name === match.away)
    } else {
      const matchTeams = await teams.find({id: {$in:[match.home, match.away]}}).toArray()
      homeTeam = matchTeams.find(team => team.id === match.home)
      awayTeam = matchTeams.find(team => team.id === match.away)
    }
    const homeRawLineup = matchLineups.find(lineup=> lineup.team === homeTeam.id)
    const awayRawLineup = matchLineups.find(lineup=> lineup.team === awayTeam.id)

    const league = fixturesChannels.find(({value})=> value === match.league)
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
  if(response.length>0) {
    await DiscordRequest(`/channels/${serverChannels.scheduleChannelId}/messages`, {
      method: 'POST',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        content: `# The following matches have been missed and needs to be updated/filled in:`,
        flags: 0
      }
    })
    for await (const match of response) {
      await DiscordRequest(`/channels/${serverChannels.scheduleChannelId}/messages`, {
        method: 'POST',
        body: {
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
          flags: 0
        }
      })
    }
  } else {
    await DiscordRequest(`/channels/${serverChannels.scheduleChannelId}/messages`, {
      method: 'POST',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `## All the matches for today are filled, thanks!`,
          flags: 0
        }
      }
    })
  }
}

export const pastMatches = async ({interaction_id, token, application_id, dbClient}) => {
  const response = await getPastMatches({dbClient})
  console.log(response.length)
  if(response.length>0) {
    await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
      method: 'POST',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: response[0].content,
          flags: 0
        }
      }
    })
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
  if(response.length>0) {
    await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
      method: 'POST',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: response[0].content,
          flags: !post ? InteractionResponseFlags.EPHEMERAL : 0
        }
      }
    })
  }
  await response.forEach(async ({content, matchId}, index) => {
    if(index>0) {
      await DiscordRequest(`/webhooks/${application_id}/${token}`, {
        method: 'POST',
        body: {
          content: content,
          flags: !post ? InteractionResponseFlags.EPHEMERAL : 0,
          components: [{
            type: 1,
            components: [{
              type: 2,
              label: `Referee`,
              style: 1,
              custom_id: `referee_${matchId}`
            }, {
              type: 2,
              label: `Enter Result`,
              style: 1,
              custom_id: `match_result_${matchId}`
            }, {
              type: 2,
              label: `Enter stats`,
              style: 3,
              custom_id: `match_stats_${matchId}`
            }]
          }]
        }
      })
    }
  });
}

export const matchCmd = {
  name: 'match',
  description: 'Enter a match',
  type: 1,
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
    description: "Which league it is for",
    choices: fixturesChannels.map(({name, value})=> ({name, value})),
    required: true
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


export const internationalMatchCmd = {
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
    description: "Which league it is for",
    choices: fixturesChannels.map(({name, value})=> ({name, value})),
    required: true
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

export const editMatchCmd = {
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

export const moveTheMatchCmd = {
  name: 'movethematch',
  description: 'Update a match date',
  type: 1,
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

export const editInternationalMatchCmd = {
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

export const endMatchCmd = {
  name: 'endmatch',
  description: 'Finish a match',
  type: 1,
  options: [
    {
      type: 3,
      name: 'id',
      description: "The Match ID to modify",
      required: true
    },
    {
      type: 3,
      name: 'homescore',
      description: "The score for the home team",
      required: true
    },
    {
      type: 3,
      name: 'awayscore',
      description: "The score for the away team",
      required: true
    },
    {
      type: 5,
      name: 'ff',
      description: "Was the match a FF?"
    }
  ]
}

export const resetMatchCmd = {
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

export const publishMatchCmd = {
  name: 'publishmatch',
  description: 'Publish a matchday',
  type: 1,
  options: [
    {
      type: 3,
      name: 'league',
      description: "Which league it is for",
      choices: fixturesChannels.map(({name, value})=> ({name, value})),
      required: true
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

export const matchIdCmd = {
  name: 'matchid',
  description: 'Get a match\'s ID',
  type: 1,
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

export const matchesCmd = {
  name: 'matches',
  description: 'List the matches on a day',
  type: 1,
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

export const pastMatchesCmd = {
  name: 'pastmatches',
  description: 'List all the unresolved past matches',
  type: 1
}