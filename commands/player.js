import path from 'path';
import {fileURLToPath} from 'url';
import { InteractionResponseType } from "discord-interactions"
import download from "image-downloader"
import { DiscordRequest } from "../utils.js"
import { getPlayerNick, msToTimestamp, optionsToObject, sleep, updateResponse, waitingMsg, isMemberStaff, postMessage } from "../functions/helpers.js"
import { getAllPlayers } from "../functions/playersCache.js"
import { serverRoles } from "../config/psafServerConfig.js"
import { seasonPhases } from "./season.js"
import { getAllCountries } from "../functions/countriesCache.js"
import { getAllNationalities } from '../functions/allCache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nationalTeamPlayerRole = '1103327647955685536'
const staffRoles = ['1081886764366573658', '1072210995927339139', '1072201212356726836']

export const player = async ({options, interaction_id, callerId, guild_id, application_id, member, token, dbClient}) => {
  const {player} = optionsToObject(options)
  const playerId = player || callerId
  await waitingMsg({interaction_id, token})
  
  const content = await innerPlayer({playerId, guild_id, member, dbClient})
  return updateResponse({application_id, token, content})
}

export const playerUserCmd = async ({target_id, interaction_id, callerId, guild_id, application_id, member, token, dbClient}) => {
  const playerId = target_id || callerId
  await waitingMsg({interaction_id, token})
  
  const content = await innerPlayer({playerId, guild_id, member, dbClient})
  return updateResponse({application_id, token, content})
}

const innerPlayer = async ({playerId, guild_id, member, dbClient}) => { 
  const allPlayers = await getAllPlayers(guild_id)
  const discPlayer = allPlayers.find(player=>player.user.id === playerId)
  const name = getPlayerNick(discPlayer)
  return dbClient(async ({players, teams, contracts})=> {
    let response = name
    const dbPlayer = await players.findOne({id: playerId})
    const allTeams = await teams.find({active:true}).toArray()
    const allTeamIds = allTeams.map(({id})=> id)
    const playerContracts = await contracts.find({playerId}).toArray()
    const team = discPlayer.roles.find(role => allTeamIds.includes(role))
    response = `<@${playerId}> - ${team ? `<@&${team}>` : 'Free Agent'}\r`
    const allNationalities = await getAllNationalities()
    if(dbPlayer) {
      const isStaff = isMemberStaff(member)
      if(dbPlayer.ingamename) {
        response+= `In game name: ${dbPlayer.ingamename}\r`
      }
      const country = allNationalities.find(country => country.name === dbPlayer.nat1)
      const country2 = allNationalities.find(country => country.name === dbPlayer.nat2)
      const country3 = allNationalities.find(country => country.name === dbPlayer.nat3)
      if(country){
        response += `${country.flag} ${discPlayer.roles.includes(nationalTeamPlayerRole) ? 'International': ''}${country2? `, ${country2.flag}`: ''}${country3? `, ${country3.flag}`: ''}\r`
      }
      if(isStaff) {
        response += `Steam: ${dbPlayer.steam || 'Not saved'}\r`
        response += `Unique ID: ${dbPlayer.uniqueId || 'Not saved'}\r`
      }
      if(dbPlayer.desc) {
        response += `Description: *${dbPlayer.desc}*\r`
      }
      if(playerContracts.length > 0){
        response += 'Known contracts:\r'
        const contractsList = playerContracts.sort((a, b)=> b.at - a.at).map(({team, at, isLoan, phase, endedAt, until})=> `<@&${team}> from: <t:${msToTimestamp(at)}:F> ${endedAt ? `to: <t:${msToTimestamp(endedAt)}:F>`: (discPlayer.roles.includes(serverRoles.clubManagerRole) ? ' - :crown: Manager' : (isLoan ? `LOAN until season ${until}, beginning of ${seasonPhases[phase].desc}`: `until end of season ${until-1}`))}`)
        response += contractsList.join('\r')
      }
      if(dbPlayer.profilePicture && isStaff) {
        response += `\rhttps://pso.shinmugen.net/${dbPlayer.profilePicture}`
      }
      response += `\rhttps://psafdb.com/players/${playerId}`
      return response
    }
  })
}

