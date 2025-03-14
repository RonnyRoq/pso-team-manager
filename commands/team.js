import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { DiscordRequest } from "../utils.js"
import { displayTeam, genericFormatMatch, getCurrentSeason, optionsToObject, updateResponse, waitingMsg } from "../functions/helpers.js"
import { getAllLeagues, getAllNationalities } from "../functions/allCache.js"
import { getPlayersList } from "./player.js"
import { getAllPlayers } from "../functions/playersCache.js"

export const team = async ({interaction_id, application_id, token, guild_id, options, member, dbClient})=> {
  let response = "No teams found"
  let matchEmbeds = []
  const {team, allmatches, league} = optionsToObject(options || [])
  let roles = []
  if(!team) {
    roles = member.roles.map(role=>({id:role}))
  } else {
    roles = [{id: team}]
  }
  await waitingMsg({interaction_id, token})
  
  const content = await dbClient(async ({teams, matches, seasonsCollect, contracts, players, leagueConfig})=>{
    const team = await teams.findOne({active:true, $or:roles})
    if(!team)
    {
      return 'No team found'
    }
    response = displayTeam(team)
    const [allPlayers, allNations, teamContracts] = await Promise.all([getAllPlayers(guild_id), getAllNationalities(),
      contracts.find({team:team.id, endedAt: null}).toArray()
    ])
    const displayCountries = Object.fromEntries(allNations.map(({name, flag})=> ([name, flag])))
    const content = await getPlayersList(allPlayers, team.id, displayCountries, players, teamContracts )
    const finished = allmatches ? {} : {finished: null}
    const leagueCondition = league ? {league} : {}
    if(league) {
      const leagueSelected = await leagueConfig.findOne({value: league})
      if(!leagueSelected) {
        return `Failed to find League ${league}`
      }
    }
    const season = await getCurrentSeason(seasonsCollect)
    const teamsMatches = await matches.find({$or: [{home: team.id}, {away: team.id}], ...finished, ...leagueCondition, season }).sort({dateTimestamp: 1}).toArray()
    const allTeams = await teams.find({}).toArray()
    response += '\r**Upcoming matches:**'
    if(teamsMatches.length === 0 ) {
      response += '\rNone'
    } else {
      let i = 0
      let currentEmbed = ''
      const allLeagues = await getAllLeagues()
      for (const match of teamsMatches) {
        currentEmbed += '\r'+genericFormatMatch(allTeams, match, allLeagues)
        i++
        if(i === 4) {
          matchEmbeds.push(currentEmbed)
          currentEmbed = ''
          i = 0
        }
      }
      if(i!==0) {
        matchEmbeds.push(currentEmbed)
      }
    }
    return content
  })
  const embeds = matchEmbeds.map(matchEmbed => ({
    "type": "rich",
    "color": 16777215,
    "title": "Matches",
    "description": matchEmbed,
  }))
  await updateResponse({application_id, token, content: response.substring(0,1999), embeds})
  let i = 3
  while (i<embeds.length) {
    const currentEmbed = embeds.slice(i, i+3)
    //console.log(currentEmbed)
    await DiscordRequest(`/webhooks/${application_id}/${token}`, {
      method: 'POST',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        content: `Page ${Math.floor(i/3 + 1)}`,
        embeds: currentEmbed,
        flags: InteractionResponseFlags.EPHEMERAL,
      }
    })
    i+=3
  }
  await DiscordRequest(`/webhooks/${application_id}/${token}`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      content:content.substring(0, 1999),
      flags: InteractionResponseFlags.EPHEMERAL,
    }
  })
}


export const teamCmd = {
  name: 'team',
  description: 'List team details',
  type: 1,
  psaf: true,
  func: team,
  options: [{
    type: 8,
    name: 'team',
    description: 'Team'
  },{
    type: 5,
    name: 'allmatches',
    description: "Show finished matches?"
  }, {
    type: 3,
    name: 'league',
    description: 'League',
    autocomplete: true,
  }]
}

export default [teamCmd]