import path from 'path';
import download from "image-downloader"
import {fileURLToPath} from 'url'
import { followUpResponse, getPost, optionsToObject, postMessage, silentResponse, updatePost, updateResponse, waitingMsg } from "../../functions/helpers.js"
import { serverChannels } from "../../config/psafServerConfig.js"
import { getAllNationalities } from '../../functions/allCache.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
export const postPlayerPicture = async({options=[], callerId, resolved, interaction_id, application_id, guild_id, token, dbClient}) => {
  const {picture} = optionsToObject(options)
  const player = callerId
  if(!picture) {
    return silentResponse({interaction_id, token, content: 'Please attach a picture'})
  } else {
    const image = resolved?.attachments?.[picture]?.proxy_url
    if(image) {
      console.log(image)
      const imgURL = new URL(image)
      const isValidImage = imgURL.pathname.endsWith('.png')
      if(isValidImage) {
        return dbClient(async ({pendingPictures, players})=> {
          const dbPlayer = await players.findOne({id: player})
          if(!dbPlayer){
            return silentResponse({interaction_id, token, content: `Can't find <@${callerId}> in database. Have you registered?`})
          }
          const postResp = await postMessage({channel_id: serverChannels.picsChannelId, content: `<@${callerId}> submitted:\r`+image})
          const postMsg = await postResp.json()
          const confirmationResp = await postMessage({
            channel_id: serverChannels.confirmationPictures,
            content: `<@${callerId}> submitted this picture: https://discord.com/channels/${guild_id}/${postMsg.channel_id}/${postMsg.id} \r${image}${dbPlayer.profilePicture ? `\rPrevious pic: https://pso.shinmugen.net/${dbPlayer.profilePicture}`: ''}`,
            components:[{
              type: 1,
              components: [{
                type: 2,
                label: "Confirm",
                style: 3,
                custom_id: "confirm_picture"
              },{
                type: 2,
                label: "Cancel",
                style: 4,
                custom_id: "cancel_picture"
              }]
            }]
          })
          const statusResp = await postMessage({channel_id: serverChannels.picsChannelId, content: 'Pending validation...'})
          const statusMsg = await statusResp.json()
          const confirmationMsg = await confirmationResp.json()
          await pendingPictures.updateOne({playerId: callerId}, {$set: {playerId: callerId, pictureUrl: image, postedAt: Date.now(), confirmationId: confirmationMsg.id, statusId: statusMsg.id}}, {upsert: true})
          return silentResponse({interaction_id, token, content: `Posted. Please wait for validation.`})
        })
      }
    }
    return silentResponse({interaction_id, token, content: 'Not a valid image'})
  }
}

export const confirmPicture = async ({interaction_id, application_id, callerId, token, message, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const content = await dbClient(async ({players, pendingPictures})=> {
    const pendingPic = await pendingPictures.findOne({confirmationId: message.id})
    if(!pendingPic) {
      return 'No pending picture'
    }
    let response = 'Nothing edited'
    const {playerId, pictureUrl} = pendingPic
    const dbPlayer = await players.findOne({id: playerId}) || {}
    let profilePicture
    if(pictureUrl) {
      const urlPath = new URL(pictureUrl).pathname
      profilePicture = `site/images/${playerId}${path.extname(urlPath)}`
      download.image({
        url: pictureUrl,
        dest: `${__dirname}/../../${profilePicture}`,
        extractFilename: false
      })
    
    }
    await players.updateOne({id: playerId}, {$set:{
      profilePicture: profilePicture || dbPlayer.profilePicture,
    }}, {upsert: true})
    const updatedPlayer = await players.findOne({id: playerId}) || {}
    response = `<@${playerId}>}\r`
    const allNationalities = await getAllNationalities()
    if(updatedPlayer) {
      const country = allNationalities.find(country=> country.name === updatedPlayer.nat1)
      const country2 = allNationalities.find(country=> country.name === updatedPlayer.nat2)
      const country3 = allNationalities.find(country=> country.name === updatedPlayer.nat3)
      if(country){
        response += `${country.flag}${country2? `, ${country2.flag}`: ''}${country3? `, ${country3.flag}`: ''}\r`
      }
      if(updatedPlayer.desc) {
        response += `Description: *${updatedPlayer.desc}*\r`
      }
      if(updatedPlayer.profilePicture) {
        response += `https://pso.shinmugen.net/${profilePicture}`
      }
    }
    const postResp = await getPost({channel_id: serverChannels.confirmationPictures, messageId: message.id})
    const post = await postResp.json()
    await updatePost({channel_id: serverChannels.confirmationPictures, messageId: message.id, content: post.content + `\rValidated by <@${callerId}>`, components: []})
    if(pendingPic.statusId) {
      await updatePost({channel_id: serverChannels.picsChannelId, messageId: pendingPic.statusId, content: "Approved, will be on site in a few hours"})
    }
    return response
  })
  return updateResponse({application_id, token, content})
}

export const cancelPicture = async ({interaction_id, token, callerId, message, dbClient}) => {
  const content = await dbClient(async({pendingPictures})=> {
    const pendingPic = await pendingPictures.findOne({confirmationId: message.id})
    if(!pendingPic) {
      return 'No pending picture'
    }
    const postResp = await getPost({channel_id: serverChannels.confirmationPictures, messageId: message.id})
    const post = await postResp.json()
    await updatePost({channel_id: serverChannels.confirmationPictures, messageId: message.id, content: post.content + `\rCancelled by <@${callerId}>`, components: []})
    if(pendingPic.statusId) {
      await updatePost({channel_id: serverChannels.picsChannelId, messageId: pendingPic.statusId, content: "Declined by admin"})
    }
    return 'Cancelled'
  })
  return silentResponse({interaction_id, token, content})
}

export const postPlayerPictureCmd = {
  name: 'postpicture',
  description: 'Post your player picture',
  type: 1,
  psaf: true,
  func: postPlayerPicture,
  options: [{
    type: 11,
    name: 'picture',
    description: 'Picture for cards. Transparent bg-480x560',
    required: true
  }]
}

export default [postPlayerPictureCmd]