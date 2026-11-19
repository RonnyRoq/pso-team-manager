import 'dotenv/config';
import { InstallGlobalCommands, InstallGuildCommands } from './utils.js';
import { getCommandLists } from './commandLists.js';

const {globalCommands: allCommands, guildCommands, wcGuildCommands} = getCommandLists()

console.log(Object.fromEntries(allCommands.map((cmd,index) => [index, `${cmd.name}${cmd.options ? ' - '+cmd.options.map(opt => opt.name).join(' ') : ''}`])))
InstallGlobalCommands(process.env.APP_ID, allCommands);
console.log(Object.fromEntries(guildCommands.map((cmd,index) => [index, `${cmd.name}${cmd.options ? ' - '+cmd.options.map(opt => opt.name).join(' ') : ''}`])))
InstallGuildCommands(process.env.APP_ID, process.env.GUILD_ID, guildCommands)
InstallGuildCommands(process.env.APP_ID, process.env.WC_GUILD_ID, wcGuildCommands)
