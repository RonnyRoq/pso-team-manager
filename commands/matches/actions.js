import { ObjectId } from "mongodb"
import { updateResponse, waitingMsg } from "../../functions/helpers.js"
import { DiscordRequest } from "../../utils.js"

export const refereeMatch = async ({interaction_id, token, custom_id, application_id, message, callerId, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const [,id] = custom_id.split('_')
  const matchId = new ObjectId(id)
  const content = await dbClient(async ({matches})=> {
    const match = await matches.findOne(matchId)
    let refsArray = (match.refs || '').split(',')
    if(refsArray[0] === '') {
      refsArray = []
    }
    let refs = []
    let content = message.content
    let response = ''
    if(refsArray.includes(callerId)) {
      const indexContent = message.content.indexOf(`\r<@${callerId}>`)
      const indexLength = `\r<@${callerId}>`.length
      refs = refsArray.filter(id=> id!== callerId)
      content = message.content.substring(0, indexContent) + message.content.substring(indexContent+indexLength)
      response = 'Removed you from the list of referees.'
    } else {
      refs = [...refsArray, callerId]
      content = message.content + `\r<@${callerId}>`
      response = 'Added you to the list of refs for this match'
    }
    await matches.updateOne({_id: matchId}, {$set: {refs: refs.join(',')}})
    await DiscordRequest(`/channels/${message.channel_id}/messages/${message.id}`, {
      method: 'PATCH',
      body: {
        content,
        components: message.components
      }
    })
    return response
  })
  await updateResponse({application_id, token, content})
}