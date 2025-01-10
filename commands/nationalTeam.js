import { InteractionResponseType } from "discord-interactions"
import { DiscordRequest } from "../utils.js"
import { getAllPlayers } from "../functions/playersCache.js"
import { genericInterFormatMatch, getCurrentSeason, getNationalCaptainRole, getPlayerNick, getRegisteredRole, handleSubCommands, optionsToObject, quickResponse, removeInternational, silentResponse, updateResponse, waitingMsg } from "../functions/helpers.js"
import { getAllSelections, getAllSelectionsFromDbClient } from "../functions/countriesCache.js"
import { serverChannels, serverRoles } from "../config/psafServerConfig.js"
import { getAllLeagues, getAllNationalities } from "../functions/allCache.js"

const nationalTeamPlayerRole = '1103327647955685536'
/*
const getNationalTeamPostInsideDb = async (allPlayers, players, nation) => {
  const countryPlayers = await players.find({nat1: nation.name}, {projection: {id:1}}).toArray()
  const countryPlayerIds = countryPlayers.map(({id})=> id)
  const teamPlayers = allPlayers.filter(({user, roles}) => countryPlayerIds.includes(user.id) && roles.includes(nationalTeamPlayerRole)).sort((playerA, playerB) => {
    const aManager = playerA.roles.includes(serverRoles.nationalTeamCaptainRole)
    const bManager = playerB.roles.includes(serverRoles.nationalTeamCaptainRole)
    if(aManager === bManager) {
      return getPlayerNick(playerA).localeCompare(getPlayerNick(playerB))
    } else if (aManager) {
      return -1
    } else {
      return 1
    }
  })
  let response = `### ${nation.flag} - ${nation.name} ${teamPlayers.length}/18\r`
  response += teamPlayers.map(player => `> ${player.roles.includes(serverRoles.nationalTeamCaptainRole) ? ':crown: ':''}${player.roles.includes(serverRoles.matchBlacklistRole) || player.roles.includes(serverRoles.permanentlyBanned) ? ':no_entry_sign:':''}<@${player.user.id}>`).join('\r')
  return {response, length:teamPlayers.length}
}
*/
/*
export const updateNationalTeam = async ({guild_id, nation, players, nationalities})=> {
  const allPlayers = await getAllPlayers(guild_id)
  const {response, length} = await getNationalTeamPostInsideDb(allPlayers, players, nation)
  if(nation.messageId) {
    await DiscordRequest(`/channels/1091749687356297307/messages/${nation.messageId}`, {
      method: 'PATCH',
      body: {
        content: response
      }
    })
  } else if(length>0) {
    const postResponse = await DiscordRequest('/channels/1091749687356297307/messages', {
      method: 'POST',
      body: {
        content: response
      }
    })
    const message = await postResponse.json()
    await nationalities.updateOne({name: nation.name}, {$set: {messageId: message.id}})
  }
}
*/
/*
export const allNationalTeams =  async ({interaction_id, guild_id, application_id, token, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const allPlayers = await getAllPlayers(guild_id)
  await dbClient(async ({players, nationalTeams})=>{
    const allNations = nationalTeams.find({active: true})
    for await(const nation of allNations) {
      const {response, length} = await getNationalTeamPostInsideDb(allPlayers, players, nation)
      if(length>0) {
        await DiscordRequest('/channels/1150376229178978377/messages', {
          method: 'POST',
          body: {
            content: response
          }
        })
        await sleep(1000)
      }
    }
  })

  return updateResponse({application_id, token})
}
*/

export const addSelection = async ({options, dbClient, guild_id, application_id, token, interaction_id}) => {
  await waitingMsg({interaction_id, token})
  const {player, selection} = optionsToObject(options)
  const allPlayers = await getAllPlayers(guild_id)
  const discordPlayer = allPlayers.find(discPlayer => discPlayer.user.id === player)
  console.log(selection)
  const response = await dbClient(async ({players, nationalities, nationalTeams, seasonsCollect, nationalContracts}) => {
    const [foundPlayer, nationalTeam, season] = await Promise.all([
      players.findOne({id: player}),
      nationalTeams.findOne({shortname:selection}),
      getCurrentSeason(seasonsCollect),
    ])
    const nations = await nationalities.find({name: {$in: nationalTeam.eligibleNationalities}}).toArray()
    const nationNames = nations.map(nation=>nation.name)
    if(foundPlayer && nationNames.includes(foundPlayer.nat1)) {
      const playerId = player
      try{
        await Promise.all([
          DiscordRequest(`/guilds/${guild_id}/members/${player}`, {
            method: 'PATCH',
            body: {
              roles: [...new Set([...discordPlayer.roles, nationalTeamPlayerRole])],
            }
          }),
          nationalContracts.updateOne({playerId, selection, season}, {$set: {playerId, selection, season}}, {upsert: true})
        ])
      } catch (e) {
        console.error(e.message)
      }
      return `<@${player}> added in the selection: ${nationalTeam.name}`
    }
    return 'Did not add player - did you check if he\'s eligible?'
  })

  return updateResponse({application_id, token, content: response})
}

export const removeSelection = async ({options, dbClient, guild_id, application_id, token, interaction_id}) => {
  await waitingMsg({interaction_id, token})
  const {player} = optionsToObject(options)
  const discordPlayerResp = await DiscordRequest(`/guilds/${guild_id}/members/${player}`, {method: 'GET'})
  const discordPlayer = await discordPlayerResp.json()
  const response = await dbClient(async ({players, nationalContracts, seasonsCollect}) => {
    const nick = removeInternational(getPlayerNick(discordPlayer))
    const season = await getCurrentSeason(seasonsCollect)
    await Promise.all([
      DiscordRequest(`/guilds/${guild_id}/members/${player}`, {
        method: 'PATCH',
        body: {
          roles: discordPlayer.roles.filter(role => role !== nationalTeamPlayerRole && role !== serverRoles.nationalTeamCaptainRole),
        }
      }),
      players.findOneAndUpdate({id: player}, {$set: {nick}}, {returnDocument: 'after', upsert: true}),
      nationalContracts.deleteOne({playerId: player, season})
    ])
    //const nation = await nationalities.findOne({name: dbPlayer.nat1})
    //await updateNationalTeam({guild_id, nation, nationalities, players})
    return `<@${player}> removed from national teams`
  })

  return updateResponse({application_id, token, content: response})
}

export const registerElections = async ({options, dbClient, interaction_id, callerId, token, application_id}) => {
  await waitingMsg({interaction_id, token})
  const {selection, reason} = optionsToObject(options)
  const content = await dbClient(async ({players, nationalTeams, nationalities, candidates})=> {
    const [existingCandidate, dbPlayer, selectedNationalTeam] = await Promise.all([
      candidates.findOne({playerId: callerId}),
      players.findOne({id: callerId}),
      nationalTeams.findOne({shortname: selection, active: true}),
      nationalities.find({}).toArray()
    ])
    if(existingCandidate) {
      return `You already applied for ${existingCandidate.selection}`
    }
    if(!selectedNationalTeam){
      return `Cannot find the national selection you applied for: Is it an active one ?`
    }
    if(!dbPlayer || !dbPlayer.nat1) {
      return `You are not registered with us. If you think it's an error, please open a ticket. Only registered players can apply.`
    }
    
    if(!selectedNationalTeam.eligibleNationalities.includes(dbPlayer.nat1)) {
      if(selectedNationalTeam.eligibleNationalities.includes(dbPlayer.nat2)) {
        return `You're not applying for your "main" country described in /player. Please open a ticket if you wish to swap nations.`
      } else {
        return `You can only apply for your selection.`
      }
    }
    await candidates.insertOne({playerId: callerId, selection, reason})
    return `Application saved for ${selectedNationalTeam.name}.`
  })
  await updateResponse({application_id, token, content})
}

export const showElectionCandidates = async ({interaction_id, token, application_id, dbClient}) => {
  await quickResponse({interaction_id, token, content: 'All candidates for elections:'})
  const [allCandidates, allNations, allSelections] = await dbClient (async ({nationalities, nationalTeams, candidates})=> 
    Promise.all([candidates.find({}).toArray(), nationalities.find({}).toArray(), nationalTeams.find({}).toArray()])
  )
  for await(const candidate of allCandidates) {
    try{
      const candidateSelection = allSelections.find(({shortname})=> shortname === candidate.selection)
      const candidateNations = allNations.filter(({name})=> candidateSelection.eligibleNationalities.includes(name))
      const content = `${candidateNations.map(nation=> nation.flag).join('')} ${candidateSelection.name} <@${candidate.playerId}> : ${candidate.reason}`
      await DiscordRequest(`/webhooks/${application_id}/${token}`, {
        method: 'POST',
        body: {
          content,
        }
      })
    } catch(e) {
      await DiscordRequest(`/webhooks/${application_id}/${token}`, {
        method: 'POST',
        body: {
          content: `${candidate.selection} <@${candidate.playerId}> : ${candidate.reason} -- ERROR`,
        }
      })
    }
  }
}

export const voteCoach = async ({interaction_id, callerId, guild_id, token, application_id, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const allPlayers = await getAllPlayers(guild_id)
  const response = await dbClient(async({players, candidates, nationalTeams})=> {
    const dbPlayer = await players.findOne({id: callerId})
    if(!dbPlayer || !dbPlayer.nat1) {
      return `You are not registered with us. If you think it's an error, please open a ticket. Only registered players can apply.`
    }
    const allNationalities = await getAllNationalities()
    const selection = await nationalTeams.findOne({eligibleNationalities: dbPlayer.nat1, active: true})
    const candidatesToVote = await candidates.find({selection: selection.shortname}).toArray()
    const candidatesIds = candidatesToVote.map(candidate=>candidate.playerId)
    const candidatesPlayers = allPlayers.filter(player => candidatesIds.includes(player.user.id))
    const selectionName = `${selection.eligibleNationalities.map(nationName=> allNationalities.find(nation=> nation.name === nationName)?.flag).join('')} ${selection.name}`
    if(candidatesToVote.length === 0) {
      return {content: `No candidates applied for ${selectionName}, you can't vote.`}
    }
    if(candidatesToVote.length === 1) {
      return {content: `Only one candidate applied for ${selectionName}, <@${candidatesToVote[0].playerId}>. No need to vote.`}
    }
    return {
      content: `Please vote for a candidate for ${selectionName}`,
      components: [{
        type: 1,
        components: candidatesPlayers.map((player) => {
          return {
            type: 2,
            label: `${getPlayerNick(player)}`,
            style: 2,
            custom_id: `vote_${player.user.id}`
          }
        })
      }]
    }
  })
  return updateResponse({application_id, token, ...response})
}

export const showVotes = async ({interaction_id, token, application_id, options, dbClient}) => {
  const {selection} = optionsToObject(options)
  await waitingMsg({interaction_id, token})
  const content = await dbClient(async ({votes})=> {
    const votingOptions = await votes.aggregate([
      { $match: { nation: selection } },
      { $group: { _id: "$coachVote", count: { $sum: 1 } } }
    ]).toArray()
    console.log(votingOptions)
    return votingOptions.map(({_id, count}) => `<@${_id}> : ${count}`).join('\r')
  })
  await updateResponse({application_id, token, content: content || 'No result'})
}

export const cleanVotes = async({interaction_id, token, dbClient, callerId}) => {
  if(callerId !== '269565950154506243') {
    return quickResponse({interaction_id, token, content:'permission denied'})
  }
  const content = await dbClient(async({votes})=>{
    await votes.deleteMany({})
    return 'done'
  })
  return silentResponse({interaction_id, token, content})
}

export const autoCompleteSelections = async (currentOption, dbClient, res) => {
  const toSearch = (currentOption.value || "").toLowerCase()
  let autoCompleteSelections = await getAllSelections(dbClient)
  //if(!isMemberAdmin(member)) {
    autoCompleteSelections = autoCompleteSelections.filter(selection=>selection.active === true)
  //}
  const searchSelections = autoCompleteSelections.map(({name, shortname})=> ({name, shortname, display: `${shortname} - ${name}`, search: name.toLowerCase()}))
  const countryChoices = searchSelections
    .filter(({search}) => toSearch.length === 0 || search.includes(toSearch))
    .slice(0, 24)
  return res.send({
    type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    data: {
      choices : countryChoices.map(({name, shortname})=> ({name: name, value: shortname}))
    }
  })
}

export const selection = async (commandPayload) => {
  return handleSubCommands(commandPayload, selectionSubCommands)
}

const selectionAdd = async ({application_id, token, guild_id, options, callerId, member, dbClient}) => {
  const {player} = optionsToObject(options)
  const nationalCaptainRole = getNationalCaptainRole(guild_id)
  if(!member.roles.includes(nationalCaptainRole)) {
    return updateResponse({application_id, token, content: 'You are not able to make selections'})
  }
  const discResp = await DiscordRequest(`/guilds/${guild_id}/members/${player}`, { method: 'GET' })
  const discPlayer = await discResp.json()
  const content = await dbClient(async ({nationalTeams, nationalities, seasonsCollect, nationalContracts, players})=>{
    if(!discPlayer.roles.includes(getRegisteredRole(guild_id))) {
      return `<@${player}> needs to be registered to be called.`
    }

    const season = await getCurrentSeason(seasonsCollect)
    const callersSelectionContract = await nationalContracts.findOne({season, playerId: callerId})
    if(!callersSelectionContract) {
      return `Can't find you as a national player`
    }
    const callersSelection = await nationalTeams.findOne({shortname: callersSelectionContract.selection})
    const dbPlayer = await players.findOne({id: player})
    if(!callersSelection.eligibleNationalities.includes(dbPlayer.nat1)){
      return `Can't select <@${player}>, as he is from ${dbPlayer.nat1}, not ${callersSelection.eligibleNationalities}`
    }
    await nationalContracts.updateOne({season, playerId:player}, {$set: {season, playerId:player, selection: callersSelection.shortname}}, {upsert: true})
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

    return formatSelection(callersSelection, selectionNationalities, nationalPlayers)
  })
  return updateResponse({application_id, token, content})
}

const selectionRemove = async ({application_id, token, guild_id, options, callerId, member, dbClient}) => {
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

const selectionView = async ({application_id, token, callerId, dbClient}) => {
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

const formatSelection = (nationalSelection, selectionNationalities, nationalPlayers) => {
  return `## ${selectionNationalities.map(nationality=> nationality.flag).join('')} ${nationalSelection.name}\r${nationalPlayers.length} players\r` 
  + nationalPlayers.map(player=> `> <@${player.playerId}>`).join('\r')
}

export const voteCoachCmd = {
  name: 'votecoach',
  psaf: true,
  func: voteCoach,
  description: 'Vote for your national team coach',
  type: 1
}

export const showElectionCandidatesCmd = {
  name: 'showelectioncandidates',
  description: 'List all the election candidates and their reasons',
  type: 1,
  psaf: true,
  func: showElectionCandidates
}

export const registerElectionsCmd = {
  name: 'registerelections',
  description: 'Register to become a national coach',
  type: 1,
  psaf: true,
  func: registerElections,
  options: [{
    type: 3,
    name: 'selection',
    description: 'National Selection',
    autocomplete: true,
    required: true,
  },{
    type: 3,
    name: 'reason',
    description: 'Please tell us why you\'d be a good national coach',
    required: true,
  }]
}

export const showVotesCmd = {
  name: 'showvotes',
  description: 'Show the votes for a nation',
  type: 1,
  psaf: true,
  func: showVotes,
  options: [{
    type: 3,
    name: 'selection',
    description: 'Selection',
    autocomplete: true,
    required: true,
  }],
}

export const cleanVotesCmd = {
  name: 'cleanvotes',
  description: 'Remove all the votes',
  func: cleanVotes,
  type: 1,
  psaf: true,
}

export const addSelectionCmd = {
  name: 'addselection',
  description: 'Add a player in a selection',
  type: 1,
  func: addSelection,
  psaf: true,
  wc: true,
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
  func: removeSelection,
  psaf: true,
  options: [{
    type: 6,
    name: 'player',
    description: 'Player',
    required: true,
  }],
}

const selectionSubCommands = {
  'add': selectionAdd,
  'view' : selectionView,
  'remove': selectionRemove,
}

export const selectionCmd = {
  name: 'selection',
  description: 'Handle national selections',
  psaf: true,
  wc: true,
  func: selection,
  options: [{
    type: 1,
    name: 'add',
    description: 'select a player for your national team',
    options: [{
      type: 6,
      name: 'player',
      description: 'Player',
      required: true,
    }]
  }, {
    type: 1,
    name: 'view',
    description: 'View the list of your selected players',
  }, {
    type: 1,
    name: 'remove',
    description: 'Remove a player from your national team',
    options: [{
      type: 6,
      name: 'player',
      description: 'Player',
      required: true,
    }]
  }]
}

export default [cleanVotesCmd, selectionCmd, addSelectionCmd, removeSelectionCmd, registerElectionsCmd, showElectionCandidatesCmd, voteCoachCmd, showVotesCmd]