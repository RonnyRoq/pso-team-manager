import { InteractionResponseType } from "discord-interactions"
import { serverChannels } from "../../config/psafServerConfig.js"
import { getCurrentSeason, isNumeric, msToTimestamp, optionsToObject, sleep } from "../../functions/helpers.js"
import { getAllPlayers } from "../../functions/playersCache.js"
import { DiscordRequest } from "../../utils.js"
import { formatDMMatch } from "../match.js"
import { parseDate } from "../timestamp.js"
import { getAllLeagues, getAllNationalities } from "../../functions/allCache.js"

export const lineupToArray = (lineup) => {
  // eslint-disable-next-line no-unused-vars
  const {_id, matchId, team, vs, ...players} = lineup
  return Object.entries(players).map(([,id])=>id)
}
export const notifyMatchStart = async ({dbClient}) => {
  const now = Math.floor(Date.now() / 1000)
  const plusTen = now + 10*60
  const {allTeams, allNationalTeams, notifyMatches, matchLineups, allNationalities} = await dbClient(async ({matches, teams, nationalTeams, lineups, contracts, seasonsCollect, nationalContracts})=> {
    const [allTeams, allNationalTeams, startingMatches, allNationalities, season] = await Promise.all([
      teams.find({}).toArray(),
      nationalTeams.find({}).toArray(),
      matches.find({dateTimestamp: {$gte: now.toString(), $lte: plusTen.toString()}, password: null, finished: null}).toArray(),
      getAllNationalities(),
      getCurrentSeason(seasonsCollect)
    ])
    
    const matchLineups = await lineups.find({matchId: {$in: startingMatches.map(match=>match._id.toString())}}).toArray()
    const notifyMatches = await Promise.all(startingMatches.map(async match => {
      let homePlayers = []
      let awayPlayers = []
      if(match.isInternational) {
        homePlayers = await nationalContracts.find({selection: match.home, season}).toArray()
        awayPlayers = await nationalContracts.find({selection: match.away, season}).toArray()
      } else {
        homePlayers = await contracts.find({endedAt: null, team: match.home}).toArray()
        awayPlayers = await contracts.find({endedAt: null, team: match.away}).toArray()
      }
      homePlayers = homePlayers.map(contract=> contract.playerId)
      awayPlayers = awayPlayers.map(contract=> contract.playerId)
      if(!match.password){
        const password = Math.random().toString(36).slice(-4)
        await matches.updateOne({_id: match._id}, {$set: {password}})
        return Promise.resolve({
          ...match,
          password,
          homePlayers,
          awayPlayers,
        })
      }
      return Promise.resolve(match)
    }))
    console.log(notifyMatches)
    return {allTeams, allNationalTeams, notifyMatches, matchLineups, allNationalities}
  })
  const allPlayers = await getAllPlayers(process.env.GUILD_ID)
  const allLeagues = await getAllLeagues()
  for await(const startingMatch of notifyMatches) {
    const league = allLeagues.find(({value})=> value === startingMatch.league)
    let homeTeam, awayTeam
    if(startingMatch.isInternational){
      homeTeam = allNationalTeams.find(selection => selection.shortname === startingMatch.home)
      awayTeam = allNationalTeams.find(selection => selection.shortname === startingMatch.away)
      homeTeam.flag = allNationalities.filter(nat=>homeTeam.eligiblenationality === nat.name)
      awayTeam.flag = allNationalities.filter(nat=>awayTeam.eligiblenationality === nat.name)
    } else {
      homeTeam = allTeams.find(team => startingMatch.home === team.id)
      awayTeam = allTeams.find(team => startingMatch.away === team.id)
    }
    const matchId = startingMatch._id.toString()
    const homeLineup = matchLineups.find(lineup => lineup.matchId === matchId && lineup.team === startingMatch.home)
    const awayLineup = matchLineups.find(lineup => lineup.matchId === matchId && lineup.team === startingMatch.away)
    const body = formatDMMatch(league, homeTeam, awayTeam, startingMatch, homeLineup, awayLineup, startingMatch.isInternational, allPlayers)
    const refs = startingMatch.refs || ''
    const streamers = startingMatch.streamers || ''
    const matchRefs = refs.split(',')
    const matchStreamers = streamers.split(',')
    let recipients = []
    await DiscordRequest(`/channels/${serverChannels.lobbiesChannelId}/messages`, {
      method: 'POST',
      body: {
        content: (startingMatch.isInternational ? '' : `<@&${startingMatch.home}> <@&${startingMatch.away}>\r`)+body.content,
        embeds: body.embeds
      }
    })
    if(startingMatch.thread) {
      await DiscordRequest(`/channels/${startingMatch.thread}/messages`, {
        method: 'POST',
        body
      })
    }
    if(matchRefs[0]) {
      for await (const matchRef of matchRefs) {
        if(matchRef && !recipients.includes(matchRef)) {
          try{
            const userChannelResp = await DiscordRequest('/users/@me/channels', {
              method: 'POST',
              body:{
                recipient_id: matchRef
              }
            })
            const userChannel = await userChannelResp.json()
            await DiscordRequest(`/channels/${userChannel.id}/messages`, {
              method: 'POST',
              body
            })
          }
          catch(e) {
            console.log(e)
          }
          recipients.push(matchRef)
          await sleep(500)
        }
      }
    }
    if(matchStreamers[0]) {
      for await (const matchStreamer of matchStreamers) {
        if(matchStreamer && !recipients.includes(matchStreamer)) {
          try{
            const userChannelResp = await DiscordRequest('/users/@me/channels', {
              method: 'POST',
              body:{
                recipient_id: matchStreamer
              }
            })
            const userChannel = await userChannelResp.json()
            await DiscordRequest(`/channels/${userChannel.id}/messages`, {
              method: 'POST',
              body
            })
          }
          catch(e) {
            console.log(e)
          }
          recipients.push(matchStreamer)
          await sleep(500)
        }
      }
    }
    let homeIds =[]
    if(homeLineup){
      homeIds = lineupToArray(homeLineup)
    } else {
      homeIds = startingMatch.homePlayers
    }
    if(homeIds[0]) {
      await Promise.allSettled(homeIds.map(async homePlayer => {
        if(homePlayer && !recipients.includes(homePlayer) && isNumeric(homePlayer)) {
          try{
            const userChannelResp = await DiscordRequest('/users/@me/channels', {
              method: 'POST',
              body:{
                recipient_id: homePlayer
              }
            })
            const userChannel = await userChannelResp.json()
            await DiscordRequest(`/channels/${userChannel.id}/messages`, {
              method: 'POST',
              body
            })
            recipients.push(homePlayer)
          }
          catch(e){
            console.log(e)
          }
          return sleep(500)
        }
        return Promise.resolve({})
      }))
    }
    
    let awayIds = []
    if(awayLineup) {
      awayIds = lineupToArray(awayLineup)
    } else {
      awayIds = startingMatch.awayPlayers
    }
    if(awayIds[0]) {
      await Promise.allSettled(awayIds.map(async awayPlayer => {
        if(awayPlayer && !recipients.includes(awayPlayer) && isNumeric(awayPlayer)) {
          try{
            const userChannelResp = await DiscordRequest('/users/@me/channels', {
              method: 'POST',
              body:{
                recipient_id: awayPlayer
              }
            })
            const userChannel = await userChannelResp.json()
            await DiscordRequest(`/channels/${userChannel.id}/messages`, {
              method: 'POST',
              body
            })
            recipients.push(awayPlayer)
          }
          catch(e){
            console.log(e)
          }
          return sleep(500)
        }
        return Promise.resolve({})
      }))
    }
    console.log('lobby sent to:')
    console.log(recipients)
  }
}

