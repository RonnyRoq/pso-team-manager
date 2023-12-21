import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { fixturesChannels } from "../../config/psafServerConfig.js"
import { optionsToObject } from "../../functions/helpers.js"
import { DiscordRequest } from "../../utils.js"


export const leagueTeams = async ({options, dbClient, interaction_id, token}) => {
  const {league} = optionsToObject(options)
  const teams = await dbClient(async ({leagues})=>{
    return leagues.find({leagueId: league}).toArray()
  })
  const leagueObj = fixturesChannels.find(fixtureLeague=> fixtureLeague.value === league)
  const content = `${leagueObj.name} teams:\r`
    + teams.map(({team})=> `<@&${team}>`).join('\r')
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

export const leagueTeamsCmd = {
  name: 'leagueteams',
  description: 'Show the teams in a league',
  type: 1,
  options: [{
    type: 3,
    name: 'league',
    description: 'League',
    required: true,
    choices: fixturesChannels.map(({name, value})=> ({name, value}))
  }]
}