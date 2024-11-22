import fs from 'fs';
import { createCanvas } from 'canvas'
import { NONE, currentSeason, elimMatchDaysSorted, serverChannels, serverRoles } from "../../config/psafServerConfig.js"
import { followUpResponse, getCurrentSeason, getFlags, optionsToObject, quickResponse, updateResponse, waitingMsg } from "../../functions/helpers.js"
import { DiscordRequest} from '../../utils.js'
import { leagueChoices } from '../../config/leagueData.js';
import { getAllLeagues } from '../../functions/allCache.js';

//Ensure this function doesnt crash if you ask for a league which doesnt have a table
const internalLeagueTable = async ({dbClient, league, season}) => {
  const [allTeams, leagueMatches, leagueTeams, allNationalTeams] = await dbClient(async ({matches, leagues, teams, nationalTeams, seasonsCollect}) => {
    const currentSeason = await getCurrentSeason(seasonsCollect)
    let seasonReq = season || currentSeason
    return Promise.all([
      teams.find({}).toArray(),
      matches.find({season: seasonReq, league, finished: true}).toArray(),
      leagues.find({leagueId:league}).toArray(),
      nationalTeams.find({}).toArray()
    ])
  })
  const leagueTeamsId = leagueTeams.map(leagueTeam=> leagueTeam.team)
  const allLeagues = await getAllLeagues()
  const leagueObj = allLeagues.find(fixChannel => fixChannel.value === league)
  const nationalTeamsWithEmojis = []
  for await(const selection of allNationalTeams) {
    const flags = await getFlags(selection)
    nationalTeamsWithEmojis.push({...selection, emoji: flags, id: selection.shortname})
  }
  const currentTeams = (leagueObj?.isInternational ? 
    nationalTeamsWithEmojis
    : allTeams
  ).map(team => {
    const leagueTeam = leagueTeams.find(leagueTeam=> leagueTeam.team === team.id)||{}
    return {
      ...team, 
      penaltyPoints: leagueTeam.penaltypoints || 0, group: leagueTeam.group || NONE, position: leagueTeam.position,
      wins:0, draws: 0, losses: 0, ffs: 0, goals: 0, against:0, played:0, ffDraws:0, wonAgainst:[]
    }
  })
  leagueMatches.forEach(({isFF, homeScore, awayScore, home, away}) => {
    console.log(leagueObj?.name, home, away)
    const hScore = Number.parseInt(homeScore)
    const aScore = Number.parseInt(awayScore)
    const homeTeamIndex = currentTeams.findIndex(team=>team.id === home)
    const awayTeamIndex = currentTeams.findIndex(team=>team.id === away)
    if(hScore === aScore) {
      currentTeams[homeTeamIndex].draws = (currentTeams[homeTeamIndex].draws || 0) + 1
      currentTeams[awayTeamIndex].draws = (currentTeams[awayTeamIndex].draws || 0) + 1
      if(isFF) {
        currentTeams[homeTeamIndex].ffs = (currentTeams[homeTeamIndex].ffs || 0) + 1
        currentTeams[awayTeamIndex].ffs = (currentTeams[awayTeamIndex].ffs || 0) + 1
        currentTeams[homeTeamIndex].ffDraws = (currentTeams[homeTeamIndex].ffDraws || 0) + 1
        currentTeams[awayTeamIndex].ffDraws = (currentTeams[awayTeamIndex].ffDraws || 0) + 1
      }
    } else if(hScore > aScore) {
      currentTeams[homeTeamIndex].wins = (currentTeams[homeTeamIndex].wins || 0) + 1
      currentTeams[homeTeamIndex].wonAgainst.push(away)
      currentTeams[awayTeamIndex].losses = (currentTeams[awayTeamIndex].losses || 0) + 1
      if(isFF) {
        currentTeams[awayTeamIndex].ffs = (currentTeams[awayTeamIndex].ffs || 0) + 1
      }
    } else {
      currentTeams[homeTeamIndex].losses = (currentTeams[homeTeamIndex].losses || 0) + 1
      currentTeams[awayTeamIndex].wins = (currentTeams[awayTeamIndex].wins || 0) + 1
      currentTeams[awayTeamIndex].wonAgainst.push(home)
      if(isFF) {
        currentTeams[homeTeamIndex].ffs = (currentTeams[homeTeamIndex].ffs || 0) + 1
      }
    }
    currentTeams[homeTeamIndex].goals = (currentTeams[homeTeamIndex].goals || 0) + hScore
    currentTeams[awayTeamIndex].goals = (currentTeams[awayTeamIndex].goals || 0) + aScore
    currentTeams[homeTeamIndex].against = (currentTeams[homeTeamIndex].against || 0) + aScore
    currentTeams[awayTeamIndex].against = (currentTeams[awayTeamIndex].against || 0) + hScore
    currentTeams[homeTeamIndex].played = (currentTeams[homeTeamIndex].played || 0) + 1
    currentTeams[awayTeamIndex].played = (currentTeams[awayTeamIndex].played || 0) + 1
  });
  const activeTeams = currentTeams.filter(team=> leagueTeamsId.includes(team.id))
  const teamsPerGroup = {}
  activeTeams.forEach(team=> {
    const group = team.group || NONE
    const currentGroup = teamsPerGroup[group] || []
    teamsPerGroup[group] = [...currentGroup, team]
  })
  const groupEntries = Object.entries(teamsPerGroup).sort(([a], [b])=> a.localeCompare(b))
  const sortedGroups = groupEntries.map(([group, groupTeams])=> {
    const sortedTeams = groupTeams.map(team=> ({...team, points: (team.wins*3)+team.draws-team.ffs-team.ffDraws-team.penaltyPoints, goalDifference: team.goals-team.against})).sort((a, b)=> {
      if(a.points !== b.points) {
        return b.points - a.points
      } else {
        const aWon = a.wonAgainst.includes(b.id)
        const bWon = b.wonAgainst.includes(a.id)
        if(aWon !== bWon) {
          return aWon ? -1 : 1
        } else if(a.goalDifference !== b.goalDifference) {
          return b.goalDifference - a.goalDifference
        } else if(a.goals !== b.goals ){
          return b.goals - a.goals
        } else {
          return a.played - b.played
        }
      }
    })
    return [group, sortedTeams]
  })
  return sortedGroups
}

