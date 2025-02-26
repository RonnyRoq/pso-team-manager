import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { DiscordRequest, SteamRequest, SteamRequestTypes } from "../utils.js"
import { countries } from '../config/countriesConfig.js'
import { getAllPlayers } from "../functions/playersCache.js"
import { addPlayerPrefix, batchesFromArray, followUpResponse, getCurrentSeason, getPlayerNick, getRegisteredRole, isManager, optionsToObject, postMessage, quickResponse, removePlayerPrefix, sendDM, silentResponse, updateDiscordPlayer, updateResponse, waitingMsg } from "../functions/helpers.js"
import { serverChannels, serverRoles } from "../config/psafServerConfig.js"
import { getPSOSteamDetails, isSteamIdIncorrect } from "../functions/steamUtils.js"
import { getCronJob } from "../cronjobs.js"

export const managerContracts = async ({interaction_id, token, application_id, dbClient, guild_id}) => {
  await waitingMsg({interaction_id, token})
  const allPlayers = await getAllPlayers(guild_id)
  const managers = allPlayers.filter(player=> isManager(player))
  const managersId = managers.map(manager=>manager.user.id)
  return dbClient(async ({players, contracts, seasonsCollect, teams})=> {
    const currentSeason = await getCurrentSeason(seasonsCollect)
    const managersContracts = await contracts.find({endedAt:null, until: {$gte: currentSeason}, playerId: {$in: managersId}}).toArray()
    const allTeams = await teams.find({active: true}).toArray()
    const managersWithoutContracts = managers.filter(manager=> !managersContracts.some(contract=> contract.playerId === manager.user.id))
    await managersWithoutContracts.forEach(async managerDisc => {
      const name = getPlayerNick(managerDisc)
      console.log(name)
      const player = managerDisc.user.id
      const currentContract = managersContracts.find(contract=>contract.playerId === player)
      console.log(currentContract)
      const team = allTeams.find(currentTeam => managerDisc.roles.includes(currentTeam.id))
      console.log(team)
      if(team) {
        await Promise.all([
          players.updateOne({id: player}, {$set:{
            nick: name,
          }}, {upsert: true}),
          contracts.updateOne({playerId: player, endedAt: null}, {$set: {
            playerId: player,
            team: team.id,
            at: currentContract?.at || Date.now(), 
            until: currentSeason+1,
            updatedAt: Date.now()
          }}, {upsert: true})
        ])
        console.log(`${name} has now a 1 season contract with ${team.name}`)
      }
    })
    return updateResponse({application_id, token, content: 'done'})
  })
}

export const expireThings = async ({dbClient, interaction_id, token, application_id}) => {
  if(interaction_id && token && application_id) {
    await waitingMsg({interaction_id, token})
  }
  const now = Date.now()
  const content = await dbClient(async ({moveRequest, confirmations, pendingDeals, pendingLoans})=> {
    const [moveRequestRes, confirmationRes, pendingDealsRes, pendingLoansRes] = await Promise.all([
      moveRequest.deleteMany({expiryTime: {$lt: now}}),
      confirmations.deleteMany({expiresOn: {$lt: now}}),
      pendingDeals.deleteMany({expiresOn: {$lt: now}}),
      pendingLoans.deleteMany({expiresOn: {$lt: now}}),
    ])
    
    return `Deleted:\r${moveRequestRes.deletedCount} match moves.\r${confirmationRes.deletedCount} confirmations.\r${pendingDealsRes.deletedCount} pending deals.\r${pendingLoansRes.deletedCount} pending loans.\r`
  })
  if(interaction_id && token && application_id) {
    return updateResponse({application_id, token, content})
  }
}

export const fixNames = async ({dbClient, guild_id, interaction_id, token, application_id}) => {
  await waitingMsg({interaction_id, token})
  const result = await innerFixNames({dbClient, guild_id})
  return updateResponse({application_id, token, content: `Done, ${result} players updated`})
}

