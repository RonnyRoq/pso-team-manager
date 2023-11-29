import 'dotenv/config';
import { InstallGlobalCommands, InstallGuildCommands } from './utils.js';
import { nowCmd } from './commands/now.js';
import { timestampCmd } from './commands/timestamp.js';
import { helpAdminCmd, helpCmd } from './commands/help.js';
import { boxLineupcmd, eightLineupCmd, internationalLineupCmd, lineupCmd } from './commands/lineup.js';
import { teamCmd } from './commands/team.js';
import { editInternationalMatchCmd, editMatchCmd, endMatchCmd, internationalMatchCmd, matchCmd, matchIdCmd, matchesCmd, pastMatchesCmd, publishMatchCmd } from './commands/match.js';
import { blacklistTeamCmd, doubleContractsCmd, emojiCmd, initCountriesCmd, systemTeamCmd } from './commands/system.js';
import { activateTeamCmd, editTeamCmd } from './commands/editTeams.js';
import { allPlayersCmd, editPlayerCmd, myPlayerCmd, playerCmd, playersCmd } from './commands/player.js';
import { addSelectionCmd, allNationalTeamsCmd, nationalTeamCmd, postNationalTeamsCmd, registerElectionsCmd, removeSelectionCmd, showElectionCandidatesCmd, showVotesCmd, voteCoachCmd } from './commands/nationalTeam.js';
import { confirmCmd, updateConfirmCmd } from './commands/confirm.js';
import { dealCmd, loanCmd } from './commands/confirmations/deal.js';
import { listDealsCmd } from './commands/confirmations/listDeals.js';
import { renewCmd, setContractCmd, teamTransferCmd, transferCmd } from './commands/transfers.js';
import { postAllTeamsCmd, postTeamCmd, updateTeamPostCmd } from './commands/postTeam.js';
import { showBlacklistCmd } from './commands/blacklist.js';
import { expireContractsCmd, showExpiringContractsCmd, showNoContractsCmd } from './commands/contracts.js';
import { disbandTeamCmd } from './commands/disbandTeam.js';
import { getCurrentSeasonPhaseCmd, progressCurrentSeasonPhaseCmd } from './commands/season.js';
import { testDMMatchCmd } from './commands/matches/notifyMatchStart.js';

const TEAMS = {
  name: 'teams',
  description: 'List team details',
  type: 1,
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

const ALL_COMMANDS = [nowCmd, timestampCmd, lineupCmd, boxLineupcmd, eightLineupCmd, helpCmd];

const GUILD_COMMANDS = [
  teamCmd, emojisCmd, matchCmd, editMatchCmd, endMatchCmd, publishMatchCmd, matchIdCmd, matchesCmd, internationalMatchCmd, editInternationalMatchCmd,
  playerCmd, editPlayerCmd, allPlayersCmd, playersCmd, myPlayerCmd,
  confirmCmd, updateConfirmCmd, renewCmd, dealCmd, activateTeamCmd, listDealsCmd, loanCmd,
  nationalTeamCmd, allNationalTeamsCmd, postNationalTeamsCmd, addSelectionCmd, removeSelectionCmd,
  TEAMS, transferCmd, teamTransferCmd, FREEPLAYER, FINE, BONUS, editTeamCmd,
  internationalLineupCmd, helpAdminCmd, emojiCmd, showBlacklistCmd, showNoContractsCmd, registerElectionsCmd, showElectionCandidatesCmd, voteCoachCmd, showVotesCmd,
  disbandTeamCmd, expireContractsCmd,
  getCurrentSeasonPhaseCmd, progressCurrentSeasonPhaseCmd, testDMMatchCmd, pastMatchesCmd,
  systemTeamCmd, initCountriesCmd, postTeamCmd, postAllTeamsCmd, setContractCmd, updateTeamPostCmd, doubleContractsCmd, blacklistTeamCmd, showExpiringContractsCmd,
]

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
InstallGuildCommands(process.env.APP_ID, process.env.GUILD_ID, GUILD_COMMANDS)