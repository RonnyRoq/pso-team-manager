import { ObjectId } from "mongodb"
import { updateResponse, waitingMsg } from "../../functions/helpers.js"
import { DiscordRequest } from "../../utils.js"
import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { getMatchTeams, internalEndMatch, internalEndMatchStats } from "../match.js"

export const refereeMatch = async ({interaction_id, token, custom_id, application_id, message, callerId, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const [,id] = custom_id.split('_')
  const matchId = new ObjectId(id)
  const content = await dbClient(async ({matches})=> {
    const match = await matches.findOne(matchId)
    let refsArray = (match.refs || '').split(',')
    if(refsArray[0] === '') {
      refsArray = []
    }
    let refs = []
    let content = message.content
    let response = ''
    if(refsArray.includes(callerId)) {
      const indexContent = message.content.indexOf(`\r<@${callerId}>`)
      const indexLength = `\r<@${callerId}>`.length
      refs = refsArray.filter(id=> id!== callerId)
      content = message.content.substring(0, indexContent) + message.content.substring(indexContent+indexLength)
      response = 'Removed you from the list of referees.'
    } else {
      refs = [...refsArray, callerId]
      content = message.content + `\r<@${callerId}>`
      response = 'Added you to the list of refs for this match'
    }
    await matches.updateOne({_id: matchId}, {$set: {refs: refs.join(','), referees: refs}})
    await DiscordRequest(`/channels/${message.channel_id}/messages/${message.id}`, {
      method: 'PATCH',
      body: {
        content,
        components: message.components
      }
    })
    return response
  })
  await updateResponse({application_id, token, content})
}
export const streamerMatch = async ({interaction_id, token, custom_id, application_id, message, callerId, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const [,id] = custom_id.split('_')
  const matchId = new ObjectId(id)
  const content = await dbClient(async ({matches})=> {
    const match = await matches.findOne(matchId)
    let streamersArray = (match.streamers || '').split(',')
    if(streamersArray[0] === '') {
      streamersArray = []
    }
    let streamers = []
    let content = message.content
    let response = ''
    if(streamersArray.includes(callerId)) {
      const indexContent = message.content.indexOf(`\r<@${callerId}>`)
      const indexLength = `\r<@${callerId}>`.length
      streamers = streamersArray.filter(id=> id!== callerId)
      content = message.content.substring(0, indexContent) + message.content.substring(indexContent+indexLength)
      response = 'Removed you from the list of streamers.'
    } else {
      streamers = [...streamersArray, callerId]
      content = message.content + `\r<@${callerId}>`
      response = 'Added you to the list of streamers for this match'
    }
    await matches.updateOne({_id: matchId}, {$set: {streamers: streamers.join(',')}})
    await DiscordRequest(`/channels/${message.channel_id}/messages/${message.id}`, {
      method: 'PATCH',
      body: {
        content,
        components: message.components
      }
    })
    return response
  })
  await updateResponse({application_id, token, content})
}

export const matchResultPrompt = async ({interaction_id, token, custom_id, dbClient}) => {
  const [,,id] = custom_id.split('_')
  const matchId = new ObjectId(id)
  await dbClient(async ({matches, nationalTeams, teams})=> {
    const match = await matches.findOne(matchId)
    const {isInternational, home, away, homeScore, awayScore} = match || {}
    
    const [homeTeam, awayTeam] = await getMatchTeams(home, away, isInternational, nationalTeams, teams)
    const modal = {
      title: `${homeTeam.name} - ${awayTeam.name}`.substring(0, 44),
      custom_id: `match_result_${id}`,
      components: [{
        type: 1,
        components: [{
          type: 4,
          custom_id: "home_score",
          label: homeTeam.name,
          style: 1,
          min_length: 1,
          max_length: 3,
          value: homeScore,
          required: true
        }]
      },{
        type: 1,
        components: [{
          type: 4,
          custom_id: "away_score",
          label: awayTeam.name,
          style: 1,
          min_length: 1,
          max_length: 3,
          value: awayScore,
          required: true
        }]
      },{
        type: 1,
        components: [
          {
            type: 4,
            custom_id: "ff",
            label: 'Enter ff if Forfeited',
            style: 1,
            max_length: 2,
            required: false
          }
        ]
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

export const matchStatsPrompt = async ({interaction_id, token, custom_id, dbClient}) => {
  const [,,id] = custom_id.split('_')
  const matchId = new ObjectId(id)
  await dbClient(async ({matches, nationalTeams, teams})=> {
    const match = await matches.findOne(matchId)
    const {isInternational, home, away, homeScore, awayScore} = match || {}
    const [homeTeam, awayTeam] = await getMatchTeams(home, away, isInternational, nationalTeams, teams)
    
    const modal = {
      title: `${homeTeam.name} ${homeScore} - ${awayScore} ${awayTeam.name}`.substring(0, 44),
      custom_id: `match_stats_${id}`,
      components: [{
        type: 1,
        components: [{
          type: 4,
          custom_id: "all_stats",
          label: "Copy paste the exported stats here",
          style: 2,
          required: true
        }]
      },{
        type: 1,
        components: [{
          type: 4,
          custom_id: "extra_stats",
          label: "If too long, put the rest here.",
          style: 2,
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

export const endMatchModalResponse = async ({interaction_id, token, custom_id, components, dbClient}) => {
  const [,,id] = custom_id.split('_')
  const entries = components.map(({components})=> components[0])
  const {home_score, away_score, ff=''} = Object.fromEntries(entries.map(entry=> [entry.custom_id, entry.value]))
  const endMatchResponse = await internalEndMatch({id, homeScore:home_score, awayScore:away_score, ff:ff.toLowerCase() === 'ff', dbClient})
  return await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: endMatchResponse
      }
    }
  })
}

export const matchStatsModalResponse = async ({interaction_id, token, application_id, custom_id, guild_id, callerId, components, dbClient}) => {
  const [,,id] = custom_id.split('_')
  const entries = components.map(({components})=> components[0])
  const {all_stats/*, extra_stats*/} = Object.fromEntries(entries.map(entry=> [entry.custom_id, entry.value]))
  await waitingMsg({interaction_id, token})

  //function parseMatchStats() {}

  function parseTeamPlayersStats(dataEntries) {
    const homePlayerStats = dataEntries
      .split("\n")
      .filter((stats) => !(stats.match(/\(.+\)$/) || !stats));
    const playerStatsRegexp =
    /^(GK|LB|RB|CB|LCB|RCB|LCM|RCM|CM|LW|RW|ST|LST|RST|LF|RF|Sub \d) (.+) (\D+): ([\d|,]+) (\D+): (\d+) (\D+): (\d+) (\D+): (\d+) (\D+): (\d+) (\D+): (\d+) (\D+): (\d+) (\D+): (\d+) (\D+): (\d+)$/gm;
    const homeLineup = {};
    for (const playerStats of homePlayerStats) {
      //console.log(playerStats)
      const playerRegexp = new RegExp(playerStatsRegexp)
      const parsedPlayerStats = playerRegexp.exec(playerStats)
      //console.log(parsedPlayerStats)
      const [, ...parsedPlayerValues] = parsedPlayerStats
      let playerEntries = [];
      for (let i = 2; i < parsedPlayerValues.length; i += 2) {
        playerEntries.push([parsedPlayerValues[i], parsedPlayerValues[i + 1]]);
      }
      homeLineup[parsedPlayerValues[0].toLowerCase()] = {
        name: parsedPlayerValues[1],
        ...Object.fromEntries(playerEntries),
      };
    }
    return homeLineup;
  }

  const data = all_stats.replace('\r\n', ).split("\n\n");
  const dataEntries = [];
  for (let i = 0; i < data.length; i += 2) {
    dataEntries.push([data[i].trimStart(), data[i + 1]]);
  }

  const teamsAndDate = dataEntries[0][0].split(" - ");
  const teamvs = teamsAndDate[0].split(" vs ");
  
  const dateRegExp = new RegExp(/(\d+)-(\d+)-(\d+)_(\d+)-(\d+)-(\d+)/gm)
  const dateMatches = dateRegExp.exec(teamsAndDate[1])
  const dateOfMatch = new Date(dateMatches[1], dateMatches[2]-1, dateMatches[3], dateMatches[4], dateMatches[5], dateMatches[6]).toISOString()

  const homeAwayScores = dataEntries[0][1].split(" - ");
  const matchStatsBase = [
    "Goals",
    "Possession",
    "Passes",
    "Assists",
    "Shots",
    "Tackles",
    "Interceptions",
    "Fouls / Offsides",
    "Free Kicks",
    "Penalties",
    "Goal Kicks",
    "Corner Kicks",
    "Throw Ins",
    "Yellow Cards",
    "Red Cards",
  ];
  const statsRegexp = /(\d+)\D+(\d+%)\D+\W+(\d+) Passes\W+(\d+) Assists\W+(\d+) Shots\W+(\d+) Tackles\W+(\d+) Interceptions\W+(\d+ \/ \d+)\D+(\d+) Free Kicks\D+(\d+) Penalties\D+(\d+)\D+(\d+)\D+(\d+)\D+(\d+)\D+(\d+)/gm;
  const statsRegexp2 = new RegExp(statsRegexp);
  const [, ...homeStatsValues] = statsRegexp.exec(dataEntries[1][1]);
  const homeStats = Object.fromEntries(
    matchStatsBase.map((attribute, index) => [attribute, homeStatsValues[index]])
  );

  const [, ...awayStatsValues] = statsRegexp2.exec(dataEntries[2][1]);
  const awayStats = Object.fromEntries(
    matchStatsBase.map((attribute, index) => [attribute, awayStatsValues[index]])
  );

  const homeLineup = parseTeamPlayersStats(
    dataEntries[3][1].concat('\n', dataEntries[4][1] || '', '\n', dataEntries[5][1] || '')
  );
  const awayLineup = parseTeamPlayersStats(
    dataEntries[6][1].concat('\n', dataEntries[7][1] || '', '\n', dataEntries[8][1] || '')
  );
  const matchDetails = {
    home: teamvs[0],
    away: teamvs[1],
    homeScore: homeAwayScores[0],
    awayScore: homeAwayScores[1],
    homeStats,
    awayStats,
    homeLineup,
    awayLineup,
    dateOfMatch,
  };
  
  const endMatchResponse = await internalEndMatchStats({id, matchDetails, guild_id, callerId, dbClient})
  return await updateResponse({application_id, token, content:endMatchResponse})
}