export const innerFixNames = async ({guild_id, dbClient}) => {
  const allPlayers = await getAllPlayers(guild_id)
  const updateTime = Date.now()
  const expiryUpdate = updateTime - 604800000 // seven days
  return dbClient(async ({players, teams, contracts}) => {
    const [pagePlayers, allTeams] = await Promise.all([
      players.find({$or: [{updateTime:null}, {updateTime: {$gte: expiryUpdate}}]}, {limit: 10}).toArray(),
      teams.find({}).toArray()
    ])
    /*const playerContracts =*/ await contracts.find({until: null, playerId: {$in: pagePlayers.map(player=>player.id)}}, {sort: {id: -1}})
    for await (const dbPlayer of pagePlayers) {
      const player = allPlayers.find(player=> player.user.id === dbPlayer.id)
      let nick = dbPlayer.nick
      const oldNick = nick
      if(player) {
        const teamSaved = allTeams.find(team=> console.log(team.shortName) || team.shortName && team.shortName.length > 1 && nick.includes(team.shortName+' |'))
        console.log(teamSaved)
        if(teamSaved) {
          nick = removePlayerPrefix(teamSaved.shortName, nick)
        }
        const playerTeam = allTeams.find(team => player.roles.includes(team.id))
        if(playerTeam){
          nick = addPlayerPrefix(playerTeam.shortName, nick)
        }
        console.log(oldNick, nick, teamSaved?.shortName, playerTeam?.shortName)
      } else {
        console.log(nick, dbPlayer.id, 'Not on server')
      }
      await players.updateOne({_id: dbPlayer._id}, {$set: {nick, updateTime }})
    }
    return pagePlayers.length
  })
}

export const systemTeam = async ({interaction_id, application_id, token, options, guild_id,  dbClient})=> {
  const {team:role} = optionsToObject(options)
  await waitingMsg({interaction_id, token})
  let response = 'No team found'
  response = await dbClient(async ({teams})=>{
    let dbResponse
    try {
      const [team, teamRoleResp] = await Promise.all([
        teams.findOne({id: role}),
        DiscordRequest(`guilds/${guild_id}/roles/${role}`)
      ])
      const teamRole = await teamRoleResp.json()
      console.log(team, teamRole)
      const everyoneRoleResp = await DiscordRequest(`/guilds/${guild_id}/roles/${guild_id}`)
      const everyoneRole = await everyoneRoleResp.json()
      console.log(everyoneRole)
      const payload = {
        active: team?.active || false,
        shortName: team?.shortName || "",
        displayName: team?.displayName || "",
        budget: team?.budget || 0,
        city: team?.city || "",
        isPG: !team?.shortName
      }
      const channelName = teamRole.name.toLowerCase().replaceAll(' ', '-')
      if(!team?.channel) {
        const channelCreateResponse = await DiscordRequest(`/guilds/${guild_id}/channels`, {
          method: 'POST',
          body: {
            name: `⚪｜${channelName}`,
            type: 0,
            topic: `${teamRole.name}'s channel`,
            permission_overwrites: [{
              id: role,
              type: 0,
              allow: 0x40 | 0x400 | 0x800
            }, {
              id: serverRoles.psafManagementRole,
              type: 0,
              allow: 0x40 | 0x400 | 0x800
            },{
              id: everyoneRole.id,
              type: 0,
              deny: 0x400
            }],
            parent_id: '1237770362264092722', //TODO TO AUTOMATISE
          }
        })
        const channelResponse = await channelCreateResponse.json()
        payload.channel = channelResponse?.id
      }
      //const teamRole = roles.find(({id})=> id === role)
      const res = await teams.updateOne({id: role}, {$set: {
        ...payload,
        ...teamRole,
      }}, {upsert: true})
      if(res.modifiedCount > 0) {
        dbResponse = `${teamRole.name} updated`
      } else {
        dbResponse = `${teamRole.name} added`
      }
    } catch(e){
      dbResponse = `Failed to set up team: ${e.message}\r Please send this error to a dev`.substring(0, 1999)
    }
    return dbResponse
  })
  return updateResponse({application_id, token, content: response})
}

