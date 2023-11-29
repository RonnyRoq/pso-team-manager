import { updateResponse, waitingMsg } from "../../functions/helpers.js"

export const voteAction = async ({dbClient, interaction_id, application_id, token, custom_id, callerId }) => {
  await waitingMsg({interaction_id, token})
  const [,coachVote] = custom_id.split('_')
  await dbClient(async({votes, players})=> {
    const dbPlayer = await players.findOne({id: callerId})
    await votes.updateOne({playerId: dbPlayer.id}, {$set: {playerId:dbPlayer.id, nation: dbPlayer.nat1, coachVote}}, {upsert: true})
  })
  await updateResponse({application_id, token, content:'Vote saved'})
}