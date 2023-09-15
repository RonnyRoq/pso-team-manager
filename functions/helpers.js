
export const isPSAF = (guild_id) => guild_id === process.env.GUILD_ID

export const msToTimestamp = (ms) => {
  const msAsString = ms.toString();
  return msAsString.substring(0, msAsString.length - 3);
}

export const optionToTimezoneStr = (option = 0) => {
  const today = new Date()
  switch (option) {
    case 1:
      return "CET";
    case 2:
      return "EEST";
    default:
      return "BST";
  }
}
export const getPlayerNick = (player) => 
  player.nick || player.user.global_name || player.user.username

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
  return `${teamShortName} | ${playerName}`
}

export const getPlayerTeam = (player, teams) => 
  teams.findOne({active:true, $or:player.roles.map(role=>({id:role}))})

export const displayTeam = (team) => (
  `Team: ${team.flag} ${team.emoji} ${team.name} - ${team.shortName}` +
  `\rBudget: ${new Intl.NumberFormat('en-US').format(team.budget)}` +
  `\rCity: ${team.city}` +
  `\rPalmarès: ${team.description}`
)

export const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}