export const doubleContracts = async ({interaction_id, token, application_id, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const content = await dbClient(async({contracts})=> {
    const duplicates = []
    await contracts.aggregate([
      { $match: { 
        endedAt: null
      }},
      { $group: { 
        //_id: { team: "$team", playerId: "$playerId"}, // can be grouped on multiple properties 
        _id: { playerId: "$playerId"}, // can be grouped on multiple properties 
        dups: { "$addToSet": "$_id" }, 
        count: { "$sum": 1 } 
      }},
      { $match: { 
        count: { "$gt": 1 }    // Duplicates considered as count greater than one
      }}
    ],
    {allowDiskUse: true}       // For faster processing if set is larger
    )               // You can display result until this and check duplicates 
    .forEach(function(doc) {
        doc.dups.shift();      // First element skipped for deleting
        doc.dups.forEach( function(dupId){ 
            duplicates.push(dupId);   // Getting all duplicate ids
            }
        )
    })
    
    // If you want to Check all "_id" which you are deleting else print statement not needed
    console.log(JSON.stringify(duplicates))
    return JSON.stringify(duplicates)
    //const response = await contracts.deleteMany({_id:{$in:duplicates}})
    //return response
  })
  await updateResponse({application_id, token, content})
}

/*export const doubleContracts = async ({interaction_id, token, application_id, dbClient}) => {
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })

  const response = await dbClient(async ({contracts})=> {
    const allActiveContracts = await contracts.find({endedAt: null}).toArray()
    const contractsPerPlayer = allActiveContracts.reduce((playerContracts={}, currentContract)=> {
      console.log(playerContracts)
      console.log(currentContract)
      const currentPlayerContracts = playerContracts[currentContract.playerId] || []
      console.log(currentPlayerContracts)
      playerContracts[currentContract.playerId] = [...currentPlayerContracts, currentContract]
      return playerContracts
    }, [])
    const extra = contractsPerPlayer.filter(playerContracts => playerContracts.length > 1)
    return 'Players with double contracts: \r' + extra.map((playerContracts) => `<@${playerContracts[0].id}> - ${playerContracts.map(contract=> `<@&${contract.team}>`).join(' ')}`).join('\r')+'__'
  })

  return DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      content: response.substring(0, 1999),
      flags: 1 << 6
    }
  })
}*/

const PSOBATCHSIZE = 15

export const checkForPSO = async ({dbClient, playerIdsToPSOCheck=[]}) => {
  const allPlayers = await getAllPlayers(process.env.GUILD_ID)
  let unverifiedPlayers = []
  const remainingIdsToCheck = await dbClient(async ({players, mongoCache})=> {
    const playersCache = await mongoCache.findOne({name: 'unregisteredPlayers'})
    const playersIds = playersCache ? playersCache.ids : playerIdsToPSOCheck
    const playersList = playersIds?.length>0 ? (
      allPlayers.filter(player=> (!player.roles.includes(serverRoles.steamVerified)) && player.roles.includes(serverRoles.registeredRole) && playersIds.includes(player.user.id))
    ) : (
      allPlayers.filter(player=>(!player.roles.includes(serverRoles.steamVerified)) && player.roles.includes(serverRoles.registeredRole)).sort(()=> Math.random()-0.5)
    )
    const batchToProcess = playersList.slice(0, PSOBATCHSIZE)
    const remainingIdsToCheck = playersList.slice(PSOBATCHSIZE).map(player=>player.user.id)
    const playerIds = batchToProcess.map(player=> player.user.id)
    const dbPlayers = await players.find({id: {$in: playerIds}}).toArray()
    for await(const discPlayer of batchToProcess) {
      const dbPlayer = dbPlayers.find(dbPlayer=> dbPlayer.id === discPlayer.user.id)
      if(!dbPlayer) {
        unverifiedPlayers.push({id: discPlayer.user.id})
        break
      }

      const psoSummary = await getPSOSteamDetails({steamUrl: dbPlayer.steam, steamId: dbPlayer.steamId, playerId: dbPlayer.id, member: discPlayer})
      if(psoSummary.validated) {
        const body = {
          roles: [...new Set([...discPlayer.roles, serverRoles.steamVerified])]
        };
        const setPayload = {steamVerified: true, hoursWhenChecked: (psoSummary.playtime_forever||0/60)}
        if(psoSummary.steamUrl) {
          setPayload.steam = psoSummary.steamUrl
        }
        await players.updateOne({id: dbPlayer.id}, {$set: setPayload})
        await postMessage({channel_id: serverChannels.registrationsChannelId, content: `Validated Player <@${dbPlayer.id}> - id: ${dbPlayer.steamId} url: ${psoSummary.steamUrl || dbPlayer.steam} PSO hours: ${(psoSummary.playtime_forever || 0)/60}`})
        await updateDiscordPlayer(process.env.GUILD_ID, discPlayer.user.id, body)
        await sendDM({playerId: dbPlayer.id, content: `You have been Steam verified.\rPSO Hours: ${(psoSummary.playtime_forever || 0)/60}}.\rYou can now access transfers, and play matches.`})
      } else {
        if(dbPlayer.steamVerified) {
          break
        }
        await players.updateOne({id: dbPlayer.id}, {$set: {steamValidation: psoSummary.message, hoursWhenChecked: psoSummary.playtime_forever}})
        const body = {
          roles: discPlayer.roles.filter(role=> ![serverRoles.registeredRole, serverRoles.steamVerified].includes(role))
        }
        await updateDiscordPlayer(process.env.GUILD_ID, discPlayer.user.id, body)
        const instructionsLink = discPlayer.roles.includes(serverRoles.turkishLanguage) ? 'https://discord.com/channels/1072193923100966992/1337844250867666954' : 'https://discord.com/channels/1072193923100966992/1307736737304412200'
        await sendDM({playerId: dbPlayer.id, content: `You failed validation: ${psoSummary.message}\rPlease follow the instructions ${instructionsLink}`})
        unverifiedPlayers.push({id: discPlayer.user.id, ...psoSummary})
      }
    }
    await mongoCache.updateOne({name: 'unregisteredPlayers'}, {$set: {ids: remainingIdsToCheck}}, {upsert: true})
    return remainingIdsToCheck
  })
  await postMessage({channel_id:serverChannels.botTestingChannelId, content: `Tested ${PSOBATCHSIZE} players, following not passing validation:\r${unverifiedPlayers.map(player=> `<@${player.id}>: ${JSON.stringify(player)}`).join('\r')}\r${remainingIdsToCheck?.length} players to check in list`})
  return remainingIdsToCheck
}

export const getUnregisteredPlayerIds = async() => {
  const allPlayers = await getAllPlayers(process.env.GUILD_ID)
  return allPlayers.filter(player=>(!player.roles.includes(serverRoles.steamVerified)) && player.roles.includes(serverRoles.registeredRole)).map(player=>player.user.id)
}

export const manualSteamVerification = async({interaction_id, token, options, callerId, application_id, guild_id, dbClient}) => {
  if(!["234614153023717376", "269565950154506243"].includes(callerId)) {
    return silentResponse({interaction_id, token, content: "Restricted"})
  }
  const {player} = optionsToObject(options)
  await waitingMsg({interaction_id, token})
  const allPlayers = await getAllPlayers(guild_id)
  const discPlayer = allPlayers.find(discPlayer=> discPlayer.user.id === player)
  const content = await dbClient(async({players})=> {
    const dbPlayer = await players.findOne({id: player})
    if(!dbPlayer) {
      return `Can't find <@${player}>`
    }
    const psoSummary = await getPSOSteamDetails({steamUrl: dbPlayer.steam, steamId: dbPlayer.steamId, playerId: dbPlayer.id, member: discPlayer})
    if(psoSummary.validated) {
      const body = {
        roles: [...new Set([...discPlayer.roles, serverRoles.steamVerified])]
      };
      const setPayload = {steamVerified: true}
      if(psoSummary.steamUrl) {
        setPayload.steam = psoSummary.steamUrl
      }
      await players.updateOne({id: dbPlayer.id}, {$set: setPayload})
      await postMessage({channel_id: serverChannels.registrationsChannelId, content: `Validated Player <@${dbPlayer.id}> - id: ${dbPlayer.steamId} url: ${psoSummary.steamUrl || dbPlayer.steam} PSO hours: ${(psoSummary.playtime_forever || 0)/60}`})
      await updateDiscordPlayer(process.env.GUILD_ID, discPlayer.user.id, body)
      await sendDM({playerId: dbPlayer.id, content: `You have been Steam verified.\rPSO Hours: ${(psoSummary.playtime_forever || 0)/60}}.\rYou can now access transfers, and play matches.`})
    } else {
      return JSON.stringify({id: discPlayer.user.id, ...psoSummary})
    }

    return 'validated'
  })
  console.log(content)
  return updateResponse({application_id, token, content})
}

export const blacklistTeam = async ({interaction_id, application_id, token, guild_id, member, options, dbClient}) => {
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })
  if(!member.roles.includes(serverRoles.presidentRole)) {
    return updateResponse({application_id, token, content: 'This command is only available to presidents.'})
  }
  const {team} = optionsToObject(options)
  await dbClient(({teams})=> 
    teams.updateOne({id:team}, {$set: {disqualified: true}})
  )
  const allPlayers = await getAllPlayers(guild_id)
  const teamPlayers = allPlayers.filter(({roles})=> roles.includes(team))
  await Promise.all(teamPlayers.map(({user, roles}) => (
    DiscordRequest(`guilds/${guild_id}/members/${user.id}`, {
      method: 'PATCH',
      body: {
        roles: [...new Set([...roles, serverRoles.matchBlacklistRole])]
      }
    })
  )))
  return await DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      content: 'Done',
      flags: 1 << 6
    }
  })
}

