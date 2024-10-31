import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions";
import { serverChannels, serverRoles, transferBanStatus } from "../config/psafServerConfig.js";
import { DiscordRequest } from "../utils.js";
import { getAllNationalities } from "./allCache.js";

export const isPSAF = (guild_id) => guild_id === process.env.GUILD_ID

export const msToTimestamp = (ms) => {
  const msAsString = ms.toString();
  return msAsString.substring(0, msAsString.length - 3);
}

export const timestampToMs = (timestamp) => {
  return Number(timestamp) * 1000
  
}

export const optionToTimezoneStr = (option = 0) => {
  switch (option) {
    case 1:
      return "CEST";
    case 2:
      return "EEST";
    default:
      return "BST";
  }
}

export const getPlayerNick = (player) => 
  player?.nick || player?.user?.global_name || player?.user?.username || 'NO NAME'

export const removePlayerPrefix = (teamShortName, playerName) => {
  const teamPrefixToRemove = `${teamShortName} | `
  const indexTeamPrefix = playerName.indexOf(teamPrefixToRemove)
  let updatedPlayerName = `${playerName}`
  if(indexTeamPrefix>=0) {
    updatedPlayerName = `${playerName.substring(0,indexTeamPrefix)}${playerName.substring(indexTeamPrefix+teamPrefixToRemove.length)}`
  }
  return updatedPlayerName
}

export const addPlayerPrefix = (teamShortName, playerName) => {
  let prefix = ''
  let displayName = playerName
  if(playerName.startsWith('⭐')) {
    displayName = playerName.substring(1)
    displayName = displayName.trimStart()
    prefix = '⭐ '
  }
  return `${prefix}${teamShortName} | ${displayName}`
}

export const updatePlayerRating = (playerName, rating) => {
  const ratingRegExp = /\[(\d){1,2}\]$/
  const previousRatingMatch = playerName.match(ratingRegExp)
  console.log(previousRatingMatch)
  if(previousRatingMatch !== null) {
    return {name: playerName.replace(ratingRegExp, `[${rating}]`), previousRating:previousRatingMatch[0]}
  }
  return {name: `${playerName} [${rating}]`}
}

export const setInternational = (playerName) => playerName.startsWith('⭐ ') ? playerName : `⭐ ${playerName}`

export const removeInternational = (playerName) => playerName.startsWith('⭐ ') ? playerName.substring(2) : playerName

export const getPlayerTeam = (player, teams) => 
  teams.findOne({active:true, id: {$in: player.roles}})

export const displayTeam = (team, noLogo) => (
  `Team: ${team.flag} ${team.emoji}${team.transferBan? (team.transferBan === transferBanStatus.transferBan ? ' :octagonal_sign:': ' :no_entry:'):''} ${team.name} - ${team.shortName}` +
  `\r> Budget: ${new Intl.NumberFormat('en-US').format(team.budget)}` +
  `\r> City: ${team.city}` +
  `\r> Palmarès: ${team.description || 'None'}` +
  `${team.channel ? `\r> Channel: https://discord.com/channels/1072193923100966992/${team.channel}` : ''}` +
  `${noLogo ? '': `\r> Logo: ${team.logo || 'None'}`}`
)

