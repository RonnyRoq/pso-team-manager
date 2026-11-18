import { InteractionResponseType } from "discord-interactions"
import { getRegisteredRole, handleSubCommands, optionsToObject, updateResponse } from "../../functions/helpers.js"
import { getAllSquads } from "../../functions/squadsCache.js"
import { DiscordRequest } from "../../utils"
import { getFastCurrentSeason } from "../season"
import { serverChannels } from "../../config/psafServerConfig"

export const autoCompleteSquads = async (currentOption, dbClient, res) => {
  const toSearch = (currentOption.value || "").toLowerCase()
  let autoCompleteSquads = await getAllSquads(dbClient)
  const searchSquads = autoCompleteSquads.map(({name, shortname})=> ({name, shortname, display: `${shortname} - ${name}`, search: name.toLowerCase()}))
  const squadChoices = searchSquads
    .filter(({search}) => toSearch.length === 0 || search.includes(toSearch))
    .slice(0, 24)
  return res.send({
    type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    data: {
      choices : squadChoices.map(({name, shortname})=> ({name: name, value: shortname}))
    }
  })
}


const squadAdd = async ({application_id, token, guild_id, options, callerId, member, dbClient}) => {
  const {player, squad} = optionsToObject(options)
  const discResp = await DiscordRequest(`/guilds/${guild_id}/members/${player}`, { method: 'GET' })
  const discPlayer = await discResp.json()
  const season = getFastCurrentSeason()
    
  const content = await dbClient(async ({squads, squadContracts, players})=>{
    const callersSquadContracts = await squadContracts.findOne({season, playerId: callerId}).toArray()
    if(!callersSquadContracts) {
      return 'You don\'t have a squad'
    }
    const callersSquadContract = callersSquadContracts.find(contract => contract.squad === squad)
    if(!callersSquadContract.isCaptain) {
      return `You are not a captain of ${squad}.`
    }
    const callersSquad = await squads.find({shortname: callersSquadContract.squad, active: true})
    if(!callersSquad) {
      return `Can't find squad ${squad}. Is it active?`
    }
    if(!discPlayer.roles.includes(getRegisteredRole(guild_id))) {
      return `<@${player}> needs to be registered to be called.`
    }

    const dbPlayer = await players.findOne({id: player})
    
    await squadContracts.updateOne({season, playerId:player, squad}, {$set: {season, playerId:player, squad}}, {upsert: true})
    const [nationalPlayers, selectionNationalities] = await Promise.all([
      nationalContracts.find({season, selection:callersSelection.shortname}).toArray(),
      nationalities.find({name: callersSelection.eligibleNationalities}).toArray()
    ])
    const content = `⭐<@${player}> is selected for ${selectionNationalities.map(nationality=>nationality.flag).join('')} ${callersSelection.name} (by <@${callerId}>)`
    await Promise.all([
      DiscordRequest(`/channels/${serverChannels.nationalSelectionsChannelId}/messages`, {
        method: 'POST',
        body: {
          content
        }
      }),
      DiscordRequest(`/channels/${serverChannels.wcNationalSelectionsChannelId}/messages`, {
        method: 'POST',
        body: {
          content
        }
      }),
    ])

    return formatSquad(callersSelection, selectionNationalities, nationalPlayers)
  })
  return updateResponse({application_id, token, content})
}

const squadRemove = async ({application_id, token, guild_id, options, callerId, member, dbClient}) => {
  const {player} = optionsToObject(options)
  const nationalCaptainRole = getNationalCaptainRole(guild_id)
  if(!member.roles.includes(nationalCaptainRole)) {
    return updateResponse({application_id, token, content: 'You are not able to make selections'})
  }
  const content = await dbClient(async ({nationalTeams, nationalities, seasonsCollect, nationalContracts})=>{
    const season = await getCurrentSeason(seasonsCollect)
    const callersSelectionContract = await nationalContracts.findOne({season, playerId: callerId})
    if(!callersSelectionContract) {
      return `Can't find you as a national player`
    }
    const selectedPlayerContract = await nationalContracts.findOne({season, playerId: player, selection: callersSelectionContract.selection})
    const callersSelection = await nationalTeams.findOne({shortname: callersSelectionContract.selection})
    if(!selectedPlayerContract) {
      return `Can't find <@${player}> in your selection, ${callersSelection.name}.`
    }
    await nationalContracts.deleteOne({season, playerId:player, selection: callersSelection.shortname})
    const [nationalPlayers, selectionNationalities] = await Promise.all([
      nationalContracts.find({season, selection:callersSelection.shortname}).toArray(),
      nationalities.find({name: {$in: callersSelection.eligibleNationalities}}).toArray()
    ])
    const content = `❌<@${player}> has been removed from ${selectionNationalities.map(nationality=>nationality.flag).join('')} ${callersSelection.name} (by <@${callerId}>)`
    await Promise.all([
      DiscordRequest(`/channels/${serverChannels.nationalSelectionsChannelId}/messages`, {
        method: 'POST',
        body: {
          content
        }
      }),
      DiscordRequest(`/channels/${serverChannels.wcNationalSelectionsChannelId}/messages`, {
        method: 'POST',
        body: {
          content
        }
      }),
    ])

    return formatSelection(callersSelection, selectionNationalities, nationalPlayers)
  })
  return updateResponse({application_id, token, content})
}

