import { InteractionResponseType } from "discord-interactions"
import { getAllLeagues } from "./allCache.js"

export const autoCompleteLeague = async (currentOption, dbClient, res, state='active') => {
  const toSearch = (currentOption.value || "").toLowerCase()
  const autoCompleteLeagues = (await getAllLeagues()) || []
  const searchLeagues = autoCompleteLeagues.map(({name, value, active})=> ({name, value, display: `${name}`, search: name.toLowerCase(), active}))
  const allChoices = searchLeagues
  .filter((league)=> state==='all' || (state === 'active' && league.active) || (state === 'inactive' && !league.active))
  .filter(({search}) => toSearch.length === 0 || search.includes(toSearch))
  const leagueChoices = (allChoices || [])
    .slice(0, 24)
  return res.send({
    type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    data: {
      choices : leagueChoices.map(({name, value})=> ({name, value }))
    }
  })
}