export const genericFormatMatch = (teams, match, allLeagues) => {
  const league = allLeagues.find(({value})=> value === match.league)
  const homeTeam = teams.find(({id})=> id === match.home)
  const awayTeam = teams.find(({id})=> id === match.away)
  let response = `<${league.emoji}> **| ${league.name} ${match.matchday}** - <t:${match.dateTimestamp}:F>`
    response += `\r> ${homeTeam.flag} ${homeTeam.emoji} <@&${homeTeam.id}> ${match.finished ? `**${match.homeScore} - ${match.awayScore}**`: ' :vs: '} <@&${awayTeam.id}> ${awayTeam.emoji} ${awayTeam.flag}`
  return response
}
export const genericInterFormatMatch = (nations, nationalSelections, match, allLeagues) => {
  const league = allLeagues.find(({value})=> value === match.league)
  const homeTeam = nationalSelections.find(({shortname})=> shortname === match.home)
  const awayTeam = nationalSelections.find(({shortname})=> shortname === match.away)
  const homeFlags = nations.filter(nation=>homeTeam.eligibleNationalities.includes(nation.name)).map(nation=>nation.flag).join('')
  const awayFlags = nations.filter(nation=>awayTeam.eligibleNationalities.includes(nation.name)).map(nation=>nation.flag).join('')
  let response = `<${league.emoji}> **| ${league.name} ${match.matchday}** - <t:${match.dateTimestamp}:F>`
    response += `\r> ${homeFlags} ${homeTeam.name} ${match.finished ? `**${match.homeScore} - ${match.awayScore}**`: ' :vs: '} ${awayTeam.name} ${awayFlags}`
  return response
}

export const handleSubCommands = async ({interaction_id, token, options, ...rest}, subCommands) => {
  const subCommand = options[0]
  console.log(interaction_id, token)
  await waitingMsg({interaction_id, token})
  if(subCommands[subCommand?.name]) {
    return subCommands[subCommand?.name]({...rest, token, options: subCommand.options})
  }
}

export const removeSubCommands = (commands) => (
  commands.map(command => (
    {...command, options: command.options.map(option => {
      // eslint-disable-next-line no-unused-vars
      const {func, ...rest} = option
      return rest
    })})
  )
)

export const getFlags = async (selection) => {
  const allNationalities = await getAllNationalities()
  return allNationalities.filter(nat => nat.name === selection.eligiblenationality).map(nat=>nat.flag).join('')
}

export const isStaffRole = (role) => [serverRoles.presidentRole, serverRoles.engineerRole, serverRoles.adminRole, serverRoles.psafManagementRole, serverRoles.trialStaffRole, serverRoles.psoStaffRole].includes(role)

export const isAdminRole = (role) => [serverRoles.presidentRole, serverRoles.engineerRole, serverRoles.adminRole].includes(role)
export const isTopAdminRole = (role) => [serverRoles.presidentRole, serverRoles.engineerRole].includes(role)

export const isMemberStaff = async (guildMember) => {
  return ((guildMember?.roles || []).find(role => isStaffRole(role)))
}
const supportedServers = [process.env.GUILD_ID, process.env.WC_GUILD_ID]

export const isServerSupported = (guild_id) => 
  supportedServers.includes(guild_id)

export const isLineupChannel = (guild_id, channel_id) =>
  (guild_id === process.env.GUILD_ID && channel_id === serverChannels.lineupsChannelId) 
  || (guild_id === process.env.WC_GUILD_ID && channel_id === serverChannels.wcLineupsChannelId)

export const getRegisteredRole = (guild_id) => {
  if(guild_id === process.env.GUILD_ID) {
    return serverRoles.registeredRole
  }
  if(guild_id === process.env.WC_GUILD_ID) {
    return serverRoles.wcRegisteredRole
  }
  throw new Error('Server unsupported')
}

export const getNationalCaptainRole = (guild_id) => {
  if(guild_id === process.env.GUILD_ID) {
    return serverRoles.nationalTeamCaptainRole
  }
  if(guild_id === process.env.WC_GUILD_ID) {
    return serverRoles.wcNationalCoachRole
  }
  throw new Error('Server unsupported')
}

export const getNationalSelectionChannel = (guild_id) => {
  if(guild_id === process.env.GUILD_ID) {
    return serverChannels.nationalSelectionsChannelId
  }
  if(guild_id === process.env.WC_GUILD_ID) {
    return serverChannels.wcNationalSelectionsChannelId
  }
  throw new Error('Server unsupported')
}

export const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export const getCurrentSeason = async (seasons) => (await seasons.findOne({endedAt: null}))?.season

export const optionsToObject = (options=[]) => Object.fromEntries(options.map(({name, value})=> [name, value]))

