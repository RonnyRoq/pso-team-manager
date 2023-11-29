import { updateResponse, waitingMsg } from "../../functions/helpers.js"

export const setAllMatchToSeason = async ({application_id, interaction_id, token, dbClient}) => {
  await waitingMsg({interaction_id, token})
  await dbClient(async({matches})=> {
    await matches.updateMany({}, {$set: {season: 3}})
  })
  await updateResponse({application_id, token, content: 'done'})
}

export const setAllMatchToSeasonCmd = {
  name: 'setallmatchseasons',
  description: 'debug command dont use',
  type: 1
}