export const testDMMatch = async ({dbClient, options, interaction_id, guild_id, token, application_id}) => {
  const {date} = optionsToObject(options)
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Test DM format'
      }
    }
  })
  const parsedDate = parseDate(date)
  const dateTimestamp = msToTimestamp(Date.parse(parsedDate))
  const {allTeams, notifyMatches, matchLineups} = await dbClient(async ({matches, teams, lineups})=> {
    const allTeams = await teams.find({active: true}).toArray()
    const notifyMatches = await matches.find({dateTimestamp}).toArray()
    const matchLineups = await lineups.find({matchId: {$in: notifyMatches.map(match=>match._id.toString())}}).toArray()
    return Promise.resolve({allTeams, notifyMatches, matchLineups})
  })
  const allPlayers = await getAllPlayers(guild_id)
  const allLeagues = await getAllLeagues()
  for await(const startingMatch of notifyMatches) {
    const league = allLeagues.find(({value})=> value === startingMatch.league)
    const homeTeam = allTeams.find(team => startingMatch.home === team.id)
    const awayTeam = allTeams.find(team => startingMatch.away === team.id)
    const matchId = startingMatch._id.toString()
    const homeLineup = matchLineups.find(lineup => lineup.matchId === matchId && lineup.team === startingMatch.home)
    const awayLineup = matchLineups.find(lineup => lineup.matchId === matchId && lineup.team === startingMatch.away)
    const body = formatDMMatch(league, homeTeam, awayTeam, startingMatch, homeLineup, awayLineup, startingMatch.isInternational, allPlayers)
    await DiscordRequest(`/webhooks/${application_id}/${token}`, {
      method: 'POST',
      body
    })
  }
}

export const testDMMatchCmd = {
  name: 'testdmmatch',
  description: 'Post what we would receive in a DM for a match at a time',
  type: 1,
  options: [{
    type: 3,
    name: 'date',
    description: "The date planned for the match (UK timezone)",
    required: true,
  }]
}