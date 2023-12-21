import { InteractionResponseType } from "discord-interactions"
import { DiscordRequest } from "../utils.js"
import { getPlayerNick, msToTimestamp, optionsToObject, sleep } from "../functions/helpers.js"
import { countries } from "../config/countriesConfig.js"
import { getAllPlayers } from "../functions/playersCache.js"
import { serverRoles } from "../config/psafServerConfig.js"
import { isMemberStaff } from "../site/siteUtils.js"

const nationalTeamPlayerRole = '1103327647955685536'
const staffRoles = ['1081886764366573658', '1072210995927339139', '1072201212356726836']
const autocompleteCountries = countries.map(({name, flag})=> ({name, flag, display: flag+name, search: name.toLowerCase()}))

export const player = async ({options, interaction_id, callerId, guild_id, application_id, member, token, dbClient}) => {
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
  await dbClient(async ({players, nationalities, teams, contracts})=> {
    const dbPlayer = await players.findOne({id: playerId})
    const allTeams = await teams.find({active:true}).toArray()
    const allTeamIds = allTeams.map(({id})=> id)
    const playerContracts = await contracts.find({playerId}).toArray()
    const team = discPlayer.roles.find(role => allTeamIds.includes(role))
    response = `<@${playerId}> - ${team ? `<@&${team}>` : 'Free Agent'}\r`
    if(dbPlayer) {
      const country = await nationalities.findOne({name: dbPlayer.nat1})
      const country2 = await nationalities.findOne({name: dbPlayer.nat2})
      const country3 = await nationalities.findOne({name: dbPlayer.nat3})
      if(country){
        response += `${country.flag} ${discPlayer.roles.includes(nationalTeamPlayerRole) ? 'International': ''}${country2? `, ${country2.flag}`: ''}${country3? `, ${country3.flag}`: ''}\r`
      }
      if(isMemberStaff(member)) {
        response += `Steam: ${dbPlayer.steam || 'Not saved'}\r`
      }
      if(dbPlayer.desc) {
        response += `Description: *${dbPlayer.desc}*\r`
      }
      if(playerContracts.length > 0){
        response += 'Known contracts:\r'
        const contractsList = playerContracts.sort((a, b)=> b.at - a.at).map(({team, at, endedAt, until})=> `<@&${team}> from: <t:${msToTimestamp(at)}:F> ${endedAt ? `to: <t:${msToTimestamp(endedAt)}:F>`: (discPlayer.roles.includes(serverRoles.clubManagerRole) ? ' - :crown: Manager' : `until end of season ${until-1}`)}`)
        response += contractsList.join('\r')
      }
    }
  })

  return DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      content: response,
      flags: 1 << 6
    }
  })
}

export const editPlayer = async ({options=[], member, callerId, interaction_id, guild_id, application_id, token, dbClient}) => {
  const {player = callerId, nat1, nat2, nat3, desc, steam} = optionsToObject(options)
  
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
      desc: desc || dbPlayer.desc,
      steam: steam || dbPlayer.steam,
    }}, {upsert: true})
    const updatedPlayer = await players.findOne({id: player}) || {}
    const team = discPlayer.roles.find(role => allTeamIds.includes(role))
    response = `<@${player}> - ${team ? `<@&${team}>` : 'Free Agent'}\r`
    if(updatedPlayer) {
      const country = await nationalities.findOne({name: updatedPlayer.nat1})
      const country2 = await nationalities.findOne({name: updatedPlayer.nat2})
      const country3 = await nationalities.findOne({name: updatedPlayer.nat3})
      if(country){
        response += `${country.flag} ${discPlayer.roles.includes(nationalTeamPlayerRole) ? 'International': ''}${country2? `, ${country2.flag}`: ''}${country3? `, ${country3.flag}`: ''}\r`
      }
      if(updatedPlayer.desc) {
        response += `Description: *${updatedPlayer.desc}*\r`
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
      contract: contract?.until,
      isManager: player.roles.includes(serverRoles.clubManagerRole),
      isBlackListed: player.roles.includes(serverRoles.matchBlacklistRole)
    })
  })
  let response = `<@&${teamToList}> players: ${displayPlayers.length}/30${displayPlayers.length>30? '\r## Too many players':''}\r`
  response += `${displayPlayers.map(({ user, nat1, nat2, nat3, contract, isManager, isBlackListed }) => 
    `${isManager?':crown: ':''}${isBlackListed?':no_entry_sign: ':''}${nat1?displayCountries[nat1]:''}${nat2?displayCountries[nat2]:''}${nat3?displayCountries[nat3]:''} <@${user.id}>${contract && !isManager? ` - Season ${contract-1}`: ''}`
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
  await dbClient(async ({teams, players, nationalities})=>{
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

export const players = async ({guild_id, interaction_id, application_id, token, options, dbClient}) => {
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
  const {team} = Object.fromEntries(options.map(({name, value})=> [name, value]))
  
  const response = await dbClient(async ({players, nationalities, contracts})=> {
    const [allNations, teamContracts] = await Promise.all([
      nationalities.find({}).toArray(),
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
    description: 'Team',
    required: true
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
  },{
    type: 3,
    name: 'desc',
    description: 'Player\'s description',
  }, {
    type: 3,
    name: 'steam',
    description: 'Steam Account'
  }]
}