import NodeCache from "node-cache";
import { sleep } from "./helpers.js";

const leaguesCache = new NodeCache({ useClones: false})

export const initAllLeagues = (allLeagues) => {
  leaguesCache.set("leagues", allLeagues)
}

export const refreshAllLeagues = async (leagueConfig) => {  
  const allLeagues = await leagueConfig.find({archived: {$ne: true}}).sort({order: 1})
  initAllLeagues(allLeagues)
}

export const getAllLeagues = async () => {
  let allLeagues = leaguesCache.get("leagues")
  while(!allLeagues || allLeagues.length === 0) {
    await sleep(5000)
    allLeagues = leaguesCache.get("leagues")
  }
  
  return allLeagues
}
