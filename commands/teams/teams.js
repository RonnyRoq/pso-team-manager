import { displayTeam, waitingMsg } from "../../functions/helpers.js";


export const teams = async ({interaction_id, token, applicationId, dbClient}) => {
  await waitingMsg({interaction_id, token})
  
  const teamsResponse = await dbClient(async ({teams})=>{
    const activeTeams = await teams.find({active: true}).toArray()
    
    let currentResponse = ''
    const allTeams = teams.find(query)
    let i=0
    for await (const team of allTeams) {
      if(i>3) {
        teamsResponse.push(currentResponse)
        i=0
        currentResponse =''
      }
      currentResponse += displayTeam(team) + '\r'
      i++
    }
  })
  const teamsEmbed = teamsResponse.map(teamResponse => ({
    "type": "rich",
    "color": 16777215,
    "title": "PSAF Teams",
    "description": teamResponse,
  }))
  teamsEmbed.forEach(async (teamEmbed) => {
    await DiscordRequest(`/channels/${channel_id}/messages`, {
      method: 'POST',
      body: {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        embeds : [teamEmbed],
      }
    })
    await sleep(500)
  })
  return 
}