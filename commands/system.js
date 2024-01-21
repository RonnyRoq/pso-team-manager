import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { DiscordRequest } from "../utils.js"
import { countries } from '../config/countriesConfig.js'
import { getAllPlayers } from "../functions/playersCache.js"
import { optionsToObject, updateResponse, waitingMsg } from "../functions/helpers.js"
import { serverRoles } from "../config/psafServerConfig.js"

const matchBlacklistRole = '1095055617703543025'

export const systemTeam = async ({interaction_id, token, options, guild_id,  dbClient})=> {
  const [role] = options || []
  let response = 'No team found'
  await dbClient(async ({teams})=>{
    const team = await teams.findOne({id: role.value}) || {}
    const rolesResp = await DiscordRequest(`/guilds/${guild_id}/roles`, {})
    const roles = await rolesResp.json()
    const payload = {
      active: team.active || false,
      shortName: team.shortName || "",
      displayName: team.displayName || "",
      budget: team.budget || 5000000,
      city: team.city || ""
    }
    const teamRole = roles.find(({id})=> id === role.value)
    const res = await teams.updateOne({id: role.value}, {$set: {
      ...payload,
      ...teamRole,
    }}, {upsert: true})
    if(res.modifiedCount > 0) {
      response = `${teamRole.name} updated`
    } else {
      response = `${teamRole.name} added`
    }
  
    return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
      method: 'POST',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: response,
          flags: 1 << 6
        }
      }
    })
  })
}

export const doubleContracts = async ({interaction_id, token, application_id, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const content = await dbClient(async({contracts})=> {
    const duplicates = []
    await contracts.aggregate([
      { $match: { 
        endedAt: null
      }},
      { $group: { 
        //_id: { team: "$team", playerId: "$playerId"}, // can be grouped on multiple properties 
        _id: { playerId: "$playerId"}, // can be grouped on multiple properties 
        dups: { "$addToSet": "$_id" }, 
        count: { "$sum": 1 } 
      }},
      { $match: { 
        count: { "$gt": 1 }    // Duplicates considered as count greater than one
      }}
    ],
    {allowDiskUse: true}       // For faster processing if set is larger
    )               // You can display result until this and check duplicates 
    .forEach(function(doc) {
        doc.dups.shift();      // First element skipped for deleting
        doc.dups.forEach( function(dupId){ 
            duplicates.push(dupId);   // Getting all duplicate ids
            }
        )
    })
    
    // If you want to Check all "_id" which you are deleting else print statement not needed
    console.log(JSON.stringify(duplicates))
    return JSON.stringify(duplicates)
    //const response = await contracts.deleteMany({_id:{$in:duplicates}})
    //return response
  })
  await updateResponse({application_id, token, content})
}

/*export const doubleContracts = async ({interaction_id, token, application_id, dbClient}) => {
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })

  const response = await dbClient(async ({contracts})=> {
    const allActiveContracts = await contracts.find({endedAt: null}).toArray()
    const contractsPerPlayer = allActiveContracts.reduce((playerContracts={}, currentContract)=> {
      console.log(playerContracts)
      console.log(currentContract)
      const currentPlayerContracts = playerContracts[currentContract.playerId] || []
      console.log(currentPlayerContracts)
      playerContracts[currentContract.playerId] = [...currentPlayerContracts, currentContract]
      return playerContracts
    }, [])
    const extra = contractsPerPlayer.filter(playerContracts => playerContracts.length > 1)
    return 'Players with double contracts: \r' + extra.map((playerContracts) => `<@${playerContracts[0].id}> - ${playerContracts.map(contract=> `<@&${contract.team}>`).join(' ')}`).join('\r')+'__'
  })

  return DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      content: response.substring(0, 1999),
      flags: 1 << 6
    }
  })
}*/

export const blacklistTeam = async ({interaction_id, application_id, token, guild_id, member, options, dbClient}) => {
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })
  if(!member.roles.includes(serverRoles.presidentRole)) {
    return updateResponse({application_id, token, content: 'This command is only available to presidents.'})
  }
  const {team} = optionsToObject(options)
  await dbClient(({teams})=> 
    teams.updateOne({id:team}, {$set: {disqualified: true}})
  )
  const allPlayers = await getAllPlayers(guild_id)
  const teamPlayers = allPlayers.filter(({roles})=> roles.includes(team))
  await Promise.all(teamPlayers.map(({user, roles}) => (
    DiscordRequest(`guilds/${guild_id}/members/${user.id}`, {
      method: 'PATCH',
      body: {
        roles: [...new Set([...roles, matchBlacklistRole])]
      }
    })
  )))
  return await DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      content: 'Done',
      flags: 1 << 6
    }
  })
}

export const emoji = async({interaction_id, token, guild_id, options}) => {
  const {emoji} = optionsToObject(options)
  const emojisResp = await DiscordRequest(`/guilds/${guild_id}/emojis`, { method: 'GET' })
  const emojis = await emojisResp.json()
  const emojiObj = emojis.find(({name})=> emoji.includes(name))
  return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `Name: ${emojiObj.name} Id: ${emojiObj.id}`,
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })
}

export const initCountries = async ({interaction_id, token, dbClient}) => {
  return await dbClient(async ({nationalities})=> {
    console.log(countries)
    countries.forEach(async({name,flag})=> {
      await nationalities.updateOne({name}, {$set: {name, flag}}, {upsert: true})
    })
    const natCount = await nationalities.countDocuments({})
    return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
      method: 'POST',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `${natCount} nationalities updated`,
          flags: 1 << 6
        }
      }
    })
  })
};

export const systemTeamCmd = {
  name: 'systemteam',
  description: 'Update the team with the details from discord',
  type: 1,
  options: [{
    type: 8,
    name: 'team',
    description: 'Team',
    required: true
  }]
}

export const initCountriesCmd = {
  name: 'initcountries',
  description: 'Save all the nationalities in DB',
  type: 1
}
export const doubleContractsCmd = {
  name: 'doublecontracts',
  description: 'Show players having more than 1 active contract',
  type: 1
}

export const blacklistTeamCmd = {
  name: 'blacklistteam',
  description: 'Blacklist all a team\'s member list due to multiple FFs',
  type: 1,
  options: [{
    type: 8,
    name: 'team',
    description: 'Team',
    required: true
  }]
}

export const emojiCmd = {
  name: 'emoji',
  description: 'Find details for one emoji',
  type: 1,
  options: [{
    type: 3,
    name: 'emoji',
    description: 'The Emoji you\'re looking for',
    required: true,
  }]
}