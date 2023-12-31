import { ObjectId } from "mongodb"
import { getPlayerNick, updateResponse, waitingMsg } from "../../functions/helpers.js"
import { DiscordRequest } from "../../utils.js"
import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions"
import { internalEndMatch } from "../match.js"
//import { fixturesChannels } from "../../config/psafServerConfig.js"
import { getAllPlayers } from "../../functions/playersCache.js"

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

export const matchResultPrompt = async ({interaction_id, token, custom_id, dbClient}) => {
  const [,,id] = custom_id.split('_')
  const matchId = new ObjectId(id)
  await dbClient(async ({matches, nationalities, teams})=> {
    const match = await matches.findOne(matchId)
    const {isInternational, home, away, homeScore, awayScore} = match || {}
    let homeTeam, awayTeam
    if(isInternational) {
      [homeTeam, awayTeam] = await Promise.all([
        nationalities.findOne({name: home}),
        nationalities.findOne({name: away})
      ])
    } else {
      [homeTeam, awayTeam] = await Promise.all([
        teams.findOne({active:true, id: home}),
        teams.findOne({active:true, id: away})
      ])
    }

    const modal = {
      title: `${homeTeam.name} - ${awayTeam.name}`.substring(0, 44),
      custom_id: `match_result_${id}`,
      components: [{
        type: 1,
        components: [{
          type: 4,
          custom_id: "home_score",
          label: homeTeam.name,
          style: 1,
          min_length: 1,
          max_length: 3,
          value: homeScore,
          required: true
        }]
      },{
        type: 1,
        components: [{
          type: 4,
          custom_id: "away_score",
          label: awayTeam.name,
          style: 1,
          min_length: 1,
          max_length: 3,
          value: awayScore,
          required: true
        }]
      },{
        type: 1,
        components: [
          {
            type: 4,
            custom_id: "ff",
            label: 'Enter ff if Forfeited',
            style: 1,
            max_length: 2,
            required: false
          }
        ]
    }]
    }
    
    await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
      method: 'POST',
      body: {
        type : InteractionResponseType.MODAL,
        data: modal
      }
    })
  })
}

export const enterRatingsModal = async ({interaction_id, token, custom_id, guild_id, dbClient}) => {
  const [,homeAway,id] = custom_id.split('_')
  const matchId = new ObjectId(id)
  const allPlayers = await getAllPlayers(guild_id)
  await dbClient(async ({matches, nationalities, teams, lineups})=> {
    const match = await matches.findOne(matchId)
    const {isInternational, home, away} = match || {}
    let homeTeam, awayTeam
    let homeLineup, awayLineup
    if(isInternational) {
      [homeTeam, awayTeam] = await Promise.all([
        nationalities.findOne({name: home}),
        nationalities.findOne({name: away})
      ])
    } else {
      [homeTeam, awayTeam] = await Promise.all([
        teams.findOne({active:true, id: home}),
        teams.findOne({active:true, id: away})
      ]);
      [homeLineup, awayLineup] = await Promise.all([
        lineups.findOne({matchId, team: home}),
        lineups.findOne({matchId, team: away})
      ]);
    }

    let team = awayTeam
    let lineup = awayLineup
    if(homeAway === "home") {
      team = homeTeam
      lineup = homeLineup
    }

    //const eightPlayers = fixturesChannels.find(league=> league.value === match.league).players === 8

    const eightModal = [{
      type: 1,
      components :[{
        type: 4,
        custom_id: "gk_rating",
        label: `GK: ${getPlayerNick(allPlayers.find(player=> player.user.id === lineup?.gk))}`,
        style: 1,
        max_length: 1,
        required:true
      }]
    },{
      type: 1,
      components :[{
        type: 4,
        custom_id: "dl_rating",
        label: `DL: ${getPlayerNick(allPlayers.find(player=> player.user.id === lineup?.dl))}`,
        style: 1,
        max_length: 1,
        required:true
      }]
    },{
      type: 1,
      components :[{
        type: 4,
        custom_id: "dc_rating",
        label: `DC: ${getPlayerNick(allPlayers.find(player=> player.user.id === lineup?.dc))}`,
        style: 1,
        max_length: 1,
        required:true
      }]
    },{
      type: 1,
      components :[{
        type: 4,
        custom_id: "dr_rating",
        label: `DR: ${getPlayerNick(allPlayers.find(player=> player.user.id === lineup?.dr))}`,
        style: 1,
        max_length: 1,
        required:true
      }]
    },{
      type: 1,
      components :[{
        type: 4,
        custom_id: "lcm_rating",
        label: `LCM: ${getPlayerNick(allPlayers.find(player=> player.user.id === lineup?.lcm))}`,
        style: 1,
        max_length: 1,
        required:true
      }]
    },{
      type: 1,
      components :[{
        type: 4,
        custom_id: "rcm_rating",
        label: `RCM: ${getPlayerNick(allPlayers.find(player=> player.user.id === lineup?.rcm))}`,
        style: 1,
        max_length: 1,
        required:true
      }]
    },{
      type: 1,
      components :[{
        type: 4,
        custom_id: "lst_rating",
        label: `LST: ${getPlayerNick(allPlayers.find(player=> player.user.id === lineup?.lst))}`,
        style: 1,
        max_length: 1,
        required:true
      }]
    },{
      type: 1,
      components :[{
        type: 4,
        custom_id: "rst_rating",
        label: `RST: ${getPlayerNick(allPlayers.find(player=> player.user.id === lineup?.rst))}`,
        style: 1,
        max_length: 1,
        required:true
      }]
    },{
      type: 1,
      components: [{
        type: 2,
        custom_id: "submit",
        label: "Submit",
        style: 3
      }]
    }]

    const data = {
      content: `Ratings ${team.name}`.substring(0, 44),
      components: eightModal,
      flags: InteractionResponseFlags.EPHEMERAL
    }
    
    await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
      method: 'POST',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data
      }
    })
  })
}

export const endMatchModalResponse = async ({interaction_id, token, custom_id, components, dbClient}) => {
  const [,,id] = custom_id.split('_')
  const entries = components.map(({components})=> components[0])
  const {home_score, away_score, ff=''} = Object.fromEntries(entries.map(entry=> [entry.custom_id, entry.value]))
  const endMatchResponse = await internalEndMatch({id, homeScore:home_score, awayScore:away_score, ff:ff.toLowerCase() === 'ff', dbClient})
  return await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: endMatchResponse
      }
    }
  })
}