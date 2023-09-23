import 'dotenv/config';
import { InstallGlobalCommands } from './utils.js';
import { nowCmd } from './commands/now.js';
import { timestampCmd } from './commands/timestamp.js';
import { helpCmd } from './commands/help.js';
import { boxLineupcmd, lineupCmd } from './commands/lineup.js';
import { teamCmd } from './commands/team.js';
import { editMatchCmd, endMatchCmd, matchCmd, matchIdCmd, matchesCmd, publishMatchCmd } from './commands/match.js';
import { initCountriesCmd, systemTeamCmd } from './commands/system.js';
import { editTeamCmd } from './commands/editTeam.js';
import { allPlayersCmd, editPlayerCmd, playerCmd, playersCmd } from './commands/player.js';

const TEAMS = {
  name: 'teams',
  description: 'List team details',
  type: 1,
}

const TRANSFER = {
  name: 'transfer',
  description: 'Transfer a free agent to a team',
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
  },{
    type: 3,
    name: 'desc',
    description: 'Description (length)'
  }]
}
const TEAMTRANSFER = {
  name: 'teamtransfer',
  description: 'Transfer a player from his team to another',
  type: 1,
  options: [{
    type: 6,
    name: 'player',
    description: 'Player',
    required: true
  },{
    type: 8,
    name: 'team',
    description: 'Team to transfer',
    required: true
  },{
    type: 4,
    name: 'amount',
    description: 'Amount (Place 0 if free)',
    required: true,
    min_value: 0,
  },{
    type: 3,
    name: 'desc',
    description: 'Description (length, loan...)'
  }]
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

const ALL_COMMANDS = [nowCmd, timestampCmd, teamCmd, emojisCmd, matchCmd, editMatchCmd, endMatchCmd, publishMatchCmd, matchIdCmd, matchesCmd,
  playerCmd, editPlayerCmd, allPlayersCmd, playersCmd,
  TEAMS, TRANSFER, TEAMTRANSFER, FREEPLAYER, lineupCmd, boxLineupcmd, FINE, BONUS, editTeamCmd, helpCmd,
  systemTeamCmd, initCountriesCmd,
];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
