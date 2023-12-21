import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { DiscordRequest } from "../../utils.js"
import { msToTimestamp } from "../../functions/helpers.js"

const clubManagerRole = '1072620773434462318'

export const listDeals = async({dbClient, interaction_id, token, application_id, member}) => {
  if(!member.roles.includes(clubManagerRole)) {
    return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
      method: 'POST',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'Only Club Managers can list deals.',
          flags: InteractionResponseFlags.EPHEMERAL,
        }
      }
    })
  }
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
      }
    }
  })
  
  const{team, teamsDeals, teamsLoans} = await dbClient(async ({teams, pendingDeals, pendingLoans})=> {
    const team = await teams.findOne({$or: member.roles.map(id=> ({id})), active: true})
    const teamsDeals = await pendingDeals.find({approved: null, $or: [{teamFrom: team.id}, {destTeam: team.id}]}).toArray()
    const teamsLoans = await pendingLoans.find({approved: null, $or: [{teamFrom: team.id}, {destTeam: team.id}]}).toArray()
    return {
      team,
      teamsDeals,
      teamsLoans
    }
  })
  const content = teamsDeals.length > 0 ? `Pending deals for <@&${team.id}>:\r` : `No pending deals for <@&${team.id}>.`
  await DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      content,
      flags: InteractionResponseFlags.EPHEMERAL,
    }
  })
  await Promise.all([...teamsDeals.map(({_id, playerId, teamFrom, destTeam, amount, expiresOn})=>{
    const content = `TRANSFER: <@${playerId}> from <@&${teamFrom}> to <@&${destTeam}> for ${new Intl.NumberFormat('en-US').format(amount)} (expires on <t:${msToTimestamp(expiresOn)}:F>)` 
    return DiscordRequest(`/webhooks/${application_id}/${token}`, {
      method: 'POST',
      body: {
        content,
        components: team.id === destTeam ? [] :
        [{
          type: 1,
          components: [{
            type: 2,
            label: "Approve",
            style: 3,
            custom_id: "approve_deal_"+_id.toString(),
          }, {
            type: 2,
            label: "Decline",
            style: 4,
            custom_id: "decline_deal_"+_id.toString(),
          }]
        }],
        flags: InteractionResponseFlags.EPHEMERAL,
      }
    })
  }), 
  ...teamsLoans.map(({_id, playerId, teamFrom, destTeam,  amount, expiresOn, until, phase})=>{
    const content = `LOAN: <@${playerId}> from <@&${teamFrom}> to <@&${destTeam}> for ${new Intl.NumberFormat('en-US').format(amount)}\rLoan would end on: Season ${until}, ${phase}\r (expires on <t:${msToTimestamp(expiresOn)}:F>)` 
    return DiscordRequest(`/webhooks/${application_id}/${token}`, {
      method: 'POST',
      body: {
        content,
        components: team.id === destTeam ? [] :
        [{
          type: 1,
          components: [{
            type: 2,
            label: "Approve",
            style: 3,
            custom_id: "approve_loan_"+_id.toString(),
          }, {
            type: 2,
            label: "Decline",
            style: 4,
            custom_id: "decline_loan_"+_id.toString(),
          }]
        }],
        flags: InteractionResponseFlags.EPHEMERAL,
      }
    })
  }), Promise.resolve()])
}

export const listDealsCmd = {
  name: 'listdeals',
  description: 'List my deals',
  type: 1
}