export const waitingMsg = async ({interaction_id, token}) => 
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })

export const quickResponse = async ({interaction_id, token, content, isEphemeral}) =>
  DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content,
        flags: isEphemeral ? InteractionResponseFlags.EPHEMERAL : 0
      }
    }
  })

export const silentResponse = async ({interaction_id, token, content}) =>
  quickResponse({interaction_id, token, content, isEphemeral: true})

export const updateResponse = async ({application_id, token, content, embeds, components}) => {
  try{
    return DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
      method: 'PATCH',
      body: {
        content: content.substring(0,1999),
        embeds,
        components,
        flags: InteractionResponseFlags.EPHEMERAL
      }
    })
  } catch(e) {
    console.error(e)
  }
}

export const followUpResponse = async ({application_id, token, content, embeds, components}) => 
  DiscordRequest(`/webhooks/${application_id}/${token}`, {
    method: 'POST',
    body: {
      content,
      embeds,
      components,
      flags: InteractionResponseFlags.EPHEMERAL
    }
  })

export const postMessage = async({channel_id, content='', components = [], attachments = [], embeds = []}) => {
  const messages = []
  let remainingContent = content
  while(remainingContent.length >= 2000) {
    let lastReturn = content.lastIndexOf('\r', 2000)
    let currentContent
    if(lastReturn === -1){
      lastReturn = Math.min(1999, remainingContent.length)
    }
    currentContent = remainingContent.substring(0, lastReturn)
    remainingContent = remainingContent.substring(lastReturn)
    messages.push(currentContent)
  }
  console.log(messages.length)
  let i = 0
  for await (const message of messages) {
    await DiscordRequest(`channels/${channel_id}/messages`, 
    {
      method: 'POST',
      body: {
        content: message,
      }
    })
    i++
    if(i>3){
      break
    }
  }
  return DiscordRequest(`channels/${channel_id}/messages`, 
  {
    method: 'POST',
    body: {
      content: remainingContent,
      components,
      attachments,
      embeds
    }
  })
}
export const updatePost = async({channel_id, messageId, content, components, attachments, embeds}) => {
  const body = {}
  if(content)
    body.content = content
  if(components)
    body.components = components
  if(attachments)
    body.attachments = attachments
  if(embeds)
    body.embeds = embeds
  return DiscordRequest(`channels/${channel_id}/messages/${messageId}`, 
  {
    method: 'PATCH',
    body
  })
}

export const getPost = async({channel_id, messageId}) => {
  return DiscordRequest(`channels/${channel_id}/messages/${messageId}`, 
    {
      method: 'GET',
    })
}

export const deleteMessage = async ({channel_id, messageId}) => 
  DiscordRequest(`channels/${channel_id}/messages/${messageId}`, {
    method: 'DELETE',
  })
//stolen from stackoverflow
export const isNumeric = (str) => {
  if (typeof str != "string") return false // we only process strings!  
  return !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
          !isNaN(parseFloat(str)) // ...and ensure strings of whitespace fail
}

//stolen from stackoverflow
export const shuffleArray = (array) => {
  for (var i = array.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = array[i];
      array[i] = array[j];
      array[j] = temp;
  }
}

export const batchesFromArray = (source, size = 50) => (
  Array.from(
    new Array(Math.ceil(source.length / size)),
    (_, i) => source.slice(i * size, i * size + size)
  )
)

export const displayTeamName = (inGuild, teamId, allTeams=[]) => (
  teamId ? (inGuild ? `<@&${teamId}>` : allTeams.find(currentTeam=>currentTeam.id === teamId)?.name) : "Free agent"
)

export const getDiscordPlayer = (guild_id, playerId) => DiscordRequest(`guilds/${guild_id}/members/${playerId}`)
export const updateDiscordPlayer = (guild_id, playerId, body) => DiscordRequest(`guilds/${guild_id}/members/${playerId}`, {
  method: 'PATCH',
  body,
})