import { InteractionResponseType } from "discord-interactions"
import { DiscordRequest } from "../utils.js"
import { displayTeam } from "../functions/helpers.js"

export const team = async ({interaction_id, token, options, member, dbClient})=> {
  let response = "No teams found"
  const [role] = options || []
  let roles = []
  if(!role) {
    roles = member.roles.map(role=>({id:role}))
  } else {
    roles = [{id: role.value}]
  }
  await dbClient(async ({teams})=>{            
    const team = await teams.findOne({active:true, $or:roles})
    response = displayTeam(team)
  })

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
}


export const teamCmd = {
  name: 'team',
  description: 'List team details',
  type: 1,
  options: [{
    type: 8,
    name: 'team',
    description: 'Team'
  }]
}
