import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { DiscordRequest } from "../utils.js"
import { optionsToObject, silentResponse, updateResponse, waitingMsg } from "../functions/helpers.js"
import { serverRoles } from "../config/psafServerConfig.js"

const logWebhook = process.env.WEBHOOK

// Command handlers
const transferList = async ({ options, guild_id, interaction_id, token, dbClient, callerId, member, application_id }) => {
    await waitingMsg({interaction_id, token})
    const { player, hours, positions, buyout, extra_info } = optionsToObject(options)

    const {content, ephemeral} = await dbClient(async ({ transferList, teams }) => {
        // Check if the caller is a manager
        if (!member.roles.includes(serverRoles.clubManagerRole)) {
            return {content: "Only managers can list players for transfer.", ephemeral: true}
        }

        // Check if the caller is in the same team as the player
        const callerTeam = await teams.findOne({ managerIds: callerId })
        if (!callerTeam) {
            return {content: "You must be a manager of a team to list players for transfer.", ephemeral: true}
        }

        // Check if the player is in the caller's team
        const playerInTeam = await teams.findOne({ id: callerTeam.id, playerIds: player })
        if (!playerInTeam) {
            return {content: "You can only list players from your own team.", ephemeral: true}
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
        )

        const content = `Player <@${player}> has been listed for transfer.`
        await DiscordRequest(logWebhook, {
            method: 'POST',
            body: { content }
        })
        return {content, ephemeral: false}
    })

    return DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
        method: 'PATCH',
        body: {
            content,
            flags: ephemeral ? InteractionResponseFlags.EPHEMERAL : undefined
        }
    })
}

const unlist = async ({ options, interaction_id, token, dbClient, callerId, member, application_id }) => {
    await waitingMsg({interaction_id, token})
    const { player } = optionsToObject(options)

    const {content, ephemeral} = await dbClient(async ({ transferList, teams }) => {
        // Check if the caller is a manager
        if (!member.roles.includes(serverRoles.clubManagerRole)) {
            return {content: "Only managers can unlist players.", ephemeral: true}
        }

        // Check if the caller is in the same team as the player
        const callerTeam = await teams.findOne({ managerIds: callerId })
        if (!callerTeam) {
            return {content: "You must be a manager of a team to unlist players.", ephemeral: true}
        }

        // Remove the player from the transfer list
        const result = await transferList.deleteOne({ playerId: player, teamId: callerTeam.id })

        if (result.deletedCount === 0) {
            return {content: "Player not found in your team's transfer list.", ephemeral: true}
        }

        const content = `Player <@${player}> has been removed from the transfer list.`
        await DiscordRequest(logWebhook, {
            method: 'POST',
            body: { content }
        })
        return {content, ephemeral: false}
    })

    return DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
        method: 'PATCH',
        body: {
            content,
            flags: ephemeral ? InteractionResponseFlags.EPHEMERAL : undefined
        }
    })
}

const lft = async ({ options, interaction_id, token, dbClient, callerId, application_id }) => {
    await waitingMsg({interaction_id, token})
    const { hours, positions, extra_info } = optionsToObject(options)

    const {content, ephemeral} = await dbClient(async ({ lft }) => {
        // Check if the player is already in the LFT list
        const existingEntry = await lft.findOne({ playerId: callerId })

        if (existingEntry) {
            // Remove the existing entry
            await lft.deleteOne({ playerId: callerId })

            // Add the new entry
            await lft.insertOne({
                playerId: callerId,
                hours,
                positions,
                extra_info: extra_info || "",
                listedAt: new Date()
            })

            return {content: "Your LFT entry has been updated.", ephemeral: false}
        } else {
            // Add the new entry
            await lft.insertOne({
                playerId: callerId,
                hours,
                positions,
                extra_info: extra_info || "",
                listedAt: new Date()
            })

            return {content: "You have been listed as looking for team (LFT).", ephemeral: false}
        }
    })

    await DiscordRequest(logWebhook, {
        method: 'POST',
        body: { content }
    })

    return DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
        method: 'PATCH',
        body: {
            content,
            flags: ephemeral ? InteractionResponseFlags.EPHEMERAL : undefined
        }
    })
}
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
    description: 'List a player for transfer (managers only)',
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
        description: 'Buyout price in millions (must be honored if offered)',
        required: true,
        min_value: 0
    }, {
        type: 3,
        name: 'extra_info',
        description: 'Additional information about the player',
        required: false
    }],
    func: transferList
}

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
}

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
}

export default [transferListCmd, unlistCmd, lftCmd]