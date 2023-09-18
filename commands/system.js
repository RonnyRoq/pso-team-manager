import { InteractionResponseType } from "discord-interactions"
import { DiscordRequest } from "../utils.js"
import { countries } from '../config/countriesConfig.js'

export const systemTeam = async ({interaction_id, token, options, guild_id, member, dbClient})=> {
  const [role] = options || []
  let response = 'No team found'
  await dbClient(async ({teams})=>{
    const team = await teams.findOne({active:true, id: role.value})
    if(team) {
      const rolesResp = await DiscordRequest(`/guilds/${guild_id}/roles`, {})
      const roles = await rolesResp.json()
      const teamRole = roles.find(({id})=> id === role.value)
      await teams.updateOne({id: role.value}, {$set: teamRole})
      response = `${teamRole.name} updated`
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

export const initCountries = async ({interaction_id, token, dbClient}) => {
  return dbClient(async ({nationalities})=> {
    console.log(countries)
    countries.forEach(async({name,flag})=> {
      console.log(name)
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