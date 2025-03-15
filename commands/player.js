import path from 'path';
import {fileURLToPath} from 'url';
import { InteractionResponseType } from "discord-interactions"
import download from "image-downloader"
import { DiscordRequest } from "../utils.js"
import { getPlayerNick, msToTimestamp, optionsToObject, sleep, updateResponse, waitingMsg, isMemberStaff, postMessage, displayTeamName, updateDiscordPlayer, isManager } from "../functions/helpers.js"
import { getAllPlayers } from "../functions/playersCache.js"
import { serverChannels, serverRoles } from "../config/psafServerConfig.js"
import { getFastCurrentSeason, seasonPhases } from "./season.js"
import { getAllCountries } from "../functions/countriesCache.js"
import { getAllNationalities } from '../functions/allCache.js';
import { getPSOSteamDetails, getSteamIdFromSteamUrl } from '../functions/steamUtils.js';

const twoSeasons = 1.57788e+10

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

const showPlayer = (discPlayer={}, dbPlayer, allNationalities, isStaff, allTeams, team, inGuild, playerContracts) => {
  const playerId = discPlayer.user?.id
  let response = `<@${playerId}> - ${displayTeamName(inGuild, team, allTeams)}\r`
  if(dbPlayer) {
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
      const contractsList = playerContracts.sort((a, b)=> b.at - a.at).map(({team, at, isLoan, phase, endedAt, until})=> `${displayTeamName(inGuild, team, allTeams)} from: <t:${msToTimestamp(at)}:F> ${endedAt ? `to: <t:${msToTimestamp(endedAt)}:F>`: (isManager(discPlayer) ? ' - :crown: Manager' : (isLoan ? `LOAN until season ${until}, beginning of ${seasonPhases[phase].desc}`: `until end of season ${until-1}`))}`)
      response += contractsList.join('\r')
    }
    if(dbPlayer.profilePicture && isStaff) {
      response += `\rhttps://pso.shinmugen.net/${dbPlayer.profilePicture}`
    }
    response += `\rhttps://psafdb.com/players/${playerId}`
  } else {
    response += `\rNot found in DB`
  }
  return response
}

const innerPlayer = async ({playerId, guild_id, member, dbClient}) => {
  const inGuild = !!guild_id
  const allPlayers = await getAllPlayers(guild_id)
  const discPlayer = allPlayers.find(player=>player.user.id === playerId)
  if(!discPlayer) return `Cannot find <@${playerId}> in PSAF`
  const name = getPlayerNick(discPlayer)
  return dbClient(async ({players, teams, contracts})=> {
    let response = name
    const dbPlayer = await players.findOne({id: playerId})
    const allTeams = await teams.find({active:true}).toArray()
    const allTeamIds = allTeams.map(({id})=> id)
    const playerContracts = await contracts.find({playerId}).toArray()
    const team = discPlayer.roles.find(role => allTeamIds.includes(role))
    response = `<@${playerId}> - ${displayTeamName(inGuild, team, allTeams)}\r`
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
        response += `Hours when bot validated: ${dbPlayer.hoursWhenChecked}\r`
      }
      if(dbPlayer.desc) {
        response += `Description: *${dbPlayer.desc}*\r`
      }
      response += `PSO Steam validated: ${dbPlayer.steamVerified ? 'yes': dbPlayer.steamValidation}\r`
      if(playerContracts.length > 0){
        response += 'Known contracts:\r'
        const contractsList = playerContracts.sort((a, b)=> b.at - a.at).map(({team, at, isLoan, phase, endedAt, until})=> `${displayTeamName(inGuild, team, allTeams)} from: <t:${msToTimestamp(at)}:F> ${endedAt ? `to: <t:${msToTimestamp(endedAt)}:F>`: (isManager(discPlayer) ? ' - :crown: Manager' : (isLoan ? `LOAN until season ${until}, beginning of ${seasonPhases[phase]?.desc || phase}`: `until end of season ${until-1}`))}`)
        response += contractsList.join('\r')
      }
      if(dbPlayer.profilePicture && isStaff) {
        response += `\rhttps://pso.shinmugen.net/${dbPlayer.profilePicture}`
      }
      response += `\rhttps://psafdb.com/players/${playerId}`
      return response
    } else {
      return `${response}\r<@${playerId}> is not registered in PSAF`
    }
  })
}