export const emoji = async({interaction_id, token, guild_id, options}) => {
  const {emoji} = optionsToObject(options)
  const emojisResp = await DiscordRequest(`/guilds/${guild_id}/emojis`, { method: 'GET' })
  const emojis = await emojisResp.json()
  const emojiObj = emojis.find(({name})=> emoji.includes(name))
  return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `Name: ${emojiObj.name} Id: ${emojiObj.id}`,
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })
}

export const initCountries = async ({application_id, token, dbClient}) => {
  return await dbClient(async ({nationalities})=> {
    countries.forEach(async({name,flag})=> {
      await nationalities.updateOne({name}, {$set: {name, flag}}, {upsert: true})
    })
    const natCount = await nationalities.countDocuments({})
    return updateResponse({application_id, token, content: `${natCount} nationalities updated`})
  })
};

export const updateLeagues = async ({interaction_id, token, dbClient, callerId}) => {
  if(callerId !== '269565950154506243'){
    return quickResponse({interaction_id, token, content: 'Forbidden', isEphemeral: true})
  }
  const content = await dbClient(async({leagueConfig})=> {
    const allLeagues = await leagueConfig.find({}).toArray()
    const formattedLeagues = allLeagues.map(({name, value, emoji, pingRole, standingsMsg, channel, defaultImage, isInternational=false, active=false, players=6, order}, index)=>({
      name,
      value,
      emoji,
      pingRole,
      standingsMsg,
      channel,
      defaultImage,
      isInternational,
      active,
      players,
      order: order || index
    }))  
    await leagueConfig.deleteMany({})
    await leagueConfig.insertMany(formattedLeagues)
    return `${formattedLeagues.length} leagues updated`
  })
  return silentResponse({interaction_id, token, content})
}

