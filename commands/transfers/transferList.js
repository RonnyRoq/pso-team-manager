import { optionsToObject, updateResponse, waitingMsg, postMessage } from "../../functions/helpers.js";
import { serverRoles } from "../../config/psafServerConfig.js";
import { getAllPlayers } from "../../functions/playersCache.js";
import { serverChannels } from "../../config/psafServerConfig.js";

// Command handlers
const transferList = async ({ options, interaction_id, application_id, token, dbClient, guild_id, member }) => {
    await waitingMsg({ interaction_id, token });
    const { player, hours, positions, buyout, extra_info } = optionsToObject(options);

    const content = await dbClient(async ({ transferList, teams }) => {
        // Check if the caller is a manager
        if (!member.roles.includes(serverRoles.clubManagerRole)) {
            return "Only managers can list players for transfer.";
        }

        // Find the caller's team based on roles
        const roles = member.roles.map(roleId => ({ id: roleId }));
        const callerTeam = await teams.findOne({ active: true, $or: roles });
        if (!callerTeam) {
            return "You must be a manager of a team to list players for transfer.";
        }

        // Check if the player is in the caller's team
        const totalPlayers = await getAllPlayers(guild_id) 
        const discPlayer = totalPlayers.find(currentPlayer => currentPlayer ?.user?.id === player)
        const playerInTeam = discPlayer?.roles.includes(callerTeam.id)
        if (!playerInTeam) {
            return "You can only list players from your own team.";
        }

        // Add or update the player in the transfer list
        await transferList.updateOne(
            { playerId: player },
            {
                $set: {
                    teamId: callerTeam.id,
                    hours,
                    positions,
                    buyout,
                    extra_info: extra_info || "",
                    listedAt: new Date()
                }
            },
            { upsert: true }
        );

        const content = `Player <@${player}> has been listed for transfer.\r${hours} hours\r${extra_info}${buyout ? `\rBuyout at ${buyout}Ebits`: ''}`;
        await postMessage({ content, channel_id: serverChannels.lookingForTeamChannelId });
        return content;
    });

    return updateResponse({ application_id, token, content });
};

const unlist = async ({ options, interaction_id, application_id, token, dbClient, member }) => {
    await waitingMsg({ interaction_id, token });
    const { player } = optionsToObject(options);

    const content = await dbClient(async ({ transferList, teams }) => {
        // Check if the caller is a manager
        if (!member.roles.includes(serverRoles.clubManagerRole)) {
            return "Only managers can unlist players.";
        }

        // Find the caller's team based on roles
        const roles = member.roles.map(roleId => ({ id: roleId }));
        const callerTeam = await teams.findOne({ active: true, $or: roles });
        if (!callerTeam) {
            return "You must be a manager of a team to unlist players.";
        }

        // Remove the player from the transfer list
        const result = await transferList.deleteOne({ playerId: player, teamId: callerTeam.id });

        if (result.deletedCount === 0) {
            return "Player not found in your team's transfer list.";
        }

        const content = `Player <@${player}> has been removed from the transfer list.`;
        await postMessage({ channel_id: serverChannels.lookingForTeamChannelId, content });
        return content;
    });

    return updateResponse({ application_id, token, content });
};

const lft = async ({ options, interaction_id, application_id, token, dbClient, callerId }) => {
    await waitingMsg({ interaction_id, token });
    const { hours, positions, extra_info } = optionsToObject(options);

    const message = await dbClient(async ({ lft }) => {
        // Check if the player is already in the LFT list
        const existingEntry = await lft.findOne({ playerId: callerId });

        // Remove the existing entry if it exists
        if (existingEntry) {
            await lft.deleteOne({ playerId: callerId });
        }

        // Add the new entry
        await lft.insertOne({
            playerId: callerId,
            hours,
            positions,
            extra_info: extra_info || "",
            listedAt: new Date()
        });

        const message = existingEntry ? "Your LFT entry has been updated." : "You have been listed as looking for team (LFT).";
        return message;
    });

    const content = [`<@${callerId}>`,`${hours} hours`,positions, extra_info || ''].join('\r')
    await postMessage({ content, channel_id: serverChannels.lookingForTeamChannelId });
    return updateResponse({ application_id, token, content: message });
};

// API route functions
export const getLft = async ({ position, minHours, dbClient }) => {
    return dbClient(async ({ lft }) => {
        let query = {};

        if (position) {
            query.positions = position;
        }

        if (minHours) {
            query.hours = { $gte: parseInt(minHours) };
        }

        return lft.find(query).toArray();
    });
};

export const getTransferList = async ({ position, maxBuyout, dbClient }) => {
    return dbClient(async ({ transferList }) => {
        let query = {};

        if (position) {
            query.positions = position;
        }

        if (maxBuyout) {
            query.buyout = { $lte: parseFloat(maxBuyout) };
        }

        return transferList.find(query).toArray();
    });
};

// Command definitions
export const transferListCmd = {
    name: 'transferlist',
    description: 'List a player for transfer',
    type: 1,
    psaf: true,
    options: [{
        type: 6,
        name: 'player',
        description: 'Player to list',
        required: true
    }, {
        type: 4,
        name: 'hours',
        description: 'Amount of hours in PSO across all accounts',
        required: true,
        min_value: 0,
        max_value: 10000
    }, {
        type: 3,
        name: 'positions',
        description: 'Positions player can play',
        required: true,
        choices: [
            { name: 'GK', value: 'GK' },
            { name: 'LB', value: 'LB' },
            { name: 'CB', value: 'CB' },
            { name: 'RB', value: 'RB' },
            { name: 'CM', value: 'CM' },
            { name: 'LW', value: 'LW' },
            { name: 'RW', value: 'RW' },
            { name: 'ST', value: 'ST' }
        ]
    }, {
        type: 10,
        name: 'buyout',
        description: 'Buyout price (must be honored if offered)',
        required: true,
        min_value: 0,
        max_value: 1000000000
    }, {
        type: 3,
        name: 'extra_info',
        description: 'Additional information about the player',
        required: false
    }],
    func: transferList
};

export const unlistCmd = {
    name: 'unlist',
    description: 'Remove a player from the transfer list (managers only)',
    type: 1,
    psaf: true,
    options: [{
        type: 6,
        name: 'player',
        description: 'Player to unlist',
        required: true
    }],
    func: unlist
};

export const lftCmd = {
    name: 'lft',
    description: 'List yourself as looking for team',
    type: 1,
    psaf: true,
    options: [{
        type: 4,
        name: 'hours',
        description: 'Amount of hours in PSO across all accounts',
        required: true,
        min_value: 0,
        max_value: 10000
    }, {
        type: 3,
        name: 'positions',
        description: 'Positions you can play',
        required: true,
        choices: [
            { name: 'GK', value: 'GK' },
            { name: 'LB', value: 'LB' },
            { name: 'CB', value: 'CB' },
            { name: 'RB', value: 'RB' },
            { name: 'CM', value: 'CM' },
            { name: 'LW', value: 'LW' },
            { name: 'RW', value: 'RW' },
            { name: 'ST', value: 'ST' }
        ]
    }, {
        type: 3,
        name: 'extra_info',
        description: 'Additional information (e.g., "only looking for Div 1 teams")',
        required: false
    }],
    func: lft
};

export default [transferListCmd, unlistCmd, lftCmd];
