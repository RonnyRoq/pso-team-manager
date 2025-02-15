import { autoCompleteSelections } from "./commands/nationalTeam"
import { autoCompleteNation } from "./commands/player"
import { autoCompleteLeague } from "./functions/autoComplete"

export const autoCompleteCommand = ({data, dbClient, res, member}) => {
  let optionChanged = data.options.find(option=> option.focused)
  if(!optionChanged)
    optionChanged = data.options?.[0]?.options.find(option => option.focused)
  if(data.name==="editplayer"){
    return autoCompleteNation(optionChanged, dbClient, res)
  }
  if(data.name === "nationalteam"){
    return autoCompleteNation(optionChanged, dbClient, res)
  }
  if(data.name === "selectionmatch"){
    return autoCompleteSelections(optionChanged, dbClient, res)
  }
  if(optionChanged.name === "selection") {
    return autoCompleteSelections(optionChanged, dbClient, res, member)
  }
  if(optionChanged.name === "eligiblenationality") {
    return autoCompleteNation(optionChanged, dbClient, res)
  }
  if(optionChanged.name === "nationality") {
    return autoCompleteNation(optionChanged, dbClient, res)
  }
  if(optionChanged.name === "league") {
    return autoCompleteLeague(optionChanged, dbClient, res)
  }
  if(optionChanged) {
    return autoCompleteNation(optionChanged, dbClient, res)  
  }
  return autoCompleteNation(data, dbClient, res)
}