import { allLeagues, leagueChoices } from "../../config/leagueData.js"
import { serverChannels, serverRoles } from "../../config/psafServerConfig.js"
import { getAllSelectionsFromDbClient } from "../../functions/countriesCache.js"
import { getCurrentSeason, optionsToObject, postMessage, quickResponse, silentResponse, updateResponse, waitingMsg } from "../../functions/helpers.js"
import { getAllLeagues } from "../../functions/allCache.js"
import { editAMatchInternal } from "../match.js"

export const showLeagueTeam = (leagueObj, leagueTeam) => leagueObj.isInternational ? leagueTeam.team :`<@&${leagueTeam.team}>${leagueTeam.group? ` - Group ${leagueTeam.group}`: ''}${leagueTeam.position!==undefined? ` - Spot ${leagueTeam.position+1}`: ''}`

export const addToLeague = async ({interaction_id, token, options, dbClient}) => {
  const {league, team, selection, group, position} = optionsToObject(options)
  const allLeagues = await getAllLeagues()
  const leagueObj = allLeagues.find(leagueEntry => leagueEntry.value === league)
  const content = await dbClient(async ({leagues, nationalTeams})=> {
    const autocompleteCountries = await getAllSelectionsFromDbClient(nationalTeams)
    if(leagueObj?.isInternational && !autocompleteCountries.some(country=> country.shortname === selection)){
      return Promise.resolve(`Can't add ${selection}, not a nation.`)
    }
    const insert = {
      leagueId: league,
      team: leagueObj?.isInternational ? selection: team,
    }
    if(group !== undefined) {
      insert.group = group
    }
    if(position !== undefined) {
      insert.position = position
    }
    await leagues.updateOne({leagueId: league, team: insert.team}, {$set: insert}, {upsert: true})
    const leagueTeams = await leagues.find({leagueId:league}).sort({position: 1}).toArray()
    return `${leagueObj?.name} ${leagueTeams.length} teams:\r`
    + leagueTeams.map(leagueTeam => showLeagueTeam(leagueObj, leagueTeam)).join('\r')
  })
  return quickResponse({interaction_id, token, content, isEphemeral:true})
}

export const removeFromLeague = async ({interaction_id, token, options, dbClient}) => {
  const {league, team, selection} = optionsToObject(options)
  const allLeagues = await getAllLeagues()
  const leagueObj = allLeagues.find(leagueEntry => leagueEntry.value === league)
  const content = await dbClient(async ({leagues, nationalTeams})=> {
    const autocompleteCountries = await getAllSelectionsFromDbClient(nationalTeams)
    if(leagueObj?.isInternational && !autocompleteCountries.some(country=> country.shortname === selection)){
      return Promise.resolve(`Can't remove ${selection}, not a nation.`)
    }
    await leagues.deleteOne({leagueId: league, team: leagueObj?.isInternational ? selection : team})
    const leagueTeams = await leagues.find({leagueId:league}).toArray()
    return `${leagueObj?.name} ${leagueTeams.length} teams:\r`
    + leagueTeams.map(leagueTeam => showLeagueTeam(leagueObj, leagueTeam)).join('\r')
  })
  return quickResponse({interaction_id, token, content, isEphemeral:true})
}

export const replaceTeamInLeague = async ({interaction_id, application_id, member, token, options, dbClient}) => {
  if(!member.roles.includes(serverRoles.presidentRole)){
    return silentResponse({interaction_id, token, content: 'Reserved to presidents'})
  }
  await waitingMsg({interaction_id, token})
  const {removeteam, addteam, league} = optionsToObject(options)
  const content = await dbClient(async({leagues, leagueConfig, teams, matches, nationalTeams, seasonsCollect})=>{
    const leagueToUpdate = await leagueConfig.findOne({active: true, value: league})
    let result = ''
    if(leagueToUpdate){
      await leagues.updateOne({league, team:removeteam}, {$set: {team: addteam}})
      const season = await getCurrentSeason(seasonsCollect)
      const matchesToReplace = await matches.find({league, season, $or: [{home: removeteam }, {away: removeteam}]}).toArray()
      for await (const match of matchesToReplace){
        await editAMatchInternal({id: match._id.toString(), home: match.home === removeteam ? addteam : match.home, away: match.away === removeteam ? addteam: match.away, teams, matches, nationalTeams, leagueConfig})
      }
      result = `${matchesToReplace.length} matches updated: ${matchesToReplace.map(match=> match._id.toString())} in ${leagueToUpdate.name}`
    }
    return result
  })
  return updateResponse({application_id, token, content})
}

const updateTeamPenaltyPoints = async ({interaction_id, application_id, token, callerId, options, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const {team, league, penaltypoints} = optionsToObject(options)
  const points = Math.abs(penaltypoints)
  const content = await dbClient(async({leagues, teams, leagueConfig})=>{
    const [dbTeam, leagueEntry, leagueDefinition] = await Promise.all([teams.findOne({id: team }), leagues.findOne({leagueId: league, team}), leagueConfig.findOne({value: league})])
    if(!(dbTeam && leagueEntry && leagueDefinition)) {
      return `Can't find <@&${team}> in ${leagueDefinition?.name || 'this league'}.`
    }
    await leagues.updateOne({leagueId: league, team}, {$set:{penaltypoints: points}})
    await postMessage({channel_id: serverChannels.botActivityLogsChannelId, content: `<@${callerId}> updated <@&${team}> penalty points in ${leagueDefinition.name} to -${points} points`})
    return `<@&${team}> has now -${points} points in ${leagueDefinition.name}`
  })
  return updateResponse({application_id, token, content})
}

const groups = ['A', 'B', 'C', 'D']

export const addToLeagueCmd = {
  name: 'addtoleague',
  description: 'Add a team to a league',
  type: 1,
  psaf: true,
  func: addToLeague,
  options: [{
    type: 3,
    name: 'league',
    description: 'League',
    required: true,
    choices: allLeagues.filter(league=>!league.isInternational && league.active).map(({name, value})=> ({name, value}))
  },{
    type: 8,
    name: 'team',
    description: 'Team',
    required: true
  },{
    type: 3,
    name: 'group',
    description: 'Which League group',
    choices: groups.map(group=> ({name: group, value: group}))
  },{
    type: 4,
    name: 'position',
    description: 'Which position (elim cups only)',
  }]
}


export const addToCupCmd = {
  name: 'addtocup',
  description: 'Add a team to a cup',
  type: 1,
  options: [{
    type: 3,
    name: 'league',
    description: 'Cup',
    required: true,
    choices: allLeagues.filter(league=>!league.isInternational && league.active).map(({name, value})=> ({name, value}))
  },{
    type: 8,
    name: 'team',
    description: 'Team',
    required: true
  },{
    type: 4,
    name: 'position',
    description: 'Which position'
  }]
}


export const addToInterLeagueCmd = {
  name: 'addtointerleague',
  description: 'Add a National Selection to an international league',
  type: 1,
  psaf: true,
  func: addToLeague,
  options: [{
    type: 3,
    name: 'league',
    description: 'League',
    required: true,
    choices: allLeagues.filter(league=>league.isInternational && league.active).map(({name, value})=> ({name, value}))
  },{
    type: 3,
    name: 'selection',
    description: 'Selection',
    autocomplete: true,
    required: true,
  },{
    type: 3,
    name: 'group',
    description: 'Which League group',
    choices: groups.map(group=> ({name: group, value: group}))
  },{
    type: 4,
    name: 'position',
    description: 'Which position (elim cups only)',
  }]
}

export const removeFromLeagueCmd = {
  name: 'removefromleague',
  description: 'Remove a team from a league',
  type: 1,
  psaf: true,
  func: removeFromLeague,
  options: [{
    type: 3,
    name: 'league',
    description: 'League',
    required: true,
    choices: leagueChoices
  },{
    type: 8,
    name: 'team',
    description: 'Team',
    required: true
  }]
}

export const removeFromInterLeagueCmd = {
  name: 'removefrominterleague',
  description: 'Remove a selection from a league',
  type: 1,
  psaf: true,
  func: removeFromLeague,
  options: [{
    type: 3,
    name: 'league',
    description: 'League',
    required: true,
    choices: leagueChoices
  },{
    type: 8,
    name: 'selection',
    description: 'Selection',
    autocomplete: true,
    required: true
  }]
}

export const replaceTeamInLeagueCmd = {
  name: 'replaceteaminleague',
  description: 'Replace a FFed team by another one in a league',
  type: 1,
  psaf: true,
  func: replaceTeamInLeague,
  options: [{
    type: 3,
    name: 'league',
    description: 'League',
    required: true,
    choices: leagueChoices,
  },{
    type: 8,
    name: 'removeteam',
    description: 'Team to remove',
    required: true
  },{
    type: 8,
    name: 'addteam',
    description: 'Team to add',
    required: true
  }]
}

const updateTeamPenaltyPointsCmd = {
  name: 'updateteampenaltypoints',
  description: 'Update the number of penalty points for a team in a league',
  type: 1,
  psaf: true,
  func: updateTeamPenaltyPoints,
  options: [{
    type: 3,
    name: 'league',
    description: 'League',
    required: true,
    choices: leagueChoices
  },{
    type: 8,
    name: 'team',
    description: 'Team to penalise',
    required: true
  },{
    type: 4,
    name: 'penaltypoints',
    description: 'How much NEGATIVE points the team has in TOTAL',
    required: true,
    min: 0
  }]
}

export default [updateTeamPenaltyPointsCmd, addToLeagueCmd, addToInterLeagueCmd, removeFromLeagueCmd, replaceTeamInLeagueCmd]