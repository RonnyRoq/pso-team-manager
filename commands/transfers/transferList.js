import { optionsToObject, updateResponse, waitingMsg, postMessage } from "../../functions/helpers.js";
import { serverRoles, serverChannels } from "../../config/psafServerConfig.js";
import { getAllPlayers } from "../../functions/playersCache.js";

const transferList = async ({ options, interaction_id, application_id, token, dbClient, guild_id, member }) => {
    await waitingMsg({ interaction_id, token });
    const { player, hours, positions, buyout, extra_info } = optionsToObject(options);

    const content = await dbClient(async ({ transferList: transferListCollection, teams }) => {
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

        const totalPlayers = await getAllPlayers(guild_id);
        const discPlayer = totalPlayers.find(currentPlayer => currentPlayer?.user?.id === player);
        const playerInTeam = discPlayer?.roles.includes(callerTeam.id);
        if (!playerInTeam) {
            return "You can only list players from your own team.";
        }

        // Split positions by commas and trim whitespace
        const positionsArray = positions.split(',').map(pos => pos.trim().toUpperCase()).filter(Boolean);

        const validPositions = ['GK', 'LB', 'CB', 'RB', 'LCM', 'CM', 'RCM', 'LW', 'RW','LST', 'ST', 'RST'];
        const invalidPositions = positionsArray.filter(pos => !validPositions.includes(pos));
        if (invalidPositions.length > 0) {
            return `Invalid positions: ${invalidPositions.join(', ')}. Valid positions are: ${validPositions.join(', ')}.`;
        }

        await transferListCollection.updateOne(
            { playerId: player },
            {
                $set: {
                    teamId: callerTeam.id,
                    hours,
                    positions: positionsArray,
                    buyout,
                    extra_info: extra_info || "",
                    listedAt: new Date()
                }
            },
            { upsert: true }
        );

        const content = `Player <@${player}> has been listed for transfer.\r${hours} hours\rPositions: ${positionsArray.join(', ')}\r${extra_info ? extra_info + '\r' : ''}${buyout ? `Buyout at ${buyout} Ebits` : ''}`;
        await postMessage({ content, channel_id: serverChannels.lookingForTeamChannelId });
        return content;
    });

    return updateResponse({ application_id, token, content });
};

const unlist = async ({ options, interaction_id, application_id, token, dbClient, member }) => {
    await waitingMsg({ interaction_id, token });
    const { player } = optionsToObject(options);

    const content = await dbClient(async ({ transferList: transferListCollection, teams }) => {
        // Check if the caller is a manager
        if (!member.roles.includes(serverRoles.clubManagerRole)) {
            return "Only managers can unlist players.";
        }

        const roles = member.roles.map(roleId => ({ id: roleId }));
        const callerTeam = await teams.findOne({ active: true, $or: roles });
        if (!callerTeam) {
            return "You must be a manager of a team to unlist players.";
        }

        const result = await transferListCollection.deleteOne({ playerId: player, teamId: callerTeam.id });

        if (result.deletedCount === 0) {
            return "Player not found in your team's transfer list.";
        }

        const content = `Player <@${player}> has been removed from the transfer list.`;
        await postMessage({ channel_id: serverChannels.lookingForTeamChannelId, content });
        return content;
    });

    return updateResponse({ application_id, token, content });
};

const lftAdd = async ({ options, interaction_id, application_id, token, dbClient, callerId }) => {
    await waitingMsg({ interaction_id, token });
    const { hours, positions, extra_info } = optionsToObject(options);

    const message = await dbClient(async ({ lft }) => {
        // Remove existing entry if exists
        await lft.deleteOne({ playerId: callerId });

        const positionsArray = positions.split(',').map(pos => pos.trim().toUpperCase()).filter(Boolean);

        // Validate positions
        const validPositions = ['GK', 'LB', 'CB', 'RB', 'LCM', 'CM', 'RCM', 'LW', 'RW','LST', 'ST', 'RST'];
        const invalidPositions = positionsArray.filter(pos => !validPositions.includes(pos));
        if (invalidPositions.length > 0) {
            return `Invalid positions: ${invalidPositions.join(', ')}. Valid positions are: ${validPositions.join(', ')}.`;
        }

        await lft.insertOne({
            playerId: callerId,
            hours,
            positions: positionsArray,
            extra_info: extra_info || "",
            listedAt: new Date()
        });

        return "You have been listed as looking for team (LFT).";
    });

    const content = [`<@${callerId}>`, `${hours} hours`, `Positions: ${positionsArray.join(', ')}`, extra_info || ''].join('\r');
    await postMessage({ content, channel_id: serverChannels.lookingForTeamChannelId });
    return updateResponse({ application_id, token, content: message });
};