const formatTeamTree = (name) => name.substring(0, 17).padEnd(18)
const nextStep = [1, 2, 5, 6, 9, 10, 13, 14]
export const internalElimTree = async ({dbClient, league}) => {
  const [allTeams, leagueMatches, leagueTeams, allNationalTeams] = await dbClient(async ({matches, leagues, teams, nationalTeams, seasonsCollect}) => {
    const currentSeason = await getCurrentSeason(seasonsCollect)
    return Promise.all([
      teams.find({}).toArray(),
      matches.find({season: currentSeason, league}).toArray(),
      leagues.find({leagueId:league}).toArray(),
      nationalTeams.find({}).toArray()
    ])
  })
  const allLeagues = await getAllLeagues()
  const leagueObj = allLeagues.find(fixChannel => fixChannel.value === league)
  const nationalTeamsWithEmojis = []
  for await(const selection of allNationalTeams) {
    const flags = await getFlags(selection)
    nationalTeamsWithEmojis.push({...selection, emoji: flags, id: selection.shortname})
  }
  const currentTeams = (leagueObj?.isInternational ? nationalTeamsWithEmojis : allTeams
  ).filter(team=> leagueTeams.find(leagueTeam=> leagueTeam.team === team.id) || team.id === serverRoles.unknownTeam).map(team => {
    const leagueTeam = leagueTeams.find(leagueTeam=> leagueTeam.team === team.id)||{}
    return {...team, penaltyPoints: leagueTeam.penaltypoints || 0, group: leagueTeam.group || NONE, position: leagueTeam.position, wins:0, draws: 0, losses: 0, ffs: 0, goals: 0, against:0, played:0, ffDraws:0, wonAgainst:[]}
  }).sort((a, b)=> a.position-b.position)
  
  const sortedMatches = leagueMatches.map( leagueMatch => {
    const matchdayIndex = elimMatchDaysSorted.findIndex(elimMatchDay=>elimMatchDay === leagueMatch.matchday)
    const homeTeam = currentTeams.find(team=> team.id === leagueMatch.home)
    const awayTeam = currentTeams.find(team => team.id === leagueMatch.away)
    console.log(matchdayIndex, homeTeam.name, awayTeam.name)
    return {
      ...leagueMatch,
      homeTeam, 
      awayTeam,
      matchdayIndex: matchdayIndex
    }
  }).sort((a, b) => {
    if(a.matchdayIndex !== b.matchdayIndex) {
      return a.matchdayIndex - b.matchdayIndex
    } else {
      return a.order - b.order
    }
  })
  if(sortedMatches.length > 0) {
    let currentMatchDay = sortedMatches[0].matchdayIndex
    const initialMatchDay = currentMatchDay
    let i=0
    let lines = []
    let insertedLines = []
    let lastInsertedLines = []
    let currentMatchInMatchday = 0
    while (i<sortedMatches.length) {
      const currentMatch = sortedMatches[i]
      if(currentMatchDay !== currentMatch.matchdayIndex){
        lastInsertedLines = insertedLines
        insertedLines = []
        currentMatchInMatchday = 0
        currentMatchDay = currentMatch.matchdayIndex
      }
      //console.log(currentMatchDay)
      if(initialMatchDay === sortedMatches[i]?.matchdayIndex){
        const homeIndex = 2*i, awayIndex = 2*i+1
        lines[homeIndex]=`${formatTeamTree(currentMatch.homeTeam.name)} ${currentMatch.finished ? `${currentMatch.homeScore.padStart(2)}`: '  '}`
        lines[awayIndex]=`${formatTeamTree(currentMatch.awayTeam.name)} ${currentMatch.finished ? `${currentMatch.awayScore.padStart(2)}`: '  '}`
        insertedLines.push(homeIndex, awayIndex)
      } else {
        const homeIndex = lastInsertedLines[nextStep[2*currentMatchInMatchday]]
        const awayIndex = lastInsertedLines[nextStep[2*currentMatchInMatchday+1]]
        const indexHome = (i*2-lines.length)
        const indexAway = (i*2-lines.length)*2
        console.log(currentMatchDay, indexHome, indexAway)
        lines[homeIndex] += ' | '+`${formatTeamTree(currentMatch.home === serverRoles.unknownTeam ? currentMatch.matchday : currentMatch.homeTeam.name)} ${currentMatch.finished ? `${currentMatch.homeScore.padStart(2)}`: '  '}`
        lines[awayIndex] += ' | '+`${formatTeamTree(currentMatch.away === serverRoles.unknownTeam ? currentMatch.matchday : currentMatch.awayTeam.name)} ${currentMatch.finished ? `${currentMatch.awayScore.padStart(2)}`: '  '}`
        insertedLines.push(homeIndex, awayIndex)
      }
      i++
      currentMatchInMatchday++
    }
    console.log(lines)
    const staticLength = lines.length-2
    for(let j=staticLength/2;j>0;j--) {
      lines.splice(j*2, 0, '------------------')
    }
    return '```'+lines.join('\r')+'```'
  }
}

