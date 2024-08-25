import NodeCache from "node-cache";
import { sleep } from "./helpers.js";

const allCache = new NodeCache({ useClones: false})
export const cacheKeys = {
  leagues: 'leagues',
  nationalities: 'nationalities'
}

export const initCache = (key, value) => {
  allCache.set(key, value)
}

export const refreshAllLeagues = async (leagueConfig) => {  
  const allLeagues = await leagueConfig.find({archived: {$ne: true}}).sort({order: 1})
  initCache(cacheKeys.leagues, allLeagues)
}

export const refreshAllNationalities = async(nationalities) => {
  const allNationalities = await nationalities.find({})
  initCache(cacheKeys.nationalities, allNationalities)
}

export const getCache = async (key) => {
  let values = allCache.get(key)
  while(!values || values.length === 0) {
    await sleep(5000)
    values = allCache.get(key)
  }
  
  return values
}

export const getAllLeagues = async () => {
  return getCache(cacheKeys.leagues)
}

export const getAllNationalities = async () => {
  return getCache(cacheKeys.nationalities)
}
