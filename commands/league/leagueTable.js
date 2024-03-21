import { createCanvas } from 'canvas'
import { fixturesChannels, serverChannels } from "../../config/psafServerConfig.js"
import { getCurrentSeason, optionsToObject, updateResponse, waitingMsg } from "../../functions/helpers.js"
import { DiscordRequest, DiscordUploadRequest } from '../../utils.js'
import { InteractionResponseType } from 'discord-interactions'

//Ensure this function doesnt crash if you ask for a league which doesnt have a table
const internalLeagueTable = async ({dbClient, league}) => {
  const {allTeams, leagueMatches, leagueTeams, allCountries} = await dbClient(async ({matches, leagues, teams, nationalities, seasonsCollect}) => {
    const currentSeason = await getCurrentSeason(seasonsCollect)
    const [allTeams, leagueMatches, leagueTeams, allCountries] = await Promise.all([
      teams.find({}).toArray(),
      matches.find({season: currentSeason, league, finished: true}).toArray(),
      leagues.find({leagueId:league}).toArray(),
      nationalities.find({}).toArray()
    ])
    return {allTeams, leagueMatches, leagueTeams, allCountries}
  })
  const leagueTeamsId = leagueTeams.map(leagueTeam=> leagueTeam.team)
  const leagueObj = fixturesChannels.find(fixChannel => fixChannel.value === league)
  const currentTeams = (leagueObj?.isInternational ? 
    allCountries.filter(country => leagueTeamsId.includes(country.name)).map(country=>({...country, id: country.name, emoji: country.flag}))
    : allTeams//.filter(team=> leagueTeamsId.includes(team.id))
  ).map(team=> ({...team, wins:0, draws: 0, losses: 0, ffs: 0, goals: 0, against:0, played:0, ffDraws:0, wonAgainst:[]}))
  leagueMatches.forEach(({isFF, homeScore, awayScore, home, away}) => {
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
  const activeTeams = currentTeams.filter(team=> team.played > 0)

  const sortedTeams = activeTeams.map(team=> ({...team, points: (team.wins*3)+team.draws-team.ffs-team.ffDraws, goalDifference: team.goals-team.against})).sort((a, b)=> {
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
  return sortedTeams
}

export const apiLeagueTable = async ({dbClient, league}) => {
  const leagueIds = fixturesChannels.map(chan => chan.value)
  if(leagueIds.includes(league)){
    return internalLeagueTable({dbClient, league})
  }
  return {}
}

export const imageLeagueTable = async ({interaction_id, token, application_id, dbClient, options}) => {
  const {league} = optionsToObject(options)
  await waitingMsg({interaction_id, token})
  const sortedTeams = await internalLeagueTable({dbClient, league})
  
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
  ctx.fillText(fixturesChannels.find(chan=> chan.value === league)?.name, 75, 80);
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

  DiscordUploadRequest(`/channels/${serverChannels.botTestingChannelId}/messages`, {
    method: 'POST',
    body: {
      content: 'Standings',
      attachments: [{
        id: '0',
        description: 'Image for standings',
        filename: `${league}.png`
      }],
      files: [{
        name: `${league}.png`,
        attachment: canvas.toBuffer()}
      ],
    }
  })
  return updateResponse({application_id, token, content: 'done'})
}

export const leagueTable = async ({interaction_id, token, application_id, dbClient, options}) => {
  const {league} = optionsToObject(options)
  await waitingMsg({interaction_id, token})
  const sortedTeams = await internalLeagueTable({dbClient, league})
  const content = //`${fixturesChannels.find(chan=> chan.value === league)?.name} standings:\r` +
    `> Pos | Name | Pts (G) | Wins - Draws - Losses | GA | FF \r` +
    sortedTeams.map((team,index)=> `> **${index+1} ${team.emoji} ${team.name.substring(0, 17)}** | ${team.points}Pts (${team.played}) | ${team.wins} - ${team.draws} - ${team.losses} | ${team.goalDifference} | ${team.ffs} `).join('\r')
  console.log(content.length)
  return updateResponse({application_id, token, content})
}

export const updateLeagueTable = async ({league, dbClient}) => {
  const sortedTeams = await internalLeagueTable({dbClient, league})
  const content = //`${fixturesChannels.find(chan=> chan.value === league)?.name} standings:\r` +
    `> Pos | Name | Pts (Games) | Win - Draw - Loss | GA | FF \r` +
    sortedTeams.map((team,index)=> `> **${index+1} ${team.emoji} ${team.name.substring(0, 19)}** | ${team.points}Pts (${team.played}) | ${team.wins} - ${team.draws} - ${team.losses} | ${team.goalDifference} | ${team.ffs} `).join('\r')
  const leagueObj = fixturesChannels.find(({value})=> value === league)
  console.log(content.length)
  return await DiscordRequest(`/channels/${leagueObj?.standingsChannel || serverChannels.standingsChannelId}/messages/${leagueObj.standingsMsg}`, {
    method: 'PATCH',
    body: {
      content
    }
  })
}

export const postLeagueTable = async ({interaction_id, token, dbClient, options}) => {
  const {league} = optionsToObject(options)
  const sortedTeams = await internalLeagueTable({dbClient, league})
  const content = `${fixturesChannels.find(chan=> chan.value === league)?.name} standings:\r` +
    `> Pos | Name | Points (Games) | Wins - Draws - Losses | GA | FFs \r` +
    sortedTeams.map((team,index)=> `> **${index+1} ${team.emoji} ${team.name}** | ${team.points}Pts (${team.played}) | ${team.wins} - ${team.draws} - ${team.losses} | ${team.goalDifference} | ${team.ffs} `).join('\r')

  return await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content
      }
    }
  })
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
    choices: fixturesChannels.map(({name, value})=> ({name, value}))
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
    choices: fixturesChannels.map(({name, value})=> ({name, value}))
  }]
}