const system = async ({interaction_id, token, callerId, options, ...rest}) => {
  if(callerId !== "269565950154506243") {
    return quickResponse({interaction_id, token, content:'Reserved to ShinSH', isEphemeral: true})
  }
  const subCommand = options[0]
  await waitingMsg({interaction_id, token})
  if(subCommands[subCommand?.name]) {
    return subCommands[subCommand?.name]({...rest, callerId, token, options: subCommand.options})
  }
}

export const internalValidateSteamId = async ({dbClient}) => (
  dbClient(async ({players})=> {
    const guild_id = process.env.GUILD_ID
    const playersWithSteam = await players.find({steam: {$ne: null}, steamId: null}).toArray()
    const allPlayers = await getAllPlayers(guild_id)
    const playersWithSteamBatches = batchesFromArray(playersWithSteam, 50)
    const invalidSteamIdPlayers = []
    const validSteamIdPlayers = []
    for await (const playerBatch of playersWithSteamBatches) {
      let steamids = []
      for await (const player of playerBatch) {
        let steamId = ''
        const profileMatch = player.steam.match(/.*\/(\d+)\/?/)
        if(profileMatch !== null) {
          steamId = profileMatch[1]
        }
        if(player.steam.includes("steamcommunity.com/id/")) {
          const [,vanityurl] = player.steam.match(/steamcommunity.com\/id\/(\w+)\/?/)
          const vanityResp = await SteamRequest(SteamRequestTypes.VanityUrl, {vanityurl})
          const vanityProfile = await vanityResp.json()
          console.log(vanityProfile)
          if(vanityProfile?.response?.steamid) {
            steamId = vanityProfile.response.steamid
          }
        }
        if(steamId){
          steamids.push(steamId)
          validSteamIdPlayers.push({...player, steamId})
        } else {
          invalidSteamIdPlayers.push(player)
        }
      }
      const profilesResp = await SteamRequest(SteamRequestTypes.GetPlayerSummaries, {steamids})
      const profiles = await profilesResp.json()
      const playersSteam = profiles.response.players
      const playerSteamIds = playersSteam.map(player=> player.steamid)
      const unrecognisedPlayers = validSteamIdPlayers.filter(player => !playerSteamIds.includes(player.steamId))
      invalidSteamIdPlayers.push(...unrecognisedPlayers)
      const batchToUpdate = validSteamIdPlayers.filter(player => playerSteamIds.includes(player.steamId)).map(player => {
        const steamProfile = playersSteam.find(steamPlayer => steamPlayer.steamid === player.steamId)
        return {
        ...player,
        steam: steamProfile.profileurl,
        ingamename: steamProfile.personaname,
        loccountrycode: steamProfile.loccountrycode,
        steamCreated: steamProfile.timecreated,
        }
      })
      for await (const dbPlayer of batchToUpdate) {
        const discPlayer = allPlayers.find(player=> player.user.id === dbPlayer.id)
        if(discPlayer && !discPlayer.roles.includes(serverRoles.registeredRole)) {
          const roles = [...new Set([...discPlayer.roles, getRegisteredRole(guild_id)])]
          await DiscordRequest(`guilds/${guild_id}/members/${discPlayer.user.id}`, {
            method: 'PATCH',
            body: {roles}
          })
        }
        const {
          steamId,
          ingamename,
          loccountrycode,
          steamCreated,
        } = dbPlayer
        await players.updateOne({id: dbPlayer.id}, {$set: {
          steamId, ingamename, loccountrycode, steamCreated
        }})
      }
    }
    const content = invalidSteamIdPlayers.length > 0 ?
     `<@&${serverRoles.presidentRole}>: The following players have an incorrect SteamID:\r${invalidSteamIdPlayers.map(player=> `<@${player.id}>: ${player.steam}\r`).toString()}`
     : `Steam IDs checked, all valid`
    DiscordRequest(`/channels/${serverChannels.registrationsChannelId}/messages`, {
      method: 'POST',
      body: {
        content,
      }
    })
    for await(const dbPlayer of invalidSteamIdPlayers) {
      const discPlayer = allPlayers.find(player=> player.user.id === dbPlayer.id)
      if(discPlayer && discPlayer.roles.includes(serverRoles.registeredRole)) {
        const registeredRole = getRegisteredRole(guild_id)
        const roles = discPlayer.roles.filter(role=> role !== registeredRole)
        await DiscordRequest(`guilds/${process.env.GUILD_ID}/members/${discPlayer.user.id}`, {
          method: 'PATCH',
          body: {roles}
        })
      }
      await players.updateOne({id: dbPlayer.id}, {$set: {steam: null}})
    }

    return `${validSteamIdPlayers.length} valid players found, ${invalidSteamIdPlayers.length} invalid players`
  })
)

