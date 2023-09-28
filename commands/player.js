import { InteractionResponseType } from "discord-interactions"
import { DiscordRequest } from "../utils.js"
import { getPlayerNick, sleep } from "../functions/helpers.js"
import { countries } from "../config/countriesConfig.js"
import { getAllPlayers } from "../functions/playersCache.js"

const nationalTeamPlayerRole = '1103327647955685536'
const staffRoles = ['1081886764366573658', '1072210995927339139', '1072201212356726836']
const clubManagerRole = '1072620773434462318'
const autocompleteCountries = countries.map(({name, flag})=> ({name, flag, display: flag+name, search: name.toLowerCase()}))

export const player = async ({options, interaction_id, callerId, guild_id, application_id, token, dbClient}) => {
  const [{value}] = options || [{}]
  const playerId = value || callerId
  
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Searching...',
        flags: 1 << 6
      }
    }
  })
  const playerResp = await DiscordRequest(`/guilds/${guild_id}/members/${playerId}`, { method: 'GET' })
  const discPlayer = await playerResp.json()
  const name = getPlayerNick(discPlayer)
  let response = name
  await dbClient(async ({players, nationalities, teams})=> {
    const dbPlayer = await players.findOne({id: playerId})
    const allTeams = await teams.find({active:true}).toArray()
    const allTeamIds = allTeams.map(({id})=> id)
    const team = discPlayer.roles.find(role => allTeamIds.includes(role))
    response = `<@${playerId}> - ${team ? `<@&${team}>` : 'Free Agent'}\r`
    if(dbPlayer) {
      const country = await nationalities.findOne({name: dbPlayer.nat1})
      const country2 = await nationalities.findOne({name: dbPlayer.nat2})
      const country3 = await nationalities.findOne({name: dbPlayer.nat3})
      if(dbPlayer.rating) {
        response += `Rating: ${dbPlayer.rating}\r`
      }
      if(country){
        response += `${country.flag} ${discPlayer.roles.includes(nationalTeamPlayerRole) ? 'International': ''}${country2? `, ${country2.flag}`: ''}${country3? `, ${country3.flag}`: ''}\r`
      }
    }
  })

  await DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      content: response,
      flags: 1 << 6
    }
  })
}

export const editPlayer = async ({options=[], member, callerId, interaction_id, guild_id, application_id, token, dbClient}) => {
  const {player = callerId, nat1, nat2, nat3, rating} = Object.fromEntries(options.map(({name, value})=> [name, value]))
  
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Searching...',
        flags: 1 << 6
      }
    }
  })
  const playerResp = await DiscordRequest(`/guilds/${guild_id}/members/${player}`, { method: 'GET' })
  const discPlayer = await playerResp.json()
  let response = 'Nothing edited'
  const name = getPlayerNick(discPlayer)
  return await dbClient(async ({players, nationalities, teams})=> {
    const allTeams = await teams.find({active:true}).toArray()
    const allTeamIds = allTeams.map(({id})=> id)
    if(player !== callerId && member.roles.filter(role => staffRoles.includes(role)).length === 0) {
      const discPlayerTeam = discPlayer.roles.find(role => allTeamIds.includes(role))
      const memberTeam = member.roles.find(role=>allTeamIds.includes(role))
      if(!memberTeam || memberTeam !== discPlayerTeam) {
        return await DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
          method: 'PATCH',
          body: {
            content: 'Denied: Only staff can edit players from outside their own team.',
            flags: 1 << 6
          }
        })
      }
    }
    const dbPlayer = await players.findOne({id: player}) || {}
    await players.updateOne({id: player}, {$set:{
      nick: name, 
      nat1: nat1 || dbPlayer.nat1, 
      nat2: nat2 || dbPlayer.nat2, 
      nat3: nat3 || dbPlayer.nat3, 
      rating: rating || dbPlayer.rating
    }}, {upsert: true})
    const updatedPlayer = await players.findOne({id: player}) || {}
    const team = discPlayer.roles.find(role => allTeamIds.includes(role))
    response = `<@${player}> - ${team ? `<@&${team}>` : 'Free Agent'}\r`
    if(updatedPlayer) {
      const country = await nationalities.findOne({name: updatedPlayer.nat1})
      const country2 = await nationalities.findOne({name: updatedPlayer.nat2})
      const country3 = await nationalities.findOne({name: updatedPlayer.nat3})
      if(updatedPlayer.rating) {
        response += `Rating: ${updatedPlayer.rating}\r`
      }
      if(country){
        response += `${country.flag} ${discPlayer.roles.includes(nationalTeamPlayerRole) ? 'International': ''}${country2? `, ${country2.flag}`: ''}${country3? `, ${country3.flag}`: ''}\r`
      }
    }
    
    return await DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
      method: 'PATCH',
      body: {
        content: response,
        flags: 1 << 6
      }
    })
  })
}

