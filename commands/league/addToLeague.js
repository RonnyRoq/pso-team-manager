import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { fixturesChannels } from "../../config/psafServerConfig.js"
import { optionsToObject } from "../../functions/helpers.js"
import { DiscordRequest } from "../../utils.js"

export const addToLeague = async ({interaction_id, token, options, dbClient}) => {
  const {league, team} = optionsToObject(options)
  const content = await dbClient(async ({leagues})=> {
    await leagues.insertOne({leagueId: league, team})
    const leagueTeams = await leagues.find({leagueId:league}).toArray()
    return `${fixturesChannels.find(leagueEntry => leagueEntry.value === leagueTeams[0]?.leagueId)?.name} teams:\r`
    + leagueTeams.map(leagueTeam => `<@&${leagueTeam.team}>`).join('\r')
  })
  return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content
      }
    }
  })
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
    choices: fixturesChannels.map(({name, value})=> ({name, value}))
  },{
    type: 8,
    name: 'team',
    description: 'Team',
    required: true
  }]
}