export const apiLeagueTable = async ({dbClient, league}) => {
  const leagueIds = leagueChoices.map(chan => chan.value)
  if(leagueIds.includes(league)){
    return internalLeagueTable({dbClient, league})
  }
  return {}
}

export const imageLeagueTable = async ({interaction_id, token, application_id, dbClient, options}) => {
  const {league} = optionsToObject(options)
  await waitingMsg({interaction_id, token})
  const sortedTeams = await internalLeagueTable({dbClient, league})
  const allLeagues = await getAllLeagues()
  
  const width = 800
  const height = 800
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createLinearGradient(0, 0, width, height);

  // Add three color stops
  gradient.addColorStop(0, "#000080");
  gradient.addColorStop(1, "#4848c0");
  ctx.fillStyle = gradient
  // Add a rectangle at (10, 10) with size 100x100 pixels
  ctx.fillRect(10, 10, 790, 790);

  ctx.fillStyle = '#f0f0f0'
  ctx.roundRect(50, 50, 700, 700, 15)
  ctx.fill()

  ctx.fillStyle = '#101010'
  ctx.font = 'bold 24px sans-serif'
  ctx.fillText(allLeagues.find(chan=> chan.value === league)?.name, 75, 80);
  ctx.font = 'bold 16px sans-serif'

  ctx.fillStyle = '#101040'
  ctx.fillRect(65, 90, 655, 50)

  ctx.fillStyle = '#f0f0f0'
  ctx.fillText('#', 78, 120)
  ctx.fillText('Team', 100, 120)
  ctx.textAlign = 'center'
  ctx.fillText('Pts', 320, 120)
  ctx.fillText('M', 355, 120)
  ctx.fillText('W', 385, 120)
  ctx.fillText('D', 415, 120)
  ctx.fillText('L', 445, 120)
  ctx.fillText('G', 475, 120)
  ctx.fillText('A', 505, 120)
  ctx.fillText('GA', 535, 120)
  ctx.fillText('FFs', 575, 120)

  const basey = 165
  const yIncrement = 30
  sortedTeams.forEach(({name, points, played, wins, draws, losses, goals, against, goalDifference, ffs},index) => {
    const lineY = basey + yIncrement*index
    ctx.fillStyle = '#101010'
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(index+1, 85, lineY)
    ctx.textAlign = 'left'
    ctx.fillText(name, 100, lineY)
    ctx.textAlign = 'right'
    ctx.fillText(points, 330, lineY)
    ctx.fillText(played, 365, lineY)
    ctx.fillText(wins, 395, lineY)
    ctx.fillText(draws, 425, lineY)
    ctx.fillText(losses, 455, lineY)
    ctx.fillText(goals, 485, lineY)
    ctx.fillText(against, 515, lineY)
    ctx.fillText(goalDifference, 545, lineY)
    ctx.fillText(ffs, 580, lineY)
  })

  const out = fs.createWriteStream(`site/images/league/${league}.png`)
  const stream = canvas.createPNGStream({})
  stream.pipe(out)
  
  await new Promise(resolve => out.on("finish", resolve))

  /*await DiscordUploadRequest(`/channels/${serverChannels.botTestingChannelId}/messages`, {
    method: 'POST',
    body: {
      content: 'Standings'
    }
  }, [{
    name: `${league}.png`,
    path: `./${league}.png`
  }],)*/
  /*await DiscordUploadRequest(`/channels/${serverChannels.botTestingChannelId}/messages`, {
    method: 'POST',
    body: {
      content: 'Standings'
    }
  }, [{
    name: `${league}.png`,
    data: canvas.toBuffer().toString(),
    contentType: 'image/png',
  }],)*/
  return updateResponse({application_id, token, content: `https://pso.shinmugen.net/site/images/league/${league}.png`})
}

