import { optionsToObject, updateResponse, waitingMsg, postMessage } from "../../functions/helpers.js";
import { serverRoles, serverChannels } from "../../config/psafServerConfig.js";
import { getAllPlayers } from "../../functions/playersCache.js";

// Runs as a cron every day at 3am
export const removeOldEntries = async (dbClient) => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    await dbClient(async ({ lft, transferList }) => {
        const lftResult = await lft.deleteMany({
            $or: [
                { dateTimestamp: { $lt: sevenDaysAgo } },
                { dateTimestamp: { $exists: false } }
            ]
        });
        const transferResult = await transferList.deleteMany({
            $or: [
                { dateTimestamp: { $lt: sevenDaysAgo } },
                { dateTimestamp: { $exists: false } }
            ]
        });
        console.log(`Removed ${lftResult.deletedCount} LFT entries and ${transferResult.deletedCount} transfer list entries.`);
    });
};

const validPositions = ['GK', 'LB', 'LCB', 'CB', 'RCB', 'RB', 'LCM', 'CM', 'RCM', 'LW', 'RW', 'LST', 'ST', 'RST'];
const validatePositions = (positions) => {
    const positionsArray = positions.split(',').map(pos => pos.trim().toUpperCase()).filter(Boolean);
    const uniquePositions = [...new Set(positionsArray)];
    const invalidPositions = uniquePositions.filter(pos => !validPositions.includes(pos));
    return { positionsArray: uniquePositions, invalidPositions };
};
const transferList = async ({ options, interaction_id, application_id, token, dbClient, guild_id, member }) => {
    await waitingMsg({ interaction_id, token });
    const { player, hours, positions, buyout, extra_info } = optionsToObject(options);

    const { positionsArray, invalidPositions } = validatePositions(positions);
    if (invalidPositions.length > 0) {
        const errorMessage = `Invalid positions: ${invalidPositions.join(', ')}. Valid positions are: ${validPositions.join(', ')}.`;
        return updateResponse({ application_id, token, content: errorMessage });
    }

    const content = await dbClient(async ({ transferList: transferListCollection, teams }) => {
        if (!member.roles.includes(serverRoles.clubManagerRole)) {
            return "Only managers can list players for transfer.";
        }

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

        const dateTimestamp = new Date();

        await transferListCollection.updateOne(
            { playerId: player },
            {
                $set: {
                    teamId: callerTeam.id,
                    hours,
                    positions: positionsArray,
                    buyout,
                    extra_info: extra_info || "",
                    listedAt: new Date(),
                    dateTimestamp: dateTimestamp
                }
            },
            { upsert: true }
        );

        const messageContent = `Player <@${player}> has been listed for transfer.\r${hours} hours\rPositions: ${positionsArray.join(', ')}\r${extra_info ? extra_info + '\r' : ''}${buyout ? `Buyout at ${buyout} Ebits` : ''}`;
        await postMessage({ content: messageContent, channel_id: serverChannels.lookingForTeamChannelId });
        return messageContent;
    });

    return updateResponse({ application_id, token, content });
};

const unlist = async ({ options, interaction_id, application_id, token, dbClient, member }) => {
    await waitingMsg({ interaction_id, token });
    const { player } = optionsToObject(options);

    const content = await dbClient(async ({ transferList: transferListCollection, teams }) => {
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

        const messageContent = `Player <@${player}> has been removed from the transfer list.`;
        await postMessage({ channel_id: serverChannels.lookingForTeamChannelId, content: messageContent });
        return messageContent;
    });

    return updateResponse({ application_id, token, content });
};

const lftAdd = async ({ options, interaction_id, application_id, token, dbClient, callerId }) => {
    await waitingMsg({ interaction_id, token });
    const { hours, positions, extra_info } = optionsToObject(options);

    const { positionsArray, invalidPositions } = validatePositions(positions);
    if (invalidPositions.length > 0) {
        const errorMessage = `Invalid positions: ${invalidPositions.join(', ')}. Valid positions are: ${validPositions.join(', ')}.`;
        return updateResponse({ application_id, token, content: errorMessage });
    }

    const message = await dbClient(async ({ lft }) => {
        await lft.deleteOne({ playerId: callerId });

        const dateTimestamp = new Date();

        await lft.insertOne({
            playerId: callerId,
            hours,
            positions: positionsArray,
            extra_info: extra_info || "",
            listedAt: new Date(),
            dateTimestamp: dateTimestamp
        });

        return "You have been listed as looking for team (LFT).";
    });

    const content = [
        `<@${callerId}>`,
        `${hours} hours`,
        `Positions: ${positionsArray.join(', ')}`,
        extra_info || ''
    ].join('\r');
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

        await postMessage({ content: `<@${callerId}> is no longer looking for a team.`, channel_id: serverChannels.lookingForTeamChannelId });
        return "You have been removed from the LFT list.";
    });

    return updateResponse({ application_id, token, content: message });
};

const lftHandler = async (params) => {
    const { options } = params;
    const subcommand = options[0].name;

    if (subcommand === 'add') {
        return lftAdd({ ...params, options: options[0].options });
    } else if (subcommand === 'remove') {
        return lftRemove(params);
    } else {
        return "Invalid subcommand.";
    }
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

export const getLft = async ({ positions, minHours, dbClient }) => {
    return dbClient(async ({ lft }) => {
        let query = {};

        if (positions) {
            const positionsArray = positions.split(',').map(pos => pos.trim().toUpperCase());
            query.positions = { $in: positionsArray };
        }

        if (minHours) {
            query.hours = { $gte: parseInt(minHours) };
        }

        return lft.find(query).toArray();
    });
};

export const getTransferList = async ({ positions, maxBuyout, dbClient }) => {
    return dbClient(async ({ transferList }) => {
        let query = {};

        if (positions) {
            const positionsArray = positions.split(',').map(pos => pos.trim().toUpperCase());
            query.positions = { $in: positionsArray };
        }

        if (maxBuyout) {
            query.buyout = { $lte: parseFloat(maxBuyout) };
        }

        return transferList.find(query).toArray();
    });
};

export default [transferListCmd, unlistCmd, lftCmd];