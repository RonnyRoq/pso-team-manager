import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { DiscordRequest } from "../../utils.js"
import { optionsToObject } from "../../functions/helpers.js"
import { serverChannels, serverRoles } from "../../config/psafServerConfig.js"


const twoWeeksMs = 1209600033

export const deal = async ({dbClient, options, guild_id, interaction_id, token, application_id, channel_id, callerId, member})=> {
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })
  const {player, amount, desc} = optionsToObject(options)
  
  const response = await dbClient(async ({teams, confirmations, pendingDeals})=> {
    if(!member.roles.includes(serverRoles.clubManagerRole)) {
      return 'This command is restricted to Club Managers'
    }
    const [discPlayerResp, destTeam, ongoingConfirmation] = await Promise.all([
      DiscordRequest(`/guilds/${guild_id}/members/${player}`, {}),
      teams.findOne({active: true, $or: member.roles.map(id=>({id}))}),
      confirmations.findOne({playerId: player})
    ])
    if(ongoingConfirmation) {
      return `<@${player}> is already confirming for <@&${ongoingConfirmation.team}>.`
    }
    const discPlayer = await discPlayerResp.json()
    const sourceTeam = await teams.findOne({active: true, $or: discPlayer.roles.map((id)=>({id}))})
    if(discPlayer.roles.includes(serverRoles.clubManagerRole)) {
      return `Cannot recruit <@${player}> ; Club Manager of ${sourceTeam.name}.`
    }
    const response = `<@${callerId}> requests a transfer <@${player}> from ${sourceTeam.emoji} ${sourceTeam.name} to ${destTeam.emoji} ${destTeam.name}\rFor <:EBit:1128310625873961013>**${new Intl.NumberFormat('en-US').format(amount)} Ebits**\r${desc?desc:''}`
    const [dealPostResp, adminPostResp] = await Promise.all([
      DiscordRequest(`/channels/${channel_id}/messages`, {
        method: 'POST',
        body: {
          content: response
        }
      }),
      DiscordRequest(`/channels/${serverChannels.confirmationTransferChannel}/messages`, {
        method: 'POST',
        body: {
          components: [{
            type: 1,
            components: [{
              type: 2,
              label: "Cancel",
              style: 4,
              custom_id: "cancel_deal"
            }]
          }],
          content: response
        }
      })
    ])

    const [dealPost, adminPost] = await Promise.all([dealPostResp.json(), adminPostResp.json()])
    await pendingDeals.insertOne({
      playerId: player,
      teamFrom: sourceTeam.id,
      destTeam: destTeam.id,
      amount,
      expiresOn: Date.now()+twoWeeksMs,
      messageId: dealPost.id,
      adminMessage: adminPost.id
    })
    
    return 'Request posted'
  })
  return await DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      content: response,
      flags: InteractionResponseFlags.EPHEMERAL
    }
  })
}

export const dealCmd = {
  name: 'deal',
  description: 'Make a deal over a player',
  type: 1,
  options: [{
    type: 6,
    name: 'player',
    description: 'Player to transfer',
    required: true
  },{
    type: 4,
    name: 'amount',
    description: 'How much for the deal (enter 1000000 for 1M)',
    min_value: 0,
    required: true
  },{
    type: 3,
    name: 'desc',
    description: 'Any comments such as minimum amount of seasons'
  }]
}