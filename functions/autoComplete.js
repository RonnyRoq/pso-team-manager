import { InteractionResponseType } from "discord-interactions"
import { getAllLeagues } from "./leaguesCache.js"

export const autoCompleteLeague = async (currentOption, dbClient, res) => {
  const toSearch = (currentOption.value || "").toLowerCase()
  const autoCompleteLeagues = await getAllLeagues()
  const searchLeagues = autoCompleteLeagues.map(({name, value})=> ({name, value, display: `${name}`, search: name.toLowerCase()}))
  const leagueChoices = searchLeagues
    .filter(({search}) => toSearch.length === 0 || search.includes(toSearch))
    .slice(0, 24)
  return res.send({
    type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    data: {
      choices : leagueChoices.map(({name, value})=> ({name, value }))
    }
  })
}