const getPlayersList = async(totalPlayers, teamToList, displayCountries, players) => {
  const teamPlayers = totalPlayers.filter((player) => player.roles.includes(teamToList)).sort((playerA, playerB) => {
    const aManager = playerA.roles.includes(clubManagerRole)
    const bManager = playerB.roles.includes(clubManagerRole)
    if(aManager === bManager) {
      return playerA.nick.localeCompare(playerB.nick)
    } else if (aManager) {
      return -1
    } else {
      return 1
    }
  })
  const userIds = teamPlayers.map(({user})=> user.id)
  const knownPlayers = await players.find({$or: userIds.map(id => ({id}))}).toArray()
  const displayPlayers = teamPlayers.map((player) => {
    const foundPlayer = knownPlayers.find(({id})=> id === player.user.id) || {}
    return({
      ...player,
      ...foundPlayer,
      isManager: player.roles.includes(clubManagerRole)
    })
  })
  let response = `<@&${teamToList}> players: ${displayPlayers.length}/30${displayPlayers.length>30? '\r## Too many players':''}\r`
  response += `${displayPlayers.map(({ user, nat1, nat2, nat3, rating, isManager }) => 
    `${isManager?':crown:':''}${nat1?displayCountries[nat1]:''}${nat2?displayCountries[nat2]:''}${nat3?displayCountries[nat3]:''}<@${user.id}>${rating? ` [${rating}]`:''}`
  ).join('\r')}`
  return response
}

export const allPlayers = async ({guild_id, member, interaction_id, application_id, token, options, dbClient}) => {
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: 1 << 6
      }
    }
  })
  const allPlayers = await getAllPlayers(guild_id)
  const embeds = await dbClient(async ({teams, players, nationalities})=>{
    const allTeams = await teams.find({active: true}).toArray()
    const allNations = await nationalities.find({}).toArray()
    const displayCountries = Object.fromEntries(allNations.map(({name, flag})=> ([name, flag])))
    
    const embeds = []
    let currentEmbed =''
    let i = 0
    for(const team of allTeams) {
      currentEmbed += await getPlayersList(allPlayers, team.id, displayCountries, players) +'\r\r'
      i++
      if(i > 4) {
        i=0
        console.log(currentEmbed.length)
        embeds.push({
          title: 'PSAF Players',
          description: currentEmbed
        })
        await DiscordRequest('/channels/1150376229178978377/messages', {
          method: 'POST',
          body: {
            embeds: [{title: 'PSAF Players', description: currentEmbed}]
          }
        })
        await sleep(1000)
        currentEmbed = ''
      }
    }
    if(i!== 0) {
      await DiscordRequest('/channels/1150376229178978377/messages', {
        method: 'POST',
        body: {
          embeds: [{title: 'PSAF Players', description: currentEmbed}]
        }
      })
    }
    return []
  })

  return await DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      content: 'done',
      flags: 1 << 6
    }
  })
}

export const players = async ({guild_id, member, interaction_id, application_id, token, options, dbClient}) => {
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: 1 << 6
      }
    }
  })
  const totalPlayers = await getAllPlayers(guild_id)
  const [role] = options || []
  let roles = []
  let response = "No team found"
  if(!role) {
    roles = member.roles.map(role=>({id:role}))
  } else {
    roles = [{id: role.value}]
  }
  response = await dbClient(async ({teams, players, nationalities})=> {
    const team = await teams.findOne({active:true, $or:roles})
    const allNations = await nationalities.find({}).toArray()
    const displayCountries = Object.fromEntries(allNations.map(({name, flag})=> ([name, flag])))
    return getPlayersList(totalPlayers, team.id, displayCountries, players)
  })
  return DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      content: response,
    }
  })
}

export const playerCmd = {
  name: 'player',
  description: 'Show player details',
  type: 1,
  options: [{
    type: 6,
    name: 'player',
    description: 'Player'
  }]
}

export const myPlayerCmd = {
  name: 'myplayer',
  description: 'Show player details',
  type: 1
}

export const allPlayersCmd = {
  name: 'allplayers',
  description: 'Debug',
  type: 1
}

export const playersCmd = {
  name: 'players',
  description: 'List players for this team',
  type: 1,
  options: [{
    type: 8,
    name: 'team',
    description: 'Team'
  }]
}

export const autoCompleteNation = ({options}, res) => {
  const currentOption = options.find(({focused}) => focused === true);
  const toSearch = (currentOption.value || "").toLowerCase()
  const countryChoices = autocompleteCountries
    .filter(({search}) => toSearch.length === 0 || search.includes(toSearch))
    .filter((country, index) => index < 24)
  return res.send({
    type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    data: {
      choices : countryChoices.map(({name})=> ({name: name, value: name}))
    }
  })
}

export const editPlayerCmd = {
  name: 'editplayer',
  description: 'Edit player details',
  type: 1,
  options: [{
    type: 6,
    name: 'player',
    description: 'Player',
    required: true,
  },{
    type: 3,
    name: 'nat1',
    description: 'Main nationality',
    autocomplete: true
  },{
    type: 3,
    name: 'nat2',
    description: 'Nationality 2',
    autocomplete: true
  },{
    type: 3,
    name: 'nat3',
    description: 'Nationality 3',
    autocomplete: true
//    choices: countries.map(({name, flag})=> ({name: flag+name, value: name}))
  },{
    type: 4,
    name: 'rating',
    description: 'Rating',
    min_value: 0,
    max_value: 99
  }]
}