export const editPlayer = async ({options=[], member, callerId, resolved, interaction_id, guild_id, application_id, token, dbClient}) => {
  await waitingMsg({interaction_id, token})
  return editPlayerDetails({options, member, callerId, resolved, guild_id, application_id, token, dbClient})
}

export const editPlayerDetails = async ({options=[], member, callerId, resolved, guild_id, application_id, token, dbClient}) => {
  const {player = callerId, desc, uniqueid, ingamename, picture} = optionsToObject(options)
  const nat1 = undefined
  const nat2 = undefined
  const nat3 = undefined
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
  await waitingMsg({interaction_id, token})
  return editPlayerPicture({options, callerId, resolved, interaction_id, guild_id, application_id, token, dbClient})
}
const editPlayerPicture = async ({options=[], callerId, resolved, guild_id, application_id, token, dbClient}) => {
  const {player = callerId, picture} = optionsToObject(options)
  
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

const editSteamUrl = async ({options=[], callerId, guild_id, member, application_id, token, dbClient}) => {
  const {player = callerId, steamurl} = optionsToObject(options)
  const inGuild = !!guild_id
  const playerResp = await DiscordRequest(`/guilds/${guild_id}/members/${player}`, { method: 'GET' })
  const discPlayer = await playerResp.json()
  console.log(steamurl)
  const steamId = await getSteamIdFromSteamUrl(steamurl)
  if(!steamId) {
    return updateResponse({application_id, token, content: `Nothing edited, ${steamurl} is not a valid Steam URL`})
  }
  const psoSummary = await getPSOSteamDetails({steamUrl: steamurl, playerId:player, member: discPlayer})
  if(!psoSummary.validated) {
    return updateResponse({application_id, token, content: `PSO not found on ${steamurl}, not saving.`})
  }
  const content = await dbClient(async ({players, teams, contracts})=> {
    const allTeams = await teams.find({active:true}).toArray()
    const allTeamIds = allTeams.map(({id})=> id)
    const dbPlayer = await players.findOne({id: player}) || {}
    const pastSteams = dbPlayer.pastSteams || []
    pastSteams.push({steamId: dbPlayer.steamId, steam: dbPlayer.steam, usedUntil: Date.now()})
    await players.updateOne({id: player}, {$set:{
      pastSteams, steamId: steamId, steam: steamurl
    }}, {upsert: true})
    const updatedPlayer = await players.findOne({id: player}) || {}
    const team = discPlayer.roles.find(role => allTeamIds.includes(role))
    const discResponse = await updateDiscordPlayer(guild_id, player, {
      roles: [...new Set([...discPlayer.roles, serverRoles.steamVerified, serverRoles.registeredRole])]
    })
    const updatedDiscPlayer = await discResponse.json()
    const playerContracts = await contracts.find({player}).toArray()
    const allNationalities = await getAllNationalities()
    const isStaff = isMemberStaff(member)
    await postMessage({channel_id: serverChannels.registrationsChannelId, content: `Updated Player <@${player}> - Previously id: ${dbPlayer.steamId} url: ${dbPlayer.steam}\r*(By <@${callerId}>)*`})
    const playerData = showPlayer(updatedDiscPlayer, updatedPlayer, allNationalities, isStaff, allTeams, team, inGuild, playerContracts)
    await postMessage({channel_id:serverChannels.registrationsChannelId, content:playerData})
    return playerData
  })
  return updateResponse({application_id, token, content})
}

export const swapPlayerNationalities = async ({application_id, token, guild_id, callerId, options, dbClient}) => {
  const {player, nationality} = options
  const [allPlayers, allNationalities] = await Promise.all([getAllPlayers(guild_id), getAllNationalities()])
  const discPlayer = allPlayers.find(discPlayer=>discPlayer?.user?.id === player)
  if(!discPlayer) {
    return updateResponse({application_id, token, content: `Cannot find <@${player}> on discord.`})
  }
  const now = Date.now()
  const requestedNationality = allNationalities.find(nat=>nat.name===nationality)
  const content = await dbClient(async ({players})=> {
    const dbPlayer = await players.findOne({id: player})
    if(!dbPlayer) {
      return `Cannot find <@${player}> in DB.`
    }
    if(!requestedNationality) {
      return `Cannot find nationality ${nationality}`
    }
    const nat1 = allNationalities.find(nat=>nat.name === dbPlayer.nat1) || null
    const nat2 = allNationalities.find(nat=>nat.name === dbPlayer.nat2) || null
    const nat3 = allNationalities.find(nat=>nat.name === dbPlayer.nat3) || null
    const flags = `${nat1? nat1.flag : ''}${nat2? nat2.flag: ''}${nat3? nat3.flag: ''}`
    if(dbPlayer.nat1 === nationality) {
      return `No changes, <@${player}>'s main nationality is already ${nationality}`
    }
    if(![dbPlayer.nat2, dbPlayer.nat3].includes(nationality)) {
      return `${flags} <@${player}> is not having the ${requestedNationality.flag} ${requestedNationality.name} nationality.`
    }
    if(dbPlayer.lastNatChange && dbPlayer.lastNatChange+twoSeasons < now){
      return `<@${player}>'s last nationality swap was on <t:${msToTimestamp(dbPlayer.lastNatChange)}:f>, need to wait until <t:${msToTimestamp(dbPlayer.lastNatChange+twoSeasons)}:f> to change again.`
    }
    const newNat1 = requestedNationality
    const newNat2 = dbPlayer.nat2 === requestedNationality ? nat1 : nat2
    const newNat3 = dbPlayer.nat3 === requestedNationality ? nat1 : nat3
    const newFlags = `${newNat1? newNat1.flag : ''}${newNat2? newNat2.flag: ''}${newNat3? newNat3.flag: ''}`
    await players.updateOne({id: player}, {$set: {nat1: newNat1.name, nat2: newNat2.name, nat3: newNat3.name, lastNatChange: now}})
    const content = `<@${callerId}> swapped ${flags} <@${player}> nationalities to ${newFlags} <@${player}>. New main nationality is ${newNat1.flag} ${nationality}.`
    await postMessage({channel_id:serverChannels.botActivityLogsChannelId, content})
    return content
  })
  return updateResponse({application_id, token, content})
}

export const migratePlayer = async ({application_id, token, guild_id, options, dbClient}) => {
  const {newplayer, oldplayer, oldplayerid} = optionsToObject(options)
  const newPlayer = newplayer
  const oldPlayer = oldplayer
  const oldPlayerId = oldPlayer || oldplayerid
  const allPlayers = await getAllPlayers(guild_id)
  console.log(oldPlayerId)
  let discPlayer = allPlayers.find(player => player.user.id === oldPlayerId)
  console.log(discPlayer)
  if(!oldPlayerId) {
    return updateResponse({application_id, token, content:`Can't find the player you're trying to migrate. Maybe send the old player ID if the player has left discord already.`})
  }
  const oldDiscPlayerId = discPlayer?.user?.id || oldPlayerId
  const newDiscPlayer = allPlayers.find(disPlayer=> disPlayer.user.id === newPlayer)
  if(!newDiscPlayer) {
    return updateResponse({application_id, token, content:`Can't find the player you're trying to migrate to.`})
  }
  const newDiscPlayerId = newDiscPlayer.user.id
  return await dbClient(async ({players, contracts})=> {
    const [dbOldPlayer, dbNewPlayer] = await Promise.all([players.findOne({id: oldDiscPlayerId}), players.findOne({id: newDiscPlayerId})])
    const oldPlayerContracts = await contracts.find({playerId: oldDiscPlayerId}).toArray()
    if(!dbOldPlayer && !dbNewPlayer) {
      return updateResponse({application_id, token, content: `Can't find <@${oldDiscPlayerId}> AND <@${newDiscPlayerId}> in database. Both players aren't registered.`})
    } else {
      return updateResponse({
        application_id,
        token,
        content: `Are you sure you want to disable <@${oldDiscPlayerId}> and transfer the ${oldPlayerContracts.length} contracts to <@${newDiscPlayerId}>`,
        components: [{
          type: 1,
          components: [{
            type: 2,
            label: "Confirm",
            style: 3,
            custom_id: `confirm_migrate_${oldDiscPlayerId}_${newDiscPlayerId}`,
          }]
        }]
      })
    }
  })
}

export const actionConfirmMigrate = async ({interaction_id, application_id, custom_id, guild_id, callerId, token, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const customIdAttributes = custom_id.split('_')
  const oldPlayerId = customIdAttributes[customIdAttributes.length-2]
  const newPlayerId = customIdAttributes[customIdAttributes.length-1]
  await postMessage({channel_id:serverChannels.botActivityLogsChannelId, content:`<@${callerId}> is requesting to migrate player <@${oldPlayerId}> to <@${newPlayerId}>`})
  const now = Date.now()
  const allPlayers = await getAllPlayers(guild_id)
  const oldDiscPlayer = allPlayers.find(player=>player.user.id === oldPlayerId)
  const newDiscPlayer = allPlayers.find(player=>player.user.id === newPlayerId)
  const season = getFastCurrentSeason()
  const content = await dbClient(async ({players, contracts, nationalContracts, playerMigrations})=>{
    const [dbOldPlayer, dbNewPlayer] = await Promise.all([players.findOne({id: oldPlayerId}), players.findOne({id: newPlayerId})])
    if(!dbOldPlayer && !dbNewPlayer){
      return `Players <@${oldPlayerId}> <@${newPlayerId}> not found in the database, please warn the bot developer. No changes happened.`
    } else if(dbOldPlayer && !dbNewPlayer) {
      const {_id, knownAlts, ...playerData} = dbOldPlayer
      const otherAlts = (knownAlts||[]).filter(alt=>alt.id !== newPlayerId)
      const newPlayerResponse = await players.insertOne({...playerData, id: newPlayerId, lastDiscordChange: now, knownAlts: [...otherAlts, {_id, id: oldPlayerId}]})
      const activeContracts = await contracts.find({playerId: oldPlayerId, endedAt: null}).toArray()
      for await(const activeContract of activeContracts) {
        const {...activeContractData} = activeContract
        delete activeContractData._id
        await contracts.insertOne({...activeContractData, playerId: newPlayerId})
      }
      const futureRoles = []
      if(activeContracts.length>0) {
        futureRoles.push(serverRoles.clubPlayerRole)
        let clubRole
        if(activeContracts.length>1) {
          clubRole = activeContracts.find(contract=>contract.isLoan)?.team
        } else {
          clubRole = activeContracts[0]?.team
        }
        futureRoles.push(clubRole)
      }
      const activeNationalContract = await nationalContracts.findOne({season, playerId:oldPlayerId})
      if(activeNationalContract) {
        const {...activeNationalContractData} = activeNationalContract
        delete activeNationalContractData._id
        await nationalContracts.insertOne({...activeNationalContractData, playerId: newPlayerId})
        futureRoles.push(serverRoles.nationalTeamPlayerRole)
      }
      await Promise.all([
        players.updateOne({_id}, {$set: {isAlt: true, knownAlts: [otherAlts, {_id: newPlayerResponse.insertedId, id: newDiscPlayer.user.id, swappedOn: now}]}}),
        playerMigrations.insertOne({callerId, oldPlayerId, newPlayerId, at: now}),
        updateDiscordPlayer(guild_id, newPlayerId, {
          roles: [...new Set([...newDiscPlayer.roles, futureRoles])]
        }),
        updateDiscordPlayer(guild_id, oldPlayerId, {
          roles: [...new Set([...oldDiscPlayer.roles, serverRoles.disabledRole])]
        })
      ])
      return `Account Migrated. <@${oldPlayerId}> is now disabled. <@${newPlayerId}> was not previously registered. Please ensure the new account is steam verified - only the active contracts are transfered.`
    } else if(!dbOldPlayer && dbNewPlayer) {
      await players.updateOne({id: newDiscPlayer.user.id},{$set:{knownAlts: [...(dbNewPlayer.knownAlts|| []), { id: oldPlayerId}]}})
      if(oldDiscPlayer) {
        await updateDiscordPlayer(guild_id, oldPlayerId, {
          roles: [...new Set([...oldDiscPlayer.roles, serverRoles.disabledRole])]
        })
      }
      return `Account Migrated. The old account <@${oldPlayerId}> was not found in DB. Please ensure the new account <@${newPlayerId}> is steam verified - only the active contracts are transfered.`
    } else { //old and new are present
      const {_id, knownAlts=[], ...playerData} = dbOldPlayer
      const otherAlts = knownAlts.filter(alt=>alt.id !== newPlayerId)
      const newPlayerResponse = await players.updateOne({id: newPlayerId}, {$set: {...playerData, id: newPlayerId, lastDiscordChange: now, knownAlts: [...otherAlts, {_id, id: oldPlayerId, swappedOn: now}]}})
      const activeContracts = await contracts.find({playerId: oldPlayerId, endedAt: null}).toArray()
      await contracts.updateMany({playerId: newPlayerId, endedAt: null}, {$set: {endedAt: now}})
      for await(const activeContract of activeContracts) {
        const {...activeContractData} = activeContract
        delete activeContractData._id
        await contracts.insertOne({...activeContractData, playerId: newPlayerId})
      }
      const futureRoles = oldDiscPlayer.roles.filter(role=> ![serverRoles.registeredRole, serverRoles.steamVerified].includes(role))
      const activeNationalContract = await nationalContracts.findOne({season, playerId:oldPlayerId})
      if(activeNationalContract) {
        await nationalContracts.deleteOne({season, playerId:newPlayerId})
        const {...activeNationalContractData} = activeNationalContract
        delete activeNationalContractData._id
        await nationalContracts.insertOne({...activeNationalContractData, playerId: newPlayerId})
      }
      await Promise.all([
        players.updateOne({_id}, {$set: {isAlt: true, knownAlts: [otherAlts, {_id: newPlayerResponse.insertedId, id: newDiscPlayer.user.id}]}}),
        playerMigrations.insertOne({callerId, oldPlayerId, newPlayerId, at: now}),
        updateDiscordPlayer(guild_id, newPlayerId, {
          roles: futureRoles
        }),
        updateDiscordPlayer(guild_id, oldPlayerId, {
          roles: [...new Set([...oldDiscPlayer.roles, serverRoles.disabledRole])]
        })
      ])
      return `Account Migrated. <@${oldPlayerId}> is now disabled. <@${newPlayerId}> is now getting the roles/contracts from the old account. Please ensure the new account is steam verified - only the active contracts are transfered.`
    }
  })
  await postMessage({channel_id: serverChannels.botActivityLogsChannelId, content})
  return updateResponse({application_id, token, content})
}

export const getPlayersList = async (totalPlayers, teamToList, displayCountries, players, contracts) => {
  const teamPlayers = totalPlayers.filter((player) => player.roles.includes(teamToList)).sort((playerA, playerB) => {
    const aManager = isManager(playerA)
    const bManager = isManager(playerB)
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
      isManager: isManager(player),
      isBlackListed: player.roles.includes(serverRoles.matchBlacklistRole) || player.roles.includes(serverRoles.permanentlyBanned)
    })
  })
  let response = `<@&${teamToList}> players: ${displayPlayers.length}/30${displayPlayers.length>30? '\r## Too many players':''}\r`
  response += `${displayPlayers.map(({ user, nat1, nat2, nat3, contract, steamVerified, isManager, profilePicture, isBlackListed }) => 
    `${isManager?':crown: ':''}${isBlackListed?':no_entry_sign: ':''}${nat1?displayCountries[nat1]:''}${nat2?displayCountries[nat2]:''}${nat3?displayCountries[nat3]:''} <@${user.id}>${steamVerified? '<:steam:1201620242015719454>': ''}${profilePicture?'👕':''}${contract?.until && !isManager? (contract?.isLoan ? ` - LOAN Season ${contract?.until}, beginning of ${seasonPhases[contract?.phase]?.desc}`: ` - Season ${contract?.until-1}`) : ''}`
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

const playerCmd = {
  name: 'player',
  description: 'Show player details',
  type: 1,
  psaf: true,
  func: player,
  options: [{
    type: 6,
    name: 'player',
    description: 'Player'
  }]
}

export const autoCompleteNation = async (currentOption, dbClient, res) => {
  const toSearch = (currentOption.value || "").toLowerCase()
  const searchCountries = await getAllCountries(dbClient)
  const autocompleteCountries = searchCountries.map(({name, flag})=> ({name, flag, display: flag+name, search: name.toLowerCase()}))
  const countryChoices = autocompleteCountries
    .filter(({search}) => toSearch.length === 0 || search.includes(toSearch))
    .slice(0, 24)
  //  console.log(countryChoices)
  return res.send({
    type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    data: {
      choices : countryChoices.map(({name})=> ({name: name, value: name}))
    }
  })
}

const updatePlayer = async ({interaction_id, token, callerId, options, ...rest}) => {
  const subCommand = options[0]
  await waitingMsg({interaction_id, token})
  if(subCommands[subCommand?.name]) {
    return subCommands[subCommand?.name]({...rest, callerId, token, options: subCommand.options})
  }
}

const subCommands = {
  'details': editPlayerDetails,
  'picture': editPlayerPicture,
  'steam': editSteamUrl,
  'migrate': migratePlayer,
  'mainnationality': swapPlayerNationalities,
}


const updatePlayerCmd = {
  name: 'updateplayer',
  description: 'Update a player',
  psaf: true,
  func: updatePlayer,
  options: [{
    name: 'details',
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
  },{
    name: 'picture',
    description: 'Update a player\'s picture',
    type: 1,
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
  },{
    name: 'steam',
    description: 'Update a player\'s steam account',
    type: 1,
    options: [{
      type: 6,
      name: 'player',
      description: 'Player',
      required: true,
    },{
      name: 'steamurl',
      description: 'Steam profile URL',
      required: true,
      type: 3,
    }]
  },{
    name: 'mainnationality',
    description: "Swap the nationalities of a player",
    type: 1,
    options: [{
      type: 6,
      name: 'player',
      description: 'Player',
      required: true,
    },{
      type: 3,
      name: 'nationality',
      description: 'Main nationality',
      autocomplete: true,
      required: true,
    }]
  },{
    name: 'migrate',
    description: "Migrate a player's discord account to a new one. WILL LOSE HISTORY",
    type: 1,
    options: [{
      type: 6,
      name: 'newplayer',
      description: 'New Account',
      required: true,
    },{
      type: 6,
      name: 'oldplayer',
      description: 'Old Discord Account',
    },{
      type: 3,
      name: 'oldplayerid',
      description: 'Old Discord Account ID (use if the old account isnt on the server anymore)'
    }]
  }]//newPlayer, oldPlayer, oldPlayerId
}

const playerBot = {
  name: "myprofile",
  description: "Show your PSAF Profile",
  type: 1,
  contexts: [1],
  app: true,
  func: player
}

const playerUser = {
  name: "Player Details",
  type: 2,
  psaf: true,
  func: playerUserCmd
}

export default [playerUser, playerBot, playerCmd, updatePlayerCmd]