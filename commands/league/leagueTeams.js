import { optionsToObject, silentResponse } from "../../functions/helpers.js"
import { showLeagueTeam } from "./addToLeague.js"
import { getAllLeagues } from "../../functions/allCache.js"


const leagueTeams = async ({options, dbClient, interaction_id, token}) => {
  const {league} = optionsToObject(options)
  const teams = await dbClient(async ({leagues})=>{
    return leagues.find({leagueId: league}).toArray()
  })
  const allLeagues = await getAllLeagues()
  console.log(allLeagues)
  const leagueObj = allLeagues.find(fixtureLeague=> fixtureLeague.value === league)
  console.log(leagueObj)
  const content = `${leagueObj.name} ${teams.length} teams:\r`
    + teams.map((leagueTeam)=> showLeagueTeam(leagueObj, leagueTeam)).join('\r')
  return silentResponse({interaction_id, token, content})
}

const leagueTeamsCmd = {
  name: 'leagueteams',
  description: 'Show the teams in a league',
  type: 1,
  psaf: true,
  func: leagueTeams,
  options: [{
    type: 3,
    name: 'league',
    description: 'League',
    required: true,
    autocomplete: true,
  }]
}

export default [leagueTeamsCmd]