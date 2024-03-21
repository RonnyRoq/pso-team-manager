import { fixturesChannels } from "../../config/psafServerConfig.js"
import { autocompleteCountries, optionsToObject, quickResponse } from "../../functions/helpers.js"

export const addToLeague = async ({interaction_id, token, options, dbClient}) => {
  const {league, team} = optionsToObject(options)
  const leagueObj = fixturesChannels.find(leagueEntry => leagueEntry.value === league)
  const content = await dbClient(async ({leagues})=> {
    if(leagueObj?.isInternational && !autocompleteCountries.some(country=> country.name === team)){
      return Promise.resolve(`Can't add ${team}, not a nation.`)
    }
    await leagues.insertOne({leagueId: league, team})
    const leagueTeams = await leagues.find({leagueId:league}).toArray()
    return `${fixturesChannels.find(leagueEntry => leagueEntry.value === leagueTeams[0]?.leagueId)?.name} ${leagueTeams.length} teams:\r`
    + leagueTeams.map(leagueTeam => leagueObj.isInternational ? leagueTeam.team :`<@&${leagueTeam.team}>`).join('\r')
  })
  return quickResponse({interaction_id, token, content, isEphemeral:true})
}

export const removeFromLeague = async ({interaction_id, token, options, dbClient}) => {
  const {league, team} = optionsToObject(options)
  const leagueObj = fixturesChannels.find(leagueEntry => leagueEntry.value === league)
  const content = await dbClient(async ({leagues})=> {
    if(leagueObj?.isInternational && !autocompleteCountries.some(country=> country.name === team)){
      return Promise.resolve(`Can't remove ${team}, not a nation.`)
    }
    await leagues.deleteOne({leagueId: league, team})
    const leagueTeams = await leagues.find({leagueId:league}).toArray()
    return `${fixturesChannels.find(leagueEntry => leagueEntry.value === leagueTeams[0]?.leagueId)?.name} ${leagueTeams.length} teams:\r`
    + leagueTeams.map(leagueTeam => leagueObj.isInternational ? leagueTeam.team :`<@&${leagueTeam.team}>`).join('\r')
  })
  return quickResponse({interaction_id, token, content, isEphemeral:true})
}

export const addToLeagueCmd = {
  name: 'addtoleague',
  description: 'Add a team to a league',
  type: 1,
  options: [{
    type: 3,
    name: 'league',
    description: 'League',
    required: true,
    choices: fixturesChannels.filter(league=>!league.isInternational).map(({name, value})=> ({name, value}))
  },{
    type: 8,
    name: 'team',
    description: 'Team',
    required: true
  }]
}


export const addToInterLeagueCmd = {
  name: 'addtointerleague',
  description: 'Add a team to an international league',
  type: 1,
  options: [{
    type: 3,
    name: 'league',
    description: 'League',
    required: true,
    choices: fixturesChannels.filter(league=>league.isInternational).map(({name, value})=> ({name, value}))
  },{
    type: 3,
    name: 'team',
    description: 'Team',
    autocomplete: true,
    required: true,
  }]
}

export const removeFromLeagueCmd = {
  name: 'removefromleague',
  description: 'Remove a team from a league',
  type: 1,
  options: [{
    type: 3,
    name: 'league',
    description: 'League',
    required: true,
    choices: fixturesChannels.map(({name, value})=> ({name, value}))
  },{
    type: 8,
    name: 'team',
    description: 'Team',
    required: true
  }]
}