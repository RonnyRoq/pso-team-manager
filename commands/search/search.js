import NodeCache from "node-cache"
import { optionsToObject, sleep, updateResponse, waitingMsg } from "../../functions/helpers.js"
import { getAllPlayers } from "../../functions/playersCache.js"

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
    const [discPlayers, dbPlayers, allTeams, allNationalTeams, allNationalities] = await Promise.all([
      getAllPlayers(process.env.GUILD_ID),
      getAllPlayersFromDbClient(searchPlayers),
      getAllTeamsFromDbClient(searchTeams),
      getAllSelectionsFromDbClient(searchNationalSelections),
      getAllCountriesFromNationalities(nationalities),
    ])
    const ids = {
      players: dbPlayers.filter(player => player.nick.includes(searchString) || player.ingamename.includes(searchString)).map(player=> player.id),
      teams: allTeams.filter(team => team.name.includes(searchString) || team.shortName.includes(searchString)).map(team=> team.id),
      selections: allNationalTeams.filter(selection => selection.name.includes(searchString) || selection.shortName.includes(searchString)).map(selection=> selection.shortName.toUpperCase()),
      nationalities: allNationalities.filter(nationality => nationality.name.includes(searchString))
    }
    const discPlayersMap = new Map(discPlayers.map(player => ([player.user.id, player])))
    const [playersDocs, teamsDocs, selectionsDocs] = await Promise.all([
      players.find({id: {$in: ids.players}}).toArray(),
      teams.find({id: {$in: ids.teams}}).toArray(),
      nationalTeams.find({shortname: {$in: ids.selections}}).toArray()
    ])
    const fullPlayers = playersDocs.map(player => {
      const discPlayer = discPlayersMap.get(player.id) || {}
      return {
        ...player,
        ...discPlayer
      }
    })
    return {
      players: fullPlayers,
      teams: teamsDocs,
      selections: selectionsDocs,
      nationalities: ids.nationalities
    }
  })
  searchCache.set(searchString, response)
  return response
}
const internalAdminSearch = async ({dbClient, text}) => {
  const searchString = text.toLowerCase().trim()
  const cachedRes = searchCache.get(searchString)
  if(cachedRes) 
    return cachedRes
  const response = await dbClient(async ({searchPlayers, searchTeams, searchNationalSelections, nationalities, players, teams, nationalTeams})=> {
    const [discPlayers, dbPlayers, allTeams, allNationalTeams, allNationalities] = await Promise.all([
      getAllPlayers(process.env.GUILD_ID),
      getAllPlayersFromDbClient(searchPlayers),
      getAllTeamsFromDbClient(searchTeams),
      getAllSelectionsFromDbClient(searchNationalSelections),
      getAllCountriesFromNationalities(nationalities),
    ])
    const ids = {
      players: dbPlayers.filter(player => (player.nick||'').includes(searchString) || (player.ingamename||'').includes(searchString) || (player.steam||'').includes(searchString) || (player.steamId||'').includes(searchString) || (player.uniqueId||'').includes(searchString)).map(player=> player.id),
      teams: allTeams.filter(team => team.name.includes(searchString) || team.shortName.includes(searchString)).map(team=> team.id),
      selections: allNationalTeams.filter(selection => selection.name.includes(searchString) || selection.shortName.includes(searchString)).map(selection=> selection.shortName.toUpperCase()),
      nationalities: allNationalities.filter(nationality => nationality.name.includes(searchString))
    }
    const discPlayersMap = new Map(discPlayers.map(player => ([player.user.id, player])))
    const [playersDocs, teamsDocs, selectionsDocs] = await Promise.all([
      players.find({id: {$in: ids.players}}).toArray(),
      teams.find({id: {$in: ids.teams}}).toArray(),
      nationalTeams.find({shortname: {$in: ids.selections}}).toArray()
    ])
    const fullPlayers = playersDocs.map(player => {
      const discPlayer = discPlayersMap.get(player.id) || {}
      return {
        ...player,
        ...discPlayer
      }
    })
    return {
      players: fullPlayers,
      teams: teamsDocs,
      selections: selectionsDocs,
      nationalities: ids.nationalities
    }
  })
  searchCache.set(searchString, response)
  return response
}

export const adminSearch = async ({interaction_id, token, application_id, dbClient, options}) => {
  await waitingMsg({interaction_id, token})
  const {text} = optionsToObject(options)
  const {players, teams, selections, nationalities} = await internalAdminSearch({dbClient, text:text.toLowerCase()})
  let content = 'Search results:\r'
  if(players.length) {
    content+='Player(s):\r'
    content+=players.map(player=> `<@${player.id}> - ${player.nick} ${player.name} ${player.steam} ${player.steamId} ${player.uniqueId}`).join('\r')
  }
  if(teams.length) {
    content+='\rTeams:\r'
    content+=teams.map(team=> `<@&${team.id}> ${team.name}`).join('\r')
  }
  if(selections.length) {
    content+='\rNational teams:\r'
    content+= selections.map(selection=> `${selection.name}`).join('\r')
  }
  if(nationalities.length) {
    content+='\rNationalites:\r'
    content+=nationalities.map(nat=> `${nat.flag} ${nat.name}`).join('\r')
  }
  return updateResponse({application_id, token, content})
}


export const adminSearchCmd = {
  name: 'search',
  description: 'Search for details in PSAF',
  type: 1,
  psaf: true,
  func: adminSearch,
  options: [
    {
      type: 3,
      name: 'text',
      description: "What you are looking for",
      required: true,
    }
  ]
}

export default [adminSearchCmd]