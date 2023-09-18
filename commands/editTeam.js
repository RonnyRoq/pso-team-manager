
export const editTeam = async ({interaction_id, token, options, member, dbClient}) => {
  let response = "No teams found"
  const {team, palmares, emoji, city, flag, shortname} = Object.fromEntries(options.map(({name, value})=> [name, value]))
  const roles = [{id: team}]
  return dbClient(async ({teams})=>{
    const team = await teams.findOne({active:true, $or:roles})
    const payload = {
      shortName: shortname || team.shortName,
      description: palmares || team.description,
      emoji: emoji || team.emoji,
      city: city || team.city,
      flag: flag || team.flag
    }
    teams.updateOne({id: team.id}, {$set: payload})
    const updatedTeam = await teams.findOne({active:true, id:team.id})
    response = displayTeam(updatedTeam)
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

export const editTeamCmd =  {
  name: 'editteam',
  description: 'Edit team details',
  type: 1,
  options: [{
    type: 8,
    name: 'team',
    description: 'Team',
    required: true
  },{
    type: 3,
    name: 'palmares',
    description: 'palmares'
  },{
    type: 3,
    name: 'emoji',
    description: 'Emoji'
  },{
    type: 3,
    name: 'city',
    description: 'City'
  },{
    type: 3,
    name: 'flag',
    description: 'Flag'
  },{
    type: 3,
    name: 'shortname',
    description: 'Team\'s short name (max 4 chars)'
  }]
}
