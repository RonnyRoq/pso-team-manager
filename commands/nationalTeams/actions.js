import { updateResponse, waitingMsg } from "../../functions/helpers.js"

export const voteAction = async ({dbClient, interaction_id, application_id, token, custom_id, callerId }) => {
  await waitingMsg({interaction_id, token})
  const [,coachVote] = custom_id.split('_')
  const content = await dbClient(async({votes, players, nationalTeams})=> {
    const dbPlayer = await players.findOne({id: callerId})
    const selection = await nationalTeams.findOne({eligibleNationalities: dbPlayer.nat1, active: true})
    if(!selection) {
      return `Can't find an active selection for ${dbPlayer.nat1}`
    }
    await votes.updateOne({playerId: dbPlayer.id}, {$set: {playerId:dbPlayer.id, nation: selection.shortname, coachVote, votingTime: Date.now()}}, {upsert: true})
    return `Your vote has been saved for <@${coachVote}> - ${selection.name}`
  })
  await updateResponse({application_id, token, content})
}