const validateSteamId = async ({dbClient, application_id, token}) => {
  const content = await internalValidateSteamId({dbClient})
  return updateResponse({application_id, token, content})
}

export const detectSteamAlts = async ({dbClient}) => (
  dbClient(async({players})=> {
    const duplicateSteamIds = await players.aggregate([{
      $group:
        {
          _id: "$steamId",
          steamCount: {
            $sum: 1,
          },
        },
    },{
      $match: {
        _id: {
          $ne: null,
        },
        steamCount: {
          $gt: 1,
        },
      },
    },{
      $project: {
        name: "$_id",
        _id: 0,
      },
    },
    ]).toArray()
    const arrayOfSteamIds = duplicateSteamIds.map(({name})=> name)
    console.log(arrayOfSteamIds)
    
    const playersWithAlts = await players.aggregate([{
      $match: {steamId: {$in: arrayOfSteamIds}}
    },{
      $lookup: {
        from: "Contracts",
        localField: "id",
        foreignField: "playerId",
        as: "contracts",
      }
    }]).toArray()
    const discPlayers = await getAllPlayers(process.env.GUILD_ID)
    console.log(playersWithAlts.map(player=> `${player.name} ${player.steamId}`))
    const realAlts = playersWithAlts.map(playerWithAlts => {
      const discPlayer = discPlayers.find(player=> player.user.id === playerWithAlts.id)
      if(discPlayer && discPlayer.roles.includes(serverRoles.disabledRole)) {
        return {...playerWithAlts, name: `:no_entry: ${playerWithAlts.name}`}
      }
      return playerWithAlts
    }).sort((a,b)=> a.steamId.localeCompare(b.steamId))
    const groupedAlts = new Map()
    for(const player of realAlts) {
      if(!groupedAlts.has(player.steamId)) {
        groupedAlts.set(player.steamId, [])
      }
      groupedAlts.get(player.steamId).push(player)
    }
    console.log(groupedAlts)
    /*const realAlts = playersWithAlts.filter(playerWithAlts => {
      const playersWithtoutFlag = (playerWithAlts.playerIds||[]).filter(playerId => {
        const discPlayer = discPlayers.find(player=> player.user.id === playerId.id)
        if(discPlayer) {
          return !discPlayer.roles.includes(serverRoles.disabledRole)
        }
        return true // change to false if you want to ignore when people have disabled their account
      })
      return playersWithtoutFlag.length > 1
    })
    let content = '# Players with Alts: \r' +
      playersWithAlts.map(playerWithAlts=> playerWithAlts.playerIds.map(playerId=> `<@${playerId.id}> (${playerId.name})`).join(' ') + ' ' + playerWithAlts._id).join('\r')*/
    let content = '# Players with Alts: \r'
    await postMessage({channel_id: serverChannels.botTestingChannelId, content})
    const altsItemized = Array.from(groupedAlts.entries()).map(groupedAlt=>
      `${groupedAlt[0]}:\r${groupedAlt[1].map(playerWithAlts=> 
        `<@${playerWithAlts.id}> (${playerWithAlts.id} ${playerWithAlts.name}) Contracts:${(playerWithAlts.contracts||[]).map(contract=> 
          `<@&${contract.team}> > ${contract.until}`).join(' - ')
        }`).join('\r')}`
      )
    const chunkSize = 5;
    const chunks = []
    for (let i = 0; i < altsItemized.length; i += chunkSize) {
        chunks.push(altsItemized.slice(i, i + chunkSize))
    }
    for await(const chunk of chunks) {
      await postMessage({channel_id: serverChannels.botTestingChannelId, content: '\r'+chunk.join('\r---\r')})
    }
    //await postMessage({channel_id: serverChannels.botTestingChannelId, content})
  })
)

