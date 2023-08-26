import 'dotenv/config';
import { InstallGlobalCommands } from './utils.js';

// Simple test command
const TEST_COMMAND = {
  name: 'test',
  description: 'Basic command',
  type: 1,
};

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

const ROLES = {
  name: 'roles',
  description: 'List all the roles',
  type: 1
}

const PLAYERS = {
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

const ALL_COMMANDS = [NOW, ROLES, PLAYERS, TIMESTAMP];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
