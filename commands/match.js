import * as chrono from "chrono-node";
import { InteractionResponseType } from "discord-interactions";
import { ObjectId } from "mongodb";
import { fixturesChannels, matchDays } from "../config/psafServerConfig.js";
import { msToTimestamp, optionToTimezoneStr } from "../functions/helpers.js";
import { DiscordRequest } from "../utils.js";
import { sleep } from "../functions/helpers.js";

const matchLogChannelId = '1151131972568092702'
const botTestingId = '1150376229178978377'

const formatMatch = (league, homeTeam, awayTeam, match, showId) => {
  let response = `<${league.emoji}> **| ${league.name} ${match.matchday}** - <t:${match.dateTimestamp}:F>`
    response += `\r> ${homeTeam.flag} ${homeTeam.emoji} <@&${homeTeam.id}> :vs: <@&${awayTeam.id}> ${awayTeam.emoji} ${awayTeam.flag}`
    response += `\r> ${match.homeScore} : ${match.awayScore}${match.isFF ? ' **ff**': ''}`
    if(showId)
      response += `\rID: ${match._id}`
  return response
}

export const match = async ({interaction_id, token, guild_id, options, dbClient}) => {
  const {home, away, league, matchday, date, timezone = 0, timestamp} = Object.fromEntries(options.map(({name, value})=> [name, value]))
  if(!date && !timestamp) {
    return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
      method: 'POST',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'Please provide either a date or a timestamp.',
          flags: 1 << 6
        }
      }
    })
  }
  let dateTimestamp = timestamp
  if(!dateTimestamp) {
    const strTimezone = optionToTimezoneStr(timezone)
    const parsedDate = chrono.parseDate(date, { instance: new Date(), timezone: strTimezone })
    dateTimestamp = msToTimestamp(Date.parse(parsedDate))
  }
  const currentLeague = fixturesChannels.find(({value})=> value === league)

  let response = `<${currentLeague.emoji}> **| ${currentLeague.name} ${matchday}** - <t:${dateTimestamp}:F>`
  await dbClient(async ({teams, matches})=> {
    const [homeTeam, awayTeam] = await Promise.all([
      teams.findOne({active:true, id: home}),
      teams.findOne({active:true, id: away})
    ])
    const homeScore = '?'
    const awayScore = '?'
    response += `\r> ${homeTeam.flag} ${homeTeam.emoji} <@&${homeTeam.id}> :vs: <@&${awayTeam.id}> ${awayTeam.emoji} ${awayTeam.flag}`
    response += `\r> ${homeScore} : ${awayScore}`
    
    const insertResult = await matches.insertOne({
      home,
      away,
      dateTimestamp,
      league,
      matchday,
      homeScore,
      awayScore
    })
    response += `\rID: ${insertResult.insertedId}`
    const messageResp = await DiscordRequest(`/channels/${matchLogChannelId}/messages`, {
      method: 'POST',
      body: {
        content: response,
      }
    })
  })

  return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: response,
        flags: 1 << 6
      }
    }
  })
}

export const editMatch = async ({interaction_id, token, guild_id, options, dbClient}) => {
  const {id, home, away, league, matchday, date, timezone = 0, timestamp} = Object.fromEntries(options.map(({name, value})=> [name, value]))

  const matchId = new ObjectId(id)
  return await dbClient(async ({teams, matches}) => {
    const match = await matches.findOne(matchId)
    if(!match) {
      return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
        method: 'POST',
        body: {
          type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Match ${id} not found`,
            flags: 1 << 6
          }
        }
      })
    }
    
    const [homeTeam, awayTeam] = await Promise.all([
      teams.findOne({active: true, id: home || match.home}),
      teams.findOne({active: true, id: away || match.away})
    ])
    let dateTimestamp = match.dateTimestamp
    if(date || timestamp) {
      dateTimestamp = timestamp
      if(!dateTimestamp) {
        const strTimezone = optionToTimezoneStr(timezone)
        const parsedDate = chrono.parseDate(date, { instance: new Date(), timezone: strTimezone })
        dateTimestamp = msToTimestamp(Date.parse(parsedDate))
      }
    }
    const leaguePick = league || match.league
    const currentLeague = fixturesChannels.find(({value})=> value === leaguePick)
    const matchDayPick = matchday || match.matchday
    await matches.updateOne({"_id": matchId}, {$set: {
      home: homeTeam.id,
      away: awayTeam.id,
      dateTimestamp,
      league: leaguePick,
      matchday: matchDayPick
    }})
    let response = `Updated \r`
    const post = formatMatch(currentLeague, homeTeam, awayTeam, {...match, home: homeTeam.id, away:awayTeam.id, dateTimestamp, matchday: matchDayPick})
    response += formatMatch(currentLeague, homeTeam, awayTeam, {...match, home: homeTeam.id, away:awayTeam.id, dateTimestamp, matchday: matchDayPick}, true)
    if(match.messageId) {
      await DiscordRequest(`/channels/${currentLeague.value}/messages/${match.messageId}`, {
        method: 'PATCH',
        body: {
          type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          content: post
        }
      })
    }
    return await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
      method: 'POST',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: response,
          flags: 1 << 6
        }
      }
    })
  })
}

export const endMatch = async ({interaction_id, token, guild_id, options, dbClient}) => {
  const {id, homescore, awayscore, ff} = Object.fromEntries(options.map(({name, value})=> [name, value]))

  const matchId = new ObjectId(id)
  return await dbClient(async ({teams, matches}) => {
    const match = await matches.findOne(matchId)
    if(!match) {
      return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
        method: 'POST',
        body: {
          type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Match ${id} not found`,
            flags: 1 << 6
          }
        }
      })
    }
    
    const [homeTeam, awayTeam] = await Promise.all([
      teams.findOne({active: true, id: match.home}),
      teams.findOne({active: true, id: match.away})
    ])
    
    const currentLeague = fixturesChannels.find(({value})=> value === match.league)
    await matches.updateOne({"_id": matchId}, {$set: {
      homeScore: homescore,
      awayScore: awayscore,
      isFF: ff,
      finished: true
    }})
    let response = `Updated \r`
    const post = formatMatch(currentLeague, homeTeam, awayTeam, {...match, homeScore: homescore, awayScore:awayscore, isFF: ff})
    response += post
    if(match.messageId) {   
      await DiscordRequest(`/channels/${currentLeague.value}/messages/${match.messageId}`, {
        method: 'PATCH',
        body: {
          type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          content: post
        }
      })
    }
    return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
      method: 'POST',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: response,
          flags: 1 << 6
        }
      }
    })
  })
}

export const publishMatch = async ({interaction_id, token, guild_id, options, dbClient}) => {
  const {league, matchday} = Object.fromEntries(options.map(({name, value})=> [name, value]))
  const currentLeague = fixturesChannels.find(({value})=> value === league)

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
  return await dbClient(async ({teams, matches}) => {
    const teamsCursor = teams.find({active: true})
    const allTeams = await teamsCursor.toArray()
    const matchCursor = matches.find({league, matchday, messageId: null})
    for await (const match of matchCursor) {
      const homeTeam = allTeams.find(({id})=> id === match.home)
      const awayTeam = allTeams.find(({id})=> id === match.away)
      const matchContent = formatMatch(currentLeague, homeTeam, awayTeam, match, false)
      const messageResp = await DiscordRequest(`/channels/${currentLeague.value}/messages`, {
        method: 'POST',
        body: {
          content: matchContent,
        }
      })
      const message = await messageResp.json()
      matches.updateOne({_id: match._id}, {$set: {messageId: message.id}})
      const [,homeEmoji, homeEmojiId] = homeTeam.emoji.split(':')
      const [,awayEmoji,awayEmojiId] = awayTeam.emoji.split(':')
      await DiscordRequest(`/channels/${message.channel_id}/messages/${message.id}/reactions/${homeEmoji}:${homeEmojiId.substring(0, homeEmojiId.length -1)}/@me`, {method: 'PUT', body:{}})
      await sleep(300)
      await DiscordRequest(`/channels/${message.channel_id}/messages/${message.id}/reactions/🇽/@me`, {method: 'PUT', body:{}})
      await sleep(300)
      await DiscordRequest(`/channels/${message.channel_id}/messages/${message.id}/reactions/${awayEmoji}:${awayEmojiId.substring(0, awayEmojiId.length -1)}/@me`, {method: 'PUT', body:{}})
      //forced to wait otherwise we get blocked by the API limits
      await sleep(500)
    }
    const endMessage = `[ @everyone ]--[ WELCOME BACK TO THE ${currentLeague.name}! VOTE YOUR WINNERS! ]`
    return DiscordRequest(`/channels/${currentLeague.value}/messages`, {
      method: 'POST',
      body: {
        content: endMessage,
      }
    })
  })
}

export const matches = async ({interaction_id, token, guild_id, options=[], dbClient}) => {
  const {date = "today"} = Object.fromEntries(options.map(({name, value})=> [name, value]))
  const strTimezone = optionToTimezoneStr()
  const parsedDate = chrono.parseDate(date, { instance: new Date(), timezone: strTimezone })
  const startOfDay = new Date(parsedDate)
  startOfDay.setUTCHours(0,0,0,0)
  const endOfDay = new Date(parsedDate)
  endOfDay.setUTCHours(23,59,59,999)
  const startDateTimestamp = msToTimestamp(Date.parse(startOfDay))
  const endDateTimestamp = msToTimestamp(Date.parse(endOfDay))
  
  let response=' '
  return await dbClient(async ({teams, matches}) => {
    const matchesOfDay = matches.find({dateTimestamp: { $gt: startDateTimestamp, $lt: endDateTimestamp}})
    const allTeamsDb = teams.find({active: true})
    const allTeams = await allTeamsDb.toArray()
    for await (const match of matchesOfDay) {
      const homeTeam = allTeams.find(({id})=> id === match.home)
      const awayTeam = allTeams.find(({id})=> id === match.away)
      const currentLeague = fixturesChannels.find(({value})=> value === match.league)
      response += formatMatch(currentLeague, homeTeam, awayTeam, match, true)+'\r'
    }
    return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
      method: 'POST',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: response,
          flags: 1 << 6
        }
      }
    })
  })
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
    choices: matchDays,
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
      choices: matchDays,
      required: true
    }
  ]
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
    }
  ]
}