export const updateSteamNames = async ({dbClient}) => (
  dbClient(async({players}) => {
    const dbPlayers = await players.find({steamId: {$ne: null}}).toArray()
    const dbPlayersBatches = batchesFromArray(dbPlayers, 50)
    const nameChanges = []
    for await(const dbPlayersBatch of dbPlayersBatches) {
      const steamids = dbPlayersBatch.map(player=> player.steamId)
      const profilesResp = await SteamRequest(SteamRequestTypes.GetPlayerSummaries, {steamids})
      const profiles = await profilesResp.json()
      const steamPlayers = profiles?.response?.players
      for await (const dbPlayer of dbPlayersBatch) {
        const steamProfile = steamPlayers.find(player=> player.steamid === dbPlayer.steamId)
        if(dbPlayer.ingamename !== steamProfile.personaname) {
          console.log(`update ${dbPlayer.ingamename} to ${steamProfile.personaname}`)
          nameChanges.push(`<@${dbPlayer.id}> : ${dbPlayer.ingamename} => ${steamProfile.personaname}`)
          await players.updateOne({id: dbPlayer.id}, {$set: {
            ingamename: steamProfile.personaname,
            loccountrycode: steamProfile.loccountrycode,
          }})
        }
      }
    }
    
    console.log(nameChanges)
    //todo: handle name changes in multiple posts
    await postMessage({channel_id: serverChannels.nameChangesChannelId, content:nameChanges.join('\r')})
  })
)

export const internalUpdateRegister = async ({dryrun, guild_id, dbClient}) => {
  const allPlayers = await getAllPlayers(guild_id)
  const registeredRole = getRegisteredRole(guild_id)
  const unregisteredPlayers = allPlayers.filter(member=> !member.roles.includes(registeredRole))
  //console.log(`${unregisteredPlayers.length} unregistered players`)
  const size = 20
  const unregisteredPlayersBatches = Array.from(
    new Array(Math.ceil(unregisteredPlayers.length / size)),
    (_, i) => unregisteredPlayers.slice(i * size, i * size + size)
  )

  let updatedPlayers = 0
  const content = await dbClient( async ({players})=> {
    for await (const playerBatch of unregisteredPlayersBatches) {
      const playerBatchIds = playerBatch.map(member=>member.user.id)
      const dbPlayers = await players.find({id: {$in: playerBatchIds}}).toArray()
      //console.log(`${dbPlayers.length} found in batch of ${playerBatch.length}`)
      const registreredDbPlayers = dbPlayers.filter(player=> !isSteamIdIncorrect(player.steam)).map(dbPlayer=>dbPlayer.id)
      //console.log(`${registreredDbPlayers}`)
      const playersToUpdate = playerBatch.filter(member=>registreredDbPlayers.includes(member.user.id))
      if(dryrun) {
        console.log(playersToUpdate.map(member => getPlayerNick(member)))
      } else {
        await Promise.all(playersToUpdate.map(member => (
          DiscordRequest(`guilds/${guild_id}/members/${member.user.id}`, {
            method: 'PATCH',
            body: {
              roles: [...new Set([...member.roles, getRegisteredRole(guild_id)])]
            }
          }
        ))))
      }
      updatedPlayers += playersToUpdate.length
    }
    return `${updatedPlayers} have been registered`
  })
  return content
}

