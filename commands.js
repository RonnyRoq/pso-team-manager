import 'dotenv/config';
import { InstallGlobalCommands, InstallGuildCommands } from './utils.js';
import { nowCmd } from './commands/now.js';
import { timestampCmd } from './commands/timestamp.js';
import { helpCmd } from './commands/help.js';
import { blacklistTeamCmd, emojiCmd, expireThingsCmd, fixNamesCmd, managerContractsCmd, systemTeamCmd } from './commands/system.js';
import { playerCmd } from './commands/player.js';
import { confirmCmd, releaseCmd, updateConfirmCmd } from './commands/confirm.js';
import { dealCmd, loanCmd } from './commands/confirmations/deal.js';
import { renewCmd, setContractCmd, teamTransferCmd, transferCmd } from './commands/transfers.js';
import { postAllTeamsCmd, postTeamCmd, updateTeamPostCmd } from './commands/postTeam.js';
import { showBlacklistCmd } from './commands/blacklist.js';
import { expireContractsCmd, showExpiringContractsCmd, showNoContractsCmd } from './commands/contracts.js';
import { disbandTeamCmd } from './commands/disbandTeam.js';
import { getCurrentSeasonPhaseCmd, progressCurrentSeasonPhaseCmd } from './commands/season.js';
import { testDMMatchCmd } from './commands/matches/notifyMatchStart.js';
import { addSteamIdCmd, manualDoubleSteamCmd, setNameCmd } from './commands/player/steamid.js';
import { setRatingCmd } from './commands/player/rating.js';
import { listMovesCmd, moveMatchCmd } from './commands/matches/moveMatch.js';
import { arrangeDayScheduleCmd } from './commands/matches/arrangeDaySchedule.js';
import { addUniqueIdCmd } from './commands/player/uniqueId.js';
import commandsRegister from './commandsRegister.js';

const mapToCmd = (map) => {
  const globalCommands = []
  const psafCommands = []
  const wcCommands = []
  map.forEach(fullCmd => {
    // eslint-disable-next-line no-unused-vars
    const {func, psaf, wc, app, ...command} = fullCmd
    if (psaf) {
      psafCommands.push(command)
    }
    if(wc) {
      wcCommands.push(command)
    }
    if(app) {
      globalCommands.push(command)
    }
  })
  return {
    globalCommands,
    psafCommands,
    wcCommands
  }
}

const FREEPLAYER = {
  name: 'freeplayer',
  description: 'Release a player from a team',
  type: 1,
  options: [{
    type: 6,
    name: 'player',
    description: 'Player',
    required: true
  },{
    type: 8,
    name: 'team',
    description: 'Team',
    required: true
  }]
}

const FINE =  {
  name: 'fine',
  description: 'Remove money from a team\'s budget',
  type: 1,
  options: [{
    type: 8,
    name: 'team',
    description: 'Team to fine',
    required: true
  },{
    type: 4,
    name: 'amount',
    description: 'Amount (Place 0 if warning)',
    required: true,
    min_value: 0,
  }, {
    type: 3,
    name: 'reason',
    description: 'Reason'
  }]
}

const BONUS = {
  name: 'bonus',
  description: 'Add money to a team\'s budget',
  type: 1,
  options: [{
    type: 8,
    name: 'team',
    description: 'Team to receive',
    required: true
  },{
    type: 4,
    name: 'amount',
    description: 'Amount (Place 0 for message only)',
    required: true,
    min_value: 0,
  }, {
    type: 3,
    name: 'reason',
    description: 'Reason'
  }]
}

export const emojisCmd = {
  name: 'emojis',
  description: 'List all the emojis',
  type: 1
}

const ALL_COMMANDS = [nowCmd, timestampCmd, helpCmd];

const GUILD_COMMANDS = [
  playerCmd,
  confirmCmd, updateConfirmCmd, renewCmd, dealCmd, loanCmd, releaseCmd, 
  transferCmd, teamTransferCmd, FREEPLAYER, FINE, BONUS, addUniqueIdCmd,
  emojiCmd, showBlacklistCmd, showNoContractsCmd,
  disbandTeamCmd, expireContractsCmd, addSteamIdCmd, setRatingCmd, setNameCmd,
  getCurrentSeasonPhaseCmd, progressCurrentSeasonPhaseCmd, testDMMatchCmd, moveMatchCmd, listMovesCmd,
  systemTeamCmd, postTeamCmd, postAllTeamsCmd, setContractCmd, updateTeamPostCmd, blacklistTeamCmd, showExpiringContractsCmd, expireThingsCmd,
  manualDoubleSteamCmd, arrangeDayScheduleCmd, managerContractsCmd, fixNamesCmd,
]

const {globalCommands, psafCommands, wcCommands} = mapToCmd(commandsRegister())

const WC_GUILD_COMMANDS = []
const allCommands = [...ALL_COMMANDS, ...globalCommands]
console.log(Object.fromEntries(allCommands.map((cmd,index) => [index, cmd.name])))
InstallGlobalCommands(process.env.APP_ID, allCommands);
const guildCommands = [...GUILD_COMMANDS, ...psafCommands]
console.log(Object.fromEntries(guildCommands.map((cmd,index) => [index, cmd.name])))
InstallGuildCommands(process.env.APP_ID, process.env.GUILD_ID, guildCommands)
const wcGuildCommands = [...WC_GUILD_COMMANDS, ...wcCommands]
InstallGuildCommands(process.env.APP_ID, process.env.WC_GUILD_ID, wcGuildCommands)