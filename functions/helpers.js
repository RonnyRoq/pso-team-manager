import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions";
import { fixturesChannels, serverRoles } from "../config/psafServerConfig.js";
import { DiscordRequest } from "../utils.js";
import { countries } from "../config/countriesConfig.js";

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
  `Team: ${team.flag} ${team.emoji}${team.transferBan?' :octagonal_sign:':''} ${team.name} - ${team.shortName}` +
  `\r> Budget: ${new Intl.NumberFormat('en-US').format(team.budget)}` +
  `\r> City: ${team.city}` +
  `\r> Palmarès: ${team.description || 'None'}` +
  `${noLogo ? '': `\r> Logo: ${team.logo || 'None'}`}`
)

export const genericFormatMatch = (teams, match) => {
  const league = fixturesChannels.find(({value})=> value === match.league)
  const homeTeam = teams.find(({id})=> id === match.home)
  const awayTeam = teams.find(({id})=> id === match.away)
  let response = `<${league.emoji}> **| ${league.name} ${match.matchday}** - <t:${match.dateTimestamp}:F>`
    response += `\r> ${homeTeam.flag} ${homeTeam.emoji} <@&${homeTeam.id}> ${match.finished ? `**${match.homeScore} - ${match.awayScore}**`: ' :vs: '} <@&${awayTeam.id}> ${awayTeam.emoji} ${awayTeam.flag}`
  return response
}
export const genericInterFormatMatch = (teams, match) => {
  const league = fixturesChannels.find(({value})=> value === match.league)
  const homeTeam = teams.find(({name})=> name === match.home)
  const awayTeam = teams.find(({name})=> name === match.away)
  let response = `<${league.emoji}> **| ${league.name} ${match.matchday}** - <t:${match.dateTimestamp}:F>`
    response += `\r> ${homeTeam.flag} ${homeTeam.name} ${match.finished ? `**${match.homeScore} - ${match.awayScore}**`: ' :vs: '} ${awayTeam.name} ${awayTeam.flag}`
  return response
}

export const isStaffRole = (role) => [serverRoles.presidentRole, serverRoles.adminRole, serverRoles.psafManagementRole, serverRoles.trialStaffRole].includes(role)

export const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export const getCurrentSeason = async (seasons) => (await seasons.findOne({endedAt: null}))?.season

export const optionsToObject = (options) => Object.fromEntries(options.map(({name, value})=> [name, value]))

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
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content,
        flags: isEphemeral ? InteractionResponseFlags.EPHEMERAL : 0
      }
    }
  })

export const updateResponse = async ({application_id, token, content}) => 
  DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      content,
      flags: 1 << 6
    }
  })

export const postMessage = async({channel_id, content='', components = []}) =>
  DiscordRequest(`/channels/${channel_id}/messages`, 
  {
    method: 'POST',
    body: {
      content,
      components
    }
  })

//stolen from stackoverflow
export const isNumeric = (str) => {
  if (typeof str != "string") return false // we only process strings!  
  return !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
          !isNaN(parseFloat(str)) // ...and ensure strings of whitespace fail
}

export const autocompleteCountries = countries.map(({name, flag})=> ({name, flag, display: flag+name, search: name.toLowerCase()}))

//stolen from stackoverflow
export const shuffleArray = (array) => {
  for (var i = array.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = array[i];
      array[i] = array[j];
      array[j] = temp;
  }
}