export const transferMarket = async ({application_id, token, interaction_id, callerId, dbClient, options}) => {
  const {active} = optionsToObject(options)
  await waitingMsg({interaction_id, token})
  const isActive = active === "open"
  const content = await dbClient(async ({config}) => {
    await config.updateOne({name: 'transferMarket'}, {$set: {active: isActive}}, {upsert: true})
    return `Transfer market is now ${isActive ? 'open' : 'closed'}`
  })
  await postMessage({channel_id: serverChannels.botActivityLogsChannelId, content: content+`\r*(from <@${callerId}>)*`})
  await updateResponse({application_id, token, content})
}

export const updateRegister = async ({application_id, token, guild_id, dbClient, options}) => {
  const {dryrun} = optionsToObject(options)
  const content = await internalUpdateRegister({dryrun, guild_id, dbClient})
  return updateResponse({application_id, token, content})
}

const runCronJob = async ({options, interaction_id, application_id, token, callerId}) => {
  const {job} = optionsToObject(options)
  const cronRequested = getCronJob(job)
  if(callerId!=="269565950154506243") {
    return silentResponse({interaction_id, token, content: 'Forbidden'})
  }

  if(!cronRequested) {
    return silentResponse({interaction_id, token, content: 'Job not found'})
  } else {
    const [jobName, jobRecurrence, jobFunction] = cronRequested
    await silentResponse({interaction_id, token, content: `Manually starting ${jobName}, usually with recurrence ${jobRecurrence}`})
    await jobFunction()
    await followUpResponse({application_id, token, content: `${job} completed`})
  }
}

export const systemTeamCmd = {
  name: 'systemteam',
  description: 'Update the team with the details from discord',
  type: 1,
  options: [{
    type: 8,
    name: 'team',
    description: 'Team',
    required: true
  }]
}

export const doubleContractsCmd = {
  name: 'doublecontracts',
  description: 'Show players having more than 1 active contract',
  type: 1
}

export const updateLeaguesCmd = {
  name: 'updateleagues',
  description: 'system',
  type: 1,
  psaf: true,
  func: updateLeagues,
}

export const blacklistTeamCmd = {
  name: 'blacklistteam',
  description: 'Blacklist all a team\'s member list due to multiple FFs',
  type: 1,
  options: [{
    type: 8,
    name: 'team',
    description: 'Team',
    required: true
  }]
}

export const emojiCmd = {
  name: 'emoji',
  description: 'Find details for one emoji',
  type: 1,
  options: [{
    type: 3,
    name: 'emoji',
    description: 'The Emoji you\'re looking for',
    required: true,
  }]
}

export const managerContractsCmd = {
  type: 1,
  name: 'managercontracts',
  description: 'Update all managers contracts to one season',
}

export const fixNamesCmd = {
  type: 1,
  name: 'fixnames',
  description: 'Fix User names in the DB',
}

export const expireThingsCmd = {
  type: 1,
  name: 'expirethings',
  description: 'Expire whatever needs to be expired'
}

const subCommands = {
  'updateregister': updateRegister,
  'validatesteamid' : validateSteamId,
  'initcountries': initCountries,
}

const systemCmd = {
  name: 'system',
  description: 'System',
  psaf: true,
  wc: true,
  func: system,
  options: [{
    type: 1,
    name: 'updateregister',
    description: 'Update the registration status on related servers',
    options: [{
      name: 'dryrun',
      description: 'Runs without making changes',
      type: 5
    }]
  },{
    type: 1,
    name: 'validatesteamid',
    description: 'Validate the steam IDs of all players'
  },{
    type: 1,
    name: 'initcountries',
    description: 'Update the countries list in DB'
  }]
}

const manualSteamVerificationCmd = {
  name: 'steamverif',
  description: 'System',
  psaf: true,
  func: manualSteamVerification,
  options: [{
    type: 6,
    name: 'player',
    description: 'Player',
    required: true
  }]
}

const transferMarketCmd = {
  name: 'transfermarket',
  description: 'Transfer Market toggle on/off',
  psaf: true,
  func: transferMarket,
  options: [{
    type: 3,
    name: 'active',
    description: 'Open or closed',
    choices: ["open", "closed"].map(value=> ({name: value, value})),
    required: true,
  }]
}

const runCronJobCmd = {
  name: 'runcronjob',
  description: 'Run a cron job',
  psaf: true,
  func: runCronJob,
  options: [{
    type: 3,
    name:'job',
    description: 'Job to run',
    required: true,
  }]
}

export default [systemCmd, updateLeaguesCmd, manualSteamVerificationCmd, transferMarketCmd, runCronJobCmd]