const lftRemove = async ({ interaction_id, application_id, token, dbClient, callerId }) => {
    await waitingMsg({ interaction_id, token });

    const message = await dbClient(async ({ lft }) => {
        const result = await lft.deleteOne({ playerId: callerId });

        if (result.deletedCount === 0) {
            return "You are not currently listed as LFT.";
        }

        return "You have been removed from the LFT list.";
    });

    await postMessage({ content: `<@${callerId}> is no longer looking for a team.`, channel_id: serverChannels.lookingForTeamChannelId });
    return updateResponse({ application_id, token, content: message });
};

export const getLft = async ({ position, minHours, dbClient }) => {
    return dbClient(async ({ lft }) => {
        let query = {};

        if (position) {
            query.positions = position.toUpperCase();
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
            query.positions = position.toUpperCase();
        }

        if (maxBuyout) {
            query.buyout = { $lte: parseFloat(maxBuyout) };
        }

        return transferList.find(query).toArray();
    });
};

export const transferListCmd = {
    name: 'transferlist',
    description: 'List a player for transfer',
    type: 1,
    psaf: true,
    options: [
        {
            type: 6,
            name: 'player',
            description: 'Player to list',
            required: true
        },
        {
            type: 4,
            name: 'hours',
            description: 'Amount of hours in PSO across all accounts',
            required: true,
            min_value: 0,
            max_value: 10000
        },
        {
            type: 3,
            name: 'positions',
            description: 'Positions the player can play (separated by commas)',
            required: true
        },
        {
            type: 10,
            name: 'buyout',
            description: 'Buyout price (must be honored if offered)',
            required: true,
            min_value: 0,
            max_value: 1000000000
        },
        {
            type: 3,
            name: 'extra_info',
            description: 'Additional information about the player',
            required: false
        }
    ],
    func: transferList
};

export const unlistCmd = {
    name: 'unlist',
    description: 'Remove a player from the transfer list (managers only)',
    type: 1,
    psaf: true,
    options: [
        {
            type: 6,
            name: 'player',
            description: 'Player to unlist',
            required: true
        }
    ],
    func: unlist
};

export const lftCmd = {
    name: 'lft',
    description: 'Manage your Looking for Team (LFT) status',
    type: 1,
    psaf: true,
    options: [
        {
            name: 'add',
            type: 1,
            description: 'Add yourself to the LFT list',
            options: [
                {
                    type: 4,
                    name: 'hours',
                    description: 'Amount of hours in PSO across all accounts',
                    required: true,
                    min_value: 0,
                    max_value: 10000
                },
                {
                    type: 3,
                    name: 'positions',
                    description: 'Positions you can play (separated by commas)',
                    required: true
                },
                {
                    type: 3,
                    name: 'extra_info',
                    description: 'Additional information (e.g., "only looking for Div 1 teams")',
                    required: false
                }
            ]
        },
        {
            name: 'remove',
            type: 1,
            description: 'Remove yourself from the LFT list'
        }
    ],
    func: lftHandler
};

const lftHandler = async (params) => {
    const { options } = params;
    const subcommand = options[0].name;

    if (subcommand === 'add') {
        return lftAdd({ ...params, options: options[0].options });
    } else if (subcommand === 'remove') {
        return lftRemove(params);
    }
};

export default [transferListCmd, unlistCmd, lftCmd];