export const formatLeagueTree = async ({league, dbClient, short = false}) => {
  const sortedGroups = await internalElimTree({dbClient, league})
  const content = sortedGroups.map(([group, sortedTeams]) => {
    const response = `${group !== NONE ? `## GROUP ${group}\r`: ``}` +
    (
      short ? `> Pos | Name | Pts (Games) | FF \r` +
      sortedTeams.map((team,index)=> `> **${index+1} ${team.emoji} ${team.name.substring(0, 19)}** | ${team.points}Pts (${team.played}) | ${team.ffs} `).join('\r')
      :
      `> Pos | Name | Pts (G) | Wins - Draws - Losses | GA | FF \r` +
      sortedTeams.map((team,index)=> `> **${index+1} ${team.emoji} ${team.name.substring(0, 17)}** | ${team.points}Pts (${team.played}) | ${team.wins} - ${team.draws} - ${team.losses} | ${team.goalDifference} | ${team.ffs} `).join('\r')
    )
    return response
  }).join('\r')
  console.log(content.length)
  return content
}

export const formatLeagueTable = async ({league, dbClient, short = false, season}) => {
  const allLeagues = await getAllLeagues()
  const leagueObj = allLeagues.find(currentLeague=> currentLeague.value === league)
  if(leagueObj.knockout){
    const res = await internalElimTree({dbClient, league})
    return res
  } else {
    const sortedGroups = await internalLeagueTable({dbClient, league, season})
    const content = sortedGroups.map(([group, sortedTeams]) => {
      const response = `${group !== NONE ? `## GROUP ${group}\r`: ''}` +
      (
        short ? `> Pos | Name | Pts (Games) | FF \r` +
        sortedTeams.map((team,index)=> `> **${index+1} ${team.emoji} ${team.name.substring(0, 19)}** | ${team.points}Pts (${team.played}) | ${team.ffs} `).join('\r')
        :
        `> Pos | Name | Pts (G) | Wins - Draws - Losses | GA | FF \r` +
        sortedTeams.map((team,index)=> `> **${index+1} ${team.emoji} ${team.name.substring(0, 17)}** | ${team.points}Pts (${team.played}) | ${team.wins} - ${team.draws} - ${team.losses} | ${team.goalDifference} | ${team.ffs} `).join('\r')
      )
      return response
    }).join('\r')
    console.log(content.length)
    return content
  }
}

export const leagueTable = async ({interaction_id, token, application_id, dbClient, options}) => {
  const {league, short, season} = optionsToObject(options)
  await waitingMsg({interaction_id, token})
  const content = await formatLeagueTable({league, dbClient, short, season})
  if(content.length > 2000) {
    const lines = content.split('\r')
    const content1 = lines.slice(0, (lines.length/2)).join('\r')
    const content2 = lines.slice(lines.length/2, lines.length).join('\r')
    await followUpResponse({application_id, token, content: content1})
    return followUpResponse({application_id, token, content: content2})
  }
  return updateResponse({application_id, token, content})
}

export const updateLeagueTable = async ({league, dbClient, short = false}) => {
  console.log(`Updating league ${league.name}, ${league.standingsMsg}`)
  if(!league.active || !league.standingsMsg){
    console.log(`${league.name} Active: ${league.active} StandingsMsg: ${league.standingsMsg}`)
    return
  }
  console.log(`Updating ${league.name}`)
  let content = await formatLeagueTable({league: league.value, dbClient, short})
  if(content.length>=2000) {
    const lastReturn = content.lastIndexOf('\r', 1991)
    content = content.substring(0, lastReturn)+'\r> ...'
  }

  return DiscordRequest(`/channels/${league?.standingsChannel || serverChannels.standingsChannelId}/messages/${league.standingsMsg}`, {
    method: 'PATCH',
    body: {
      content:content || '--'
    }
  })
}

export const postLeagueTable = async ({interaction_id, token, dbClient, options}) => {
  const {league, short} = optionsToObject(options)
  const content = await formatLeagueTable({league, dbClient, short})
  return quickResponse({interaction_id, token, content})
}

export const leagueTableCmd = {
  type: 1,
  name: 'leaguetable',
  description: 'Show the league table',
  options: [{
    type: 3,
    name: 'league',
    description: 'League',
    required: true,
    choices: leagueChoices
  },{
    type: 5,
    name: 'short',
    description: "Short version?"
  },{
    type: 4,
    name: 'season',
    min: 3,
    max: currentSeason,
    description: 'Which season? (Current by default)'
  }]
}

export const postLeagueTableCmd = {
  ...leagueTableCmd,
  name: 'postleaguetable'
}

export const imageLeagueTableCmd = {
  type: 1,
  name: 'imgleaguetable',
  description: 'Show the league table',
  options: [{
    type: 3,
    name: 'league',
    description: 'League',
    required: true,
    choices: leagueChoices
  }]
}

export default [leagueTableCmd]