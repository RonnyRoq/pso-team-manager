import { serverChannels } from "../../config/psafServerConfig.js"
import { getPlayerNick, postMessage } from "../../functions/helpers.js"
import { getAllPlayers } from "../../functions/playersCache.js"
import { DiscordRequest } from "../../utils.js"

export const patchTeam = async ({dbClient, id, payload, userId}) => {
  return dbClient(async ({teams})=>{
    const team = await teams.findOne({id})
    if(!team) {
      console.log(id, team)
      return {error:`Cannot find team ${id}`}
    }

    const name = (team.name !== payload.name) ? `${team.name} -> ${payload.name}` : team.name
    await teams.updateOne({id}, {$set: payload})
    if(name !== team.name){
      const teamChannelResp = await DiscordRequest(`/channels/${team.channel}`)
      const teamChannel = await teamChannelResp.json()
      let channelName = teamChannel.name
      console.log(teamChannel.name)
      console.log(channelName.substring(0, 2))
      channelName = channelName.substring(0, 2) + payload.name.toLowerCase().replaceAll(' ', '-').substring(0, 80)
      console.log('update channel', channelName)
      await DiscordRequest(`/channels/${team.channel}`, {method:'PATCH', body:{name: channelName}})
      await DiscordRequest(`/guilds/${process.env.GUILD_ID}/roles/${team.id}`, {method: 'PATCH', body:{name: payload.name}})
    }
    await postMessage({channel_id: serverChannels.botActivityLogsChannelId, content: `Team ${name} updated by <@${userId}>. \rPayload: \r${JSON.stringify(payload, undefined, 2)}`})
    if(team.shortName !== payload.shortName){
      console.log('Updating players')
      const allPlayers = await getAllPlayers(process.env.GUILD_ID)
      const teamPlayers = allPlayers.filter(player=> getPlayerNick(player).startsWith(`${team.shortName} | `))
      await Promise.all(teamPlayers.map(player=> {
        const nick = getPlayerNick(player).replace(`${team.shortName} | `, `${payload.shortName} | `)
        return DiscordRequest(`/guilds/${process.env.GUILD_ID}/members/${player.user.id}`, {method: 'PATCH', body: {nick}})
      }))
      await postMessage({channel_id: serverChannels.botActivityLogsChannelId, content: `Short name ${team.shortName} changed to ${payload.shortName}. \r${teamPlayers.length} players names updated.`})
    }
    return team
  })
}
