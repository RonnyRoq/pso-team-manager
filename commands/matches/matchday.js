import { fixturesChannels, matchDays, serverRoles } from "../../config/psafServerConfig.js"
import { getCurrentSeason, msToTimestamp, optionsToObject, quickResponse, updateResponse, waitingMsg } from "../../functions/helpers.js"
import { parseDate } from "chrono-node"
import { editAMatchInternal, internalCreateMatch } from "../match.js"
import { shuffleArray } from "../../functions/helpers.js"

const thirtyMinutes = 30*60

export const generateMatchday = async ({interaction_id, token, application_id, dbClient, member, options}) => {
  if(!member.roles.includes(serverRoles.presidentRole)) {
    return quickResponse({interaction_id, token, content: 'This command is only available to presidents.', isEphemeral:true})
  }
  const {league, matchday, date} = optionsToObject(options)
  const parsedDate = parseDate(date)
  const startOfDay = new Date(parsedDate)
  startOfDay.setUTCHours(17,0,0,0)
  const endOfDay = new Date(parsedDate)
  endOfDay.setUTCHours(20,30,0,0)
  const startDateTimestamp = msToTimestamp(Date.parse(startOfDay))
  const endDateTimestamp = msToTimestamp(Date.parse(endOfDay))

  const leagueObj = fixturesChannels.find(fixtureChan=> fixtureChan.value === league)
  let currentTimestamp = startDateTimestamp
  await waitingMsg({interaction_id, token})
  let processedMatchesIds = []
  const content = await dbClient(async({matches, seasonsCollect, teams, nationalities})=> {
    const currentSeason = await getCurrentSeason(seasonsCollect)
    const matchesOfDay = await matches.find({season: currentSeason, league, matchday, finished: null}).toArray()
    shuffleArray(matchesOfDay)
    for await (const match of matchesOfDay) {
      await matches.updateOne({_id: match._id}, {$set: {dateTimestamp: currentTimestamp}})
      processedMatchesIds.push(match._id.toString())
      currentTimestamp = (parseInt(currentTimestamp) + thirtyMinutes).toString()
      if(currentTimestamp > endDateTimestamp) {
        currentTimestamp = startDateTimestamp
      }
    }
    await Promise.allSettled(processedMatchesIds.map(id => editAMatchInternal({id, teams, nationalities, matches})))
    return `${leagueObj.name} ${matchday}: ${processedMatchesIds.length} matches set between <t:${startDateTimestamp}:F> and <t:${endDateTimestamp}:F>`
  })

  return await updateResponse({application_id, token, content})
}

export const randomMatchesDay = async ({interaction_id, token, application_id, member, options, dbClient}) => {
  if(!member.roles.includes(serverRoles.presidentRole)) {
    return quickResponse({interaction_id, token, content: 'This command is only available to presidents.', isEphemeral:true})
  }
  const {league, matchday} = optionsToObject(options)
  
  const leagueObj = fixturesChannels.find(fixtureChan=> fixtureChan.value === league)
  await waitingMsg({interaction_id, token})
  const content = await dbClient(async({matches, seasonsCollect, teams, leagues, nationalities})=> {
    const currentSeason = await getCurrentSeason(seasonsCollect)
    const matchesOfDay = await matches.find({season: currentSeason, league, matchday, finished: null}).toArray()
    if(matchesOfDay.length>0) {
      return `${leagueObj.name} ${matchday} has already ${matchesOfDay.length} matches`
    }
    const leagueTeams = (await leagues.find({leagueId: league}, ).toArray()).map(leagueTeam => leagueTeam.team)
    shuffleArray(leagueTeams)
    let teamPairs = []
    for(let i=0; i+1<leagueTeams.length ; i+=2) {
      teamPairs.push([leagueTeams[i], leagueTeams[i+1]])
    }
    const matchesList = await Promise.allSettled(teamPairs.map(([home, away])=>
      internalCreateMatch({league, home, away, isInternational:leagueObj.isInternational, undefined, matchday, teams, matches, nationalities, seasonsCollect})
    ))

    console.log(matchesList)
    return `${leagueObj.name} ${matchday}: ${teamPairs.length} matches created:\r${teamPairs.map(([home, away])=> `<@&${home}> - <@&${away}>`).join('\r')}`
  })

  return await updateResponse({application_id, token, content: content.substring(0, 1999)})
}

/*export const matchDay = async ({interaction_id, token, dbClient}) => {
  const {allTeams} = await dbClient(({teams})=> {
    return teams.find({active:true}).toArray()
  })
  const modal = {
    title: 'Create a matchday',
    custom_id: `create_matchday`,
    components: [{
      type: 1,
      components: [{
        type: 4,
        custom_id: "date",
        label: "Date",
        style: 1,
        min_length: 1,
        value: '',
        required: true
      }]
    },{
      type: 1,
      components: [{
        type: 3,
        custom_id: "select_matchday",
        label: "Match Day",
        style: 1,
        required: true,
        min_values: 1,
        max_values: 1,
        options: matchDays.slice(0,24).map((matchDay,index)=> ({
          label: matchDay.name,
          description: ' ',
          value: index,
        }))
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
}*/

export const generateMatchdayCmd = {
  type: 1,
  name: 'generatematchday',
  description: 'Generate the fixtures for a matchday',
  options: [{
    type: 3,
    name: 'league',
    description: 'League',
    required: true,
    choices: fixturesChannels.map(({name, value})=> ({name, value}))
  },{
    type: 3,
    name: 'matchday',
    description: "The matchday, or competition stage",
    choices: matchDays.slice(0,24),
    required: true
  },{
    type: 3,
    name: 'date',
    description: "The day you're looking for (UK timezone)",
    required: true
  }]
}

export const randomMatchdayCmd = {
  type: 1,
  name: 'randommatchday',
  description: 'Generate random oppositions for a matchday',
  options: [{
    type: 3,
    name: 'league',
    description: 'League',
    required: true,
    choices: fixturesChannels.map(({name, value})=> ({name, value}))
  },{
    type: 3,
    name: 'matchday',
    description: "The matchday, or competition stage",
    choices: matchDays.slice(0,24),
    required: true
  }]
}