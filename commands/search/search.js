import NodeCache from "node-cache"
import { sleep } from "../../functions/helpers.js"

const searchCache = new NodeCache({ stdTTL: 500, checkperiod: 500, useClones: false})
const searchItemsCache = new NodeCache({ stdTTL: 500, checkperiod: 500, useClones: false})

export const getAllTeamsFromDbClient = async (searchTeams) => {
  let allTeams = searchItemsCache.get("teams")
  if(allTeams) {
    while(allTeams.length === 0) {
      await sleep(1000)
      allTeams = searchItemsCache.get("teams")
    }  
    return allTeams
  }
  
  searchItemsCache.set("teams", [])

  const teamsRes = await searchTeams.find({}).toArray()
  searchItemsCache.set("teams", teamsRes)
  return teamsRes
}

export const getAllPlayersFromDbClient = async (searchPlayers) => {
  let allPlayers = searchItemsCache.get("players")
  if(allPlayers) {
    while(allPlayers.length === 0) {
      await sleep(1000)
      allPlayers = searchItemsCache.get("players")
    }  
    return allPlayers
  }
  
  searchItemsCache.set("players", [])

  const playersRes = await searchPlayers.find({}).toArray()
  searchItemsCache.set("players", playersRes)
  return playersRes
}

export const getAllSelectionsFromDbClient = async (searchNationalSelections) => {
  let allCountries = searchItemsCache.get("selections")
  if(allCountries) {
    while(allCountries.length === 0) {
      await sleep(1000)
      allCountries = searchItemsCache.get("selections")
    }  
    return allCountries
  }
  
  searchItemsCache.set("selections", [])

  const countries = await searchNationalSelections.find({}).toArray()
  searchItemsCache.set("selections", countries)
  return countries
}

export const getAllCountriesFromNationalities = async (nationalities) => {
  let allCountries = searchItemsCache.get("countries")
  if(allCountries) {
    while(allCountries.length === 0) {
      await sleep(1000)
      allCountries = searchItemsCache.get("countries")
    }  
    return allCountries
  }
  
  searchItemsCache.set("countries", [])

  const countries = await nationalities.find({}).toArray()
  searchItemsCache.set("countries", countries)
  return countries
}

export const globalSearch = async ({dbClient, s}) => {
  const searchString = s.toLowerCase().trim()
  const cachedRes = searchCache.get(searchString)
  if(cachedRes) 
    return cachedRes
  const response = await dbClient(async ({searchPlayers, searchTeams, searchNationalSelections, nationalities, players, teams, nationalTeams})=> {
    const [allPlayers, allTeams, allNationalTeams, allNationalities] = await Promise.all([
      getAllPlayersFromDbClient(searchPlayers),
      getAllTeamsFromDbClient(searchTeams),
      getAllSelectionsFromDbClient(searchNationalSelections),
      getAllCountriesFromNationalities(nationalities),
    ])
    const ids = {
      players: allPlayers.filter(player => player.nick.includes(searchString) || player.ingamename.includes(searchString)).map(player=> player.id),
      teams: allTeams.filter(team => team.name.includes(searchString) || team.shortName.includes(searchString)).map(team=> team.id),
      selections: allNationalTeams.filter(selection => selection.name.includes(searchString) || selection.shortName.includes(searchString)).map(selection=> selection.shortName.toUpperCase()),
      nationalities: allNationalities.filter(nationality => nationality.name.includes(searchString))
    }
    const [playersDocs, teamsDocs, selectionsDocs] = await Promise.all([
      players.find({id: {$in: ids.players}}).toArray(),
      teams.find({id: {$in: ids.teams}}).toArray(),
      nationalTeams.find({shortname: {$in: ids.selections}}).toArray()
    ])
    return {
      players: playersDocs,
      teams: teamsDocs,
      selections: selectionsDocs,
      nationalities: ids.nationalities
    }
  })
  searchCache.set(searchString, response)
  return response
}