export const editPlayer = async ({options=[], member, callerId, resolved, interaction_id, guild_id, application_id, token, dbClient}) => {
  const {player = callerId, desc, steam, uniqueid, ingamename, picture} = optionsToObject(options)
  const nat1 = undefined
  const nat2 = undefined
  const nat3 = undefined
  await waitingMsg({interaction_id, token})
  let profilePicture
  if(picture) {
    const image = resolved?.attachments?.[picture]?.proxy_url
    if(image) {
      const urlPath = new URL(image).pathname
      profilePicture = `site/images/${player}${path.extname(urlPath)}`
      download.image({
        url: image,
        dest: `${__dirname}/../${profilePicture}`,
        extractFilename: false
      })
    }
  }
  const playerResp = await DiscordRequest(`/guilds/${guild_id}/members/${player}`, { method: 'GET' })
  const discPlayer = await playerResp.json()
  let response = 'Nothing edited'
  const name = getPlayerNick(discPlayer)
  return await dbClient(async ({players, teams})=> {
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
      desc: desc || dbPlayer.desc,
      steam: steam || dbPlayer.steam,
      uniqueId: uniqueid || dbPlayer.uniqueId,
      ingamename: ingamename || dbPlayer.ingamename,
      profilePicture: profilePicture || dbPlayer.profilePicture,
    }}, {upsert: true})
    const updatedPlayer = await players.findOne({id: player}) || {}
    const team = discPlayer.roles.find(role => allTeamIds.includes(role))
    response = `<@${player}> - ${team ? `<@&${team}>` : 'Free Agent'}\r`
    const allNationalities = await getAllNationalities()
    if(updatedPlayer) {
      const country = allNationalities.find(country=> country.name === updatedPlayer.nat1)
      const country2 = allNationalities.find(country=> country.name === updatedPlayer.nat2)
      const country3 = allNationalities.find(country=> country.name === updatedPlayer.nat3)
      if(country){
        response += `${country.flag} ${discPlayer.roles.includes(nationalTeamPlayerRole) ? 'International': ''}${country2? `, ${country2.flag}`: ''}${country3? `, ${country3.flag}`: ''}\r`
      }
      if(updatedPlayer.desc) {
        response += `Description: *${updatedPlayer.desc}*\r`
      }
      if(updatedPlayer.profilePicture) {
        response += `https://pso.shinmugen.net/${profilePicture}`
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

export const updatePlayerPicture = async ({options=[], callerId, resolved, interaction_id, guild_id, application_id, token, dbClient}) => {
  const {player = callerId, picture} = optionsToObject(options)
  await waitingMsg({interaction_id, token})
  
  let profilePicture
  if(picture) {
    const image = resolved?.attachments?.[picture]?.proxy_url
    if(image) {
      const urlPath = new URL(image).pathname
      profilePicture = `site/images/${player}${path.extname(urlPath)}`
      download.image({
        url: image,
        dest: `${__dirname}/../${profilePicture}`,
        extractFilename: false
      })
    }
  }
  const playerResp = await DiscordRequest(`/guilds/${guild_id}/members/${player}`, { method: 'GET' })
  const discPlayer = await playerResp.json()
  let response = 'Nothing edited'
  return await dbClient(async ({players, teams})=> {
    const allTeams = await teams.find({active:true}).toArray()
    const allTeamIds = allTeams.map(({id})=> id)
    const dbPlayer = await players.findOne({id: player}) || {}
    await players.updateOne({id: player}, {$set:{
      profilePicture: profilePicture || dbPlayer.profilePicture,
    }}, {upsert: true})
    const updatedPlayer = await players.findOne({id: player}) || {}
    const team = discPlayer.roles.find(role => allTeamIds.includes(role))
    response = `<@${player}> - ${team ? `<@&${team}>` : 'Free Agent'}\r`
    const allNationalities = await getAllNationalities()
    if(updatedPlayer) {
      const country = allNationalities.find(country=> country.name === updatedPlayer.nat1)
      const country2 = allNationalities.find(country=> country.name === updatedPlayer.nat2)
      const country3 = allNationalities.find(country=> country.name === updatedPlayer.nat3)
      if(country){
        response += `${country.flag} ${discPlayer.roles.includes(nationalTeamPlayerRole) ? 'International': ''}${country2? `, ${country2.flag}`: ''}${country3? `, ${country3.flag}`: ''}\r`
      }
      if(updatedPlayer.desc) {
        response += `Description: *${updatedPlayer.desc}*\r`
      }
      if(updatedPlayer.profilePicture) {
        response += `https://pso.shinmugen.net/${profilePicture}`
      }
    }
    
    return updateResponse({application_id, token, content: response})
  })
}

export const getPlayersList = async (totalPlayers, teamToList, displayCountries, players, contracts) => {
  const teamPlayers = totalPlayers.filter((player) => player.roles.includes(teamToList)).sort((playerA, playerB) => {
    const aManager = playerA.roles.includes(serverRoles.clubManagerRole)
    const bManager = playerB.roles.includes(serverRoles.clubManagerRole)
    if(aManager === bManager) {
      return getPlayerNick(playerA).localeCompare(getPlayerNick(playerB))
    } else if (aManager) {
      return -1
    } else {
      return 1
    }
  })
  const userIds = teamPlayers.map(({user})=> user.id)
  const knownPlayers = await (userIds.length > 0 ? players.find({$or: userIds.map(id => ({id}))}).toArray() : Promise.resolve([]))
  const displayPlayers = teamPlayers.map((player) => {
    const foundPlayer = knownPlayers.find(({id})=> id === player.user.id) || {}
    const contract = contracts.find(({playerId})=> playerId == player.user.id)
    return({
      ...player,
      ...foundPlayer,
      contract,
      isManager: player.roles.includes(serverRoles.clubManagerRole),
      isBlackListed: player.roles.includes(serverRoles.matchBlacklistRole) || player.roles.includes(serverRoles.permanentlyBanned)
    })
  })
  let response = `<@&${teamToList}> players: ${displayPlayers.length}/30${displayPlayers.length>30? '\r## Too many players':''}\r`
  response += `${displayPlayers.map(({ user, nat1, nat2, nat3, contract, steam, isManager, profilePicture, isBlackListed }) => 
    `${isManager?':crown: ':''}${isBlackListed?':no_entry_sign: ':''}${nat1?displayCountries[nat1]:''}${nat2?displayCountries[nat2]:''}${nat3?displayCountries[nat3]:''} <@${user.id}>${steam? '<:steam:1201620242015719454>': ''}${profilePicture?'👕':''}${contract?.until && !isManager? (contract?.isLoan ? ` - LOAN Season ${contract?.until}, beginning of ${seasonPhases[contract?.phase]?.desc}`: ` - Season ${contract?.until-1}`) : ''}`
  ).join('\r')}`
  return response
}

export const allPlayers = async ({guild_id, interaction_id, application_id, token, dbClient}) => {
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
  await dbClient(async ({teams, players, contracts})=>{
    const [allTeams, allNations] = await Promise.all([
      teams.find({active: true}).toArray(),
      getAllNationalities()
    ])
    const displayCountries = Object.fromEntries(allNations.map(({name, flag})=> ([name, flag])))
    
    const embeds = []
    let currentEmbed =''
    let i = 0
    for(const team of allTeams) {
      currentEmbed += await getPlayersList(allPlayers, team.id, displayCountries, players, contracts) +'\r\r'
      i++
      if(i > 4) {
        i=0
        embeds.push({
          title: 'PSAF Players',
          description: currentEmbed
        })
        await postMessage({
          channel_id:'1150376229178978377', 
          embeds: [{title: 'PSAF Players', description: currentEmbed}]
        })
        await sleep(1000)
        currentEmbed = ''
      }
    }
    if(i!== 0) {
      await postMessage({
        channel_id:'1150376229178978377', 
        embeds: [{title: 'PSAF Players', description: currentEmbed}]
      })
    }
    return []
  })
  return updateResponse({application_id, token, content: 'Done'})
}

export const players = async ({guild_id, interaction_id, application_id, token, options, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const totalPlayers = await getAllPlayers(guild_id)
  const {team} = Object.fromEntries(options.map(({name, value})=> [name, value]))
  
  const response = await dbClient(async ({players, contracts})=> {
    const [allNations, teamContracts] = await Promise.all([
      getAllNationalities(),
      contracts.find({team, endedAt: null}).toArray()
    ])
    const displayCountries = Object.fromEntries(allNations.map(({name, flag})=> ([name, flag])))
    return getPlayersList(totalPlayers, team, displayCountries, players, teamContracts)
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
    description: 'Team',
    required: true
  }]
}

export const autoCompleteNation = async (currentOption, dbClient, res) => {
  const toSearch = (currentOption.value || "").toLowerCase()
  const searchCountries = await getAllCountries(dbClient)
  const autocompleteCountries = searchCountries.map(({name, flag})=> ({name, flag, display: flag+name, search: name.toLowerCase()}))
  const countryChoices = autocompleteCountries
    .filter(({search}) => toSearch.length === 0 || search.includes(toSearch))
    .slice(0, 24)
  console.log(countryChoices)
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
    name: 'desc',
    description: 'Player\'s description',
  }, {
    type: 3,
    name: 'steam',
    description: 'Steam Account'
  }, {
    type: 3,
    name: 'uniqueid',
    description: 'PSO\'s unique ID'
  }, {
    type: 3,
    name: 'ingamename',
    description: 'In Game name'
  }, {
    type: 11,
    name: 'picture',
    description: 'Profile picture for cards'
  }]
}

export const updatePlayerPictureCmd = {
  name: 'playerpicture',
  description: 'Update a player\'s picture',
  type: 1,
  psaf: true,
  func: updatePlayerPicture,
  options: [{
    type: 6,
    name: 'player',
    description: 'Player',
    required: true,
 }, {
    type: 11,
    name: 'picture',
    description: 'Profile picture for cards',
    required: true
  }]
}

const playerUser = {
  name: "Player Details",
  type: 2,
  psaf: true,
  func: playerUserCmd
}

export default [updatePlayerPictureCmd, playerUser]