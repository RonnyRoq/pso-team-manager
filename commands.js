import 'dotenv/config';
import { InstallGlobalCommands } from './utils.js';

const NOW = {
  name: 'now',
  description: 'Gives the current time as a timestamp',
  type: 1
}

const TIMESTAMP = {
  name: 'timestamp',
  description: 'Send a date, get the timestamp',
  type: 1,
  options: [{
    type: 3,
    name: 'date',
    description: "The date you'd like to convert to a timestamp",
    required: true
  }, {
    type: 4,
    name: 'timezone',
    description: "Which timezone to apply",
    choices: [{
      name: "UK",
      value: "0"
    }, {
      name: "Central Europe",
      value: "1"
    }, {
      name: "Turkey",
      value: "2"
    }]
  }]
}

const TEAM =  {
  name: 'team',
  description: 'List team details',
  type: 1,
  options: [{
    type: 8,
    name: 'team',
    description: 'Team'
  }]
}


const TEAMS = {
  name: 'teams',
  description: 'List team details',
  type: 1,
}

const PLAYERS = {
  name: 'players',
  description: 'List players for this team',
  type: 1,
  options: [{
    type: 8,
    name: 'team',
    description: 'Team'
  }]
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

const LINEUP = {
  name: 'lineup',
  description: 'Create a lineup for your team',
  type: 1,
  options: [{
    type: 6,
    name: 'gk',
    description: 'GK',
    required: true
  },{
    type: 6,
    name: 'lb',
    description: 'LB',
    required: true
  },{
    type: 6,
    name: 'rb',
    description: 'RB',
    required: true
  },{
    type: 6,
    name: 'cm',
    description: 'CM',
    required: true
  },{
    type: 6,
    name: 'lw',
    description: 'LW',
    required: true
  },{
    type: 6,
    name: 'rw',
    description: 'RW',
    required: true
  },{
    type: 6,
    name: 'sub1',
    description: 'Sub1'
  },{
    type: 6,
    name: 'sub2',
    description: 'Sub2'
  },{
    type: 6,
    name: 'sub3',
    description: 'Sub3'
  },{
    type: 6,
    name: 'sub4',
    description: 'Sub4'
  },{
    type: 6,
    name: 'sub5',
    description: 'Sub5'
  }, {
    type: 3,
    name: 'vs',
    description: 'Against'
  }]
}
const BOXLINEUP = {...LINEUP, name: 'boxlineup'}

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

const HELP = {
  name: 'help',
  description: 'List all the commands you can use for this bot',
  type: 1
}

const ALL_COMMANDS = [NOW, TEAM, TEAMS, PLAYERS, TRANSFER, TEAMTRANSFER, FREEPLAYER, LINEUP, BOXLINEUP, FINE, BONUS, TIMESTAMP, HELP];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
