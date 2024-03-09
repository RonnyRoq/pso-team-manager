import { fixturesChannels } from "../../config/psafServerConfig.js"
import { optionsToObject, updateResponse, waitingMsg } from "../../functions/helpers.js"
import { internalCreateMatch } from "../match.js";
import { matchDays as matchDayRef } from "../../config/psafServerConfig.js"
import { shuffleArray } from "../../functions/helpers.js"

export const generateGroup = async ({application_id, interaction_id, token, dbClient, options}) => {
  const {league, homeaway} = optionsToObject(options)
  await waitingMsg({interaction_id, token})
  const response = await dbClient(async ({leagues, teams, matches, nationalities, seasonsCollect})=> {
    const leagueTeams = await leagues.find({leagueId: league}).toArray()
    const matchDayCount = leagueTeams.length-1
    let matchDays = []
    let [, ...teamsRotation] = leagueTeams.map((leagueTeam)=> leagueTeam.team)
    for(let matchday = 0 ; matchday < matchDayCount; matchday++) {
      const currentTeamIndexes = [leagueTeams[0].team, ...teamsRotation]
      const matchIndexes = []
      for(let i = 0; i < leagueTeams.length/2 ; i++) {
        matchIndexes.push([currentTeamIndexes[i], currentTeamIndexes[currentTeamIndexes.length-1-i]])
      }
      matchDays.push(matchIndexes)
      teamsRotation.unshift(...teamsRotation.splice(-1, 1))
    }
    shuffleArray(matchDays)
    if(homeaway) {
      let awayMatchDays = []
      matchDays.forEach(matchDay => {
        const awayMatchday = matchDay.map(([home, away])=> [away, home])
        awayMatchDays.push(awayMatchday)
      })
      matchDays = matchDays.concat(awayMatchDays)
    }
    console.log(matchDays)
    let matchesCreated = 0
    let currentMatchDay = 0
    for await(const matchDay of matchDays) {
      for await(const match of matchDay) {
        const response = await internalCreateMatch({league, home:match[0], away:match[1], isInternational:false, matchday: matchDayRef[currentMatchDay]?.name, teams, matches, nationalities, seasonsCollect})
        console.log(response)
        matchesCreated++
      }
      currentMatchDay++
    }

    return `Success, ${matchesCreated} matches created.`
  })
  return updateResponse({application_id, token, content: response})
}

export const generateGroupCmd = {
  name: 'generategroup',
  description: 'Generate the group\'s matches',
  type: 1,
  options: [{
    type: 3,
    name: 'league',
    description: 'League',
    required: true,
    choices: fixturesChannels.map(({name, value})=> ({name, value}))
  },{
    type: 5,
    name: 'homeaway',
    description: 'With an Home Away phase?',
    required: false
  }]
}