const squadView = async ({application_id, token, callerId, dbClient}) => {
  const {content, matchEmbeds} = await dbClient(async ({seasonsCollect, nationalContracts, nationalTeams, nationalities, matches})=> {
    const season = await getCurrentSeason(seasonsCollect)
    const currentSelection = await nationalContracts.findOne({season, playerId: callerId})
    const nationalSelection = await nationalTeams.findOne({shortname:currentSelection?.selection})
    if(!nationalSelection) {
      return `Can't find the selection you asked for: ${currentSelection?.selection}`
    }
    const [nationalPlayers, selectionNationalities, teamsMatches, allNationalities, allSelections] = await Promise.all([
      nationalContracts.find({season, selection:currentSelection?.selection}).toArray(),
      nationalities.find({name: nationalSelection.eligibleNationalities}).toArray(),
      matches.find({$or: [{home: nationalSelection.shortname}, {away: nationalSelection.shortname}], season }).sort({dateTimestamp: 1}).toArray(),
      getAllNationalities(),
      getAllSelectionsFromDbClient(nationalTeams)
    ])
    let content = formatSelection(nationalSelection, selectionNationalities, nationalPlayers)
    content += '\r**Upcoming matches:**'
    let matchEmbeds = []
    if(teamsMatches.length === 0 ) {
      content += '\rNone'
    } else {
      let i = 0
      let currentEmbed = ''
      const allLeagues = await getAllLeagues()
      for (const match of teamsMatches) {
        currentEmbed += '\r'+genericInterFormatMatch(allNationalities, allSelections, match, allLeagues)
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
    return {content, matchEmbeds}
  })
  const embeds = matchEmbeds.map(matchEmbed => ({
    "type": "rich",
    "color": 16777215,
    "title": "Matches",
    "description": matchEmbed,
  }))
  return updateResponse({application_id, token, content, embeds})
}

const formatSquad = (nationalSelection, selectionNationalities, nationalPlayers) => {
  return `## ${selectionNationalities.map(nationality=> nationality.flag).join('')} ${nationalSelection.name}\r${nationalPlayers.length} players\r` 
  + nationalPlayers.map(player=> `> <@${player.playerId}>`).join('\r')
}

export const addSelectionCmd = {
  name: 'addselection',
  description: 'Add a player in a selection',
  type: 1,
  func: addSquad,
  psaf: true,
  options: [{
    type: 6,
    name: 'player',
    description: 'Player',
    required: true,
  }, {
    type: 3,
    name: 'selection',
    description: 'Selection',
    autocomplete: true,
    required: true,
  }],
}

export const removeSelectionCmd = {
  name: 'removeselection',
  description: 'Remove a player from a selection',
  type: 1,
  func: removeSquad,
  psaf: true,
  options: [{
    type: 6,
    name: 'player',
    description: 'Player',
    required: true,
  }],
}

export const squad = async (commandPayload) => {
  return handleSubCommands(commandPayload, squadSubCommands)
}
const squadSubCommands = {
  'add': squadAdd,
  'view' : squadView,
  'remove': squadRemove,
}

export const selectionCmd = {
  name: 'selection',
  description: 'Handle national selections',
  psaf: true,
  func: squad,
  options: [{
    type: 1,
    name: 'add',
    description: 'select a player for your squad',
    options: [{
      type: 6,
      name: 'player',
      description: 'Player',
      required: true,
    },{
      type: 3,
      name: 'squad',
      description: 'Squad',
      autocomplete: true,
      required: true,
    }]
  }, {
    type: 1,
    name: 'view',
    description: 'View the list of your selected players',
    options: [{
      type: 3,
      name: 'squad',
      description: 'Squad',
      autocomplete: true,
      required: true,
    }]
  }, {
    type: 1,
    name: 'remove',
    description: 'Remove a player from your squad',
    options: [{
      type: 6,
      name: 'player',
      description: 'Player',
      required: true,
    },{
      type: 3,
      name: 'squad',
      description: 'Squad',
      autocomplete: true,
      required: true,
    }]
  }]
}

export default [selectionCmd, addSelectionCmd, removeSelectionCmd]