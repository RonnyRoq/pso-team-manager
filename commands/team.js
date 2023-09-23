import { InteractionResponseType } from "discord-interactions"
import { DiscordRequest } from "../utils.js"
import { displayTeam, genericFormatMatch } from "../functions/helpers.js"

export const team = async ({interaction_id, token, options, member, dbClient})=> {
  let response = "No teams found"
  let matchEmbeds = []
  const [role] = options || []
  let roles = []
  if(!role) {
    roles = member.roles.map(role=>({id:role}))
  } else {
    roles = [{id: role.value}]
  }
  await dbClient(async ({teams, matches})=>{            
    const team = await teams.findOne({active:true, $or:roles})
    response = displayTeam(team)
    const teamsMatches = await matches.find({$or: [{home: team.id}, {away: team.id}], finished: null}).sort({dateTimestamp: 1}).toArray()
    const allTeams = await teams.find({active: true}).toArray()
    response += '\r**Upcoming matches:**'
    if(teamsMatches.length === 0 ) {
      response += '\rNone'
    } else {
      let i = 0
      let currentEmbed = ''
      for (const match of teamsMatches) {
        currentEmbed += genericFormatMatch(allTeams, match)
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
  })
  const embeds = matchEmbeds.map(matchEmbed => ({
    "type": "rich",
    "color": 16777215,
    "title": "Matches",
    "description": matchEmbed,
  }))
  return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: response,
        embeds,
        flags: 1 << 6
      }
    }
  })
}

export const teamCmd = {
  name: 'team',
  description: 'List team details',
  type: 1,
  options: [{
    type: 8,
    name: 'team',
    description: 'Team'
  }]
}