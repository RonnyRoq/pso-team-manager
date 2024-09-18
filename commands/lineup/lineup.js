import {
  InteractionResponseType,
} from 'discord-interactions';
import { getPlayerTeam, getPlayerNick, optionsToObject, msToTimestamp, postMessage, genericFormatMatch, waitingMsg, updateResponse, genericInterFormatMatch, getRegisteredRole, isServerSupported, isLineupChannel, handleSubCommands } from '../../functions/helpers.js';
import { getAllPlayers } from '../../functions/playersCache.js';
import { lineupBlacklist, lineupRolesBlacklist, lineupRolesWhitelist, serverChannels, serverRoles, wcLineupBlacklist, wcLineupRolesWhilelist } from '../../config/psafServerConfig.js';
import { DiscordRequest } from '../../utils.js';
import { getAllLeagues, getAllNationalities } from '../../functions/allCache.js';
import { getFastCurrentSeason } from '../season.js';

export const nonLineupAttributes = ['_id', 'team', 'matchId', 'vs']
const steam = '<:steam:1201620242015719454>'

const positionsOrder = {
  gk: 'GK',
  lb: 'LB',
  lcb: 'LCB',
  cb: 'CB',
  rcb: 'RCB',
  rb: 'RB',
  lm: 'LM',
  lcm: 'LCM',
  cm: 'CM',
  rcm: 'RCM',
  rm: 'RM',
  lw: 'LW',
  lf: 'LF',
  lst: 'LST',
  st: 'ST',
  rst: 'RST',
  rf: 'RF',
  rw: 'RW',
}

const subsOrder = [
  "sub1",
  "sub2",
  "sub3",
  "sub4",
  "sub5",
  "sub6",
]

export const isOfficialLineup = (guild_id, channel_id) => {
  return (guild_id === process.env.GUILD_ID && channel_id === serverChannels.lineupsChannelId)
}

export const formatDMLineup = ({gk, lb, rb, cm, lw, rw, sub1, sub2, sub3, sub4, sub5, cb, lcm, rcm, lst, rst}) => {
  let response = `**GK:** ${gk.name} (<@${gk.id}>)\r`;
  response += `**LB:** ${lb.name} (<@${lb.id}>)\r`;
  if(cb) {
    response += `**CB:** ${cb.name} (<@${cb.id}>)\r`;
  }
  response += `**RB:** ${rb.name} (<@${rb.id}>)\r`;
  if(lcm) {
    response += `**LCM:** ${lcm.name} (<@${lcm.id}>)\r`;
    response += `**RCM:** ${rcm.name} (<@${rcm.id}>)\r`;
  } else {
    response += `**CM:** ${cm.name} (<@${cm.id}>)\r`;
  }
  if(lst) {
    response += `**LST:** ${lst.name} (<@${lst.id}>)\r`;
    response += `**RST:** ${rst.name} (<@${rst.id}>)`;
  } else {
    response += `**LW:** ${lw.name} (<@${lw.id}>)\r`;
    response += `**RW:** ${rw.name} (<@${rw.id}>)`;
  }
  if(sub1?.id) {
    response += `\r**Subs:** ${sub1.name} (<@${sub1.id}>)`;
  }
  if(sub2?.id) {
    response += `, ${sub2.name} (<@${sub2.id}>)`;
  }
  if(sub3?.id) {
    response += `, ${sub3.name} (<@${sub3.id}>)`;
  }
  if(sub4?.id) {
    response += `, ${sub4.name} (<@${sub4.id}>)`;
  }
  if(sub5?.id) {
    response += `, ${sub5.name} (<@${sub5.id}>)`;
  }
  return response
}

export const formatGenericLineup = (lineup, admin = false) => {
  const referencePositionsKeys = Object.keys(positionsOrder)
  const lineupEntries = Object.entries(lineup)
  const entries = lineupEntries.filter(([key])=> referencePositionsKeys.includes(key)).sort(([a], [b])=> referencePositionsKeys.indexOf(a) - referencePositionsKeys.indexOf(b))
  const subsEntries = lineupEntries.filter(([key])=> subsOrder.includes(key)).sort(([a], [b])=> subsOrder.indexOf(a)- subsOrder.indexOf(b))
  let response = ''
  if(lineup?.gk?.id) {
    response = entries.map(([key, value])=> `**${positionsOrder[key]}:** <@${value.id}> ${value.registered ? steam: ''}${value.ingamename ? ` (${value.ingamename})`: ''}${admin && value.steam ? ' '+value.steam:''}`).join('\r')
    if(subsEntries.length>0)
      response += "\rSubs: "
      response += subsEntries.map(([, value])=> `<@${value.id}> ${value.registered ? steam : ''}${value.ingamename ? ` (${value.ingamename})`: ''}${admin && value.steam ? ' '+value.steam:''}`).join(', ')
  } else {
    response = entries.map(([key, value])=> `**${positionsOrder[key]}:** <@${value}>\r`).join('\r')
    if(subsEntries.length>0) {
      response += "\rSubs: "
      response += subsEntries.map(([, value])=> `<@${value.id}>`).join(', \r')
    }
  }
  if(lineup?.publicId) {
    response += `> Lineup ID: ${lineup.publicId}`
  }
  return response
}

export const formatLineup = ({gk, lb, rb, cm, lw, rw, sub1, sub2, sub3, sub4, sub5, admin}) => {
  if(gk && gk.id) {
    let response = `**GK:** <@${gk.id}> ${gk.registered ? steam: ''}${gk.ingamename ? ` (${gk.ingamename})`: ''}${admin && gk.steam ? ' '+gk.steam:''}\r`;
    response += `**LB:** <@${lb.id}> ${lb.registered ? steam : ''}${lb.ingamename ? ` (${lb.ingamename})`: ''}${admin && lb.steam ? ' '+lb.steam:''}\r`;
    response += `**RB:** <@${rb.id}> ${rb.registered ? steam : ''}${rb.ingamename ? ` (${rb.ingamename})`: ''}${admin && rb.steam ? ' '+rb.steam:''}\r`;
    response += `**CM:** <@${cm.id}> ${cm.registered ? steam : ''}${cm.ingamename ? ` (${cm.ingamename})`: ''}${admin && cm.steam ? ' '+cm.steam:''}\r`;
    response += `**LW:** <@${lw.id}> ${lw.registered ? steam : ''}${lw.ingamename ? ` (${lw.ingamename})`: ''}${admin && lw.steam ? ' '+lw.steam:''}\r`;
    response += `**RW:** <@${rw.id}> ${rw.registered ? steam : ''}${rw.ingamename ? ` (${rw.ingamename})`: ''}${admin && rw.steam ? ' '+rw.steam:''}`;
    if(sub1) {
      response += `\r**Subs:** <@${sub1.id}> ${sub1.registered ? steam : ''}${sub1.ingamename ? ` (${sub1.ingamename})`: ''}${admin && sub1.steam ? ' '+sub1.steam:''}\r`;
    }
    if(sub2) {
      response += `, <@${sub2.id}> ${sub2.registered ? steam : ''}${sub2.ingamename ? ` (${sub2.ingamename})`: ''}${admin && sub2.steam ? ' '+sub2.steam:''}\r`;
    }
    if(sub3) {
      response += `, <@${sub3.id}> ${sub3.registered ? steam : ''}${sub3.ingamename ? ` (${sub3.ingamename})`: ''}${admin && sub3.steam ? ' '+sub3.steam:''}\r`;
    }
    if(sub4) {
      response += `, <@${sub4.id}> ${sub4.registered ? steam : ''}${sub4.ingamename ? ` (${sub4.ingamename})`: ''}${admin && sub4.steam ? ' '+sub4.steam:''}\r`;
    }
    if(sub5) {
      response += `, <@${sub5.id}> ${sub5.registered ? steam : ''}${sub5.ingamename ? ` (${sub5.ingamename})`: ''}${admin && sub5.steam ? ' '+sub5.steam:''}\r`;
    }
    return response
  } else {
    let response = `**GK:** <@${gk}>\r`;
    response += `**LB:** <@${lb}>\r`;
    response += `**RB:** <@${rb}>\r`;
    response += `**CM:** <@${cm}>\r`;
    response += `**LW:** <@${lw}>\r`;
    response += `**RW:** <@${rw}>`;
    if(sub1) {
      response += `\r**Subs:** <@${sub1}>`;
    }
    if(sub2) {
      response += `, <@${sub2}>`;
    }
    if(sub3) {
      response += `, <@${sub3}>`;
    }
    if(sub4) {
      response += `, <@${sub4}>`;
    }
    if(sub5) {
      response += `, <@${sub5}>`;
    }
    return response
  }
}

export const formatEightLineup = ({gk, lb, cb, rb, lcm, rcm, lst, rst, sub1, sub2, sub3, sub4, sub5, admin}) => {
  if(gk && gk.id) {
    let response = `**GK:** <@${gk.id}> ${gk.registered ? steam : ''}${gk.ingamename ? ` (${gk.ingamename})`: ''}${admin && gk.steam ? ' '+gk.steam:''}\r`;
    response += `**LB:** <@${lb.id}> ${lb.registered ? steam : ''}${lb.ingamename ? ` (${lb.ingamename})`: ''}${admin && lb.steam ? ' '+lb.steam:''}\r`;
    response += `**CB:** <@${cb.id}> ${cb.registered ? steam : ''}${cb.ingamename ? ` (${cb.ingamename})`: ''}${admin && cb.steam ? ' '+cb.steam:''}\r`;
    response += `**RB:** <@${rb.id}> ${rb.registered ? steam : ''}${rb.ingamename ? ` (${rb.ingamename})`: ''}${admin && rb.steam ? ' '+rb.steam:''}\r`;
    response += `**LCM:** <@${lcm.id}> ${lcm.registered ? steam : ''}${lcm.ingamename ? ` (${lcm.ingamename})`: ''}${admin && lcm.steam ? ' '+lcm.steam:''}\r`;
    response += `**RCM:** <@${rcm.id}> ${rcm.registered ? steam : ''}${rcm.ingamename ? ` (${rcm.ingamename})`: ''}${admin && rcm.steam ? ' '+rcm.steam:''}\r`;
    response += `**LST:** <@${lst.id}> ${lst.registered ? steam : ''}${lst.ingamename ? ` (${lst.ingamename})`: ''}${admin && lst.steam ? ' '+lst.steam:''}\r`;
    response += `**RST:** <@${rst.id}> ${rst.registered ? steam : ''}${rst.ingamename ? ` (${rst.ingamename})`: ''}${admin && rst.steam ? ' '+rst.steam:''}`;
    if(sub1) {
      response += `\r**Subs:** <@${sub1.id}> ${sub1.registered ? steam : ''}${sub1.ingamename ? ` (${sub1.ingamename})`: ''}${admin && sub1.steam ? ' '+sub1.steam:''}\r`;
    }
    if(sub2) {
      response += `, <@${sub2.id}> ${sub2.registered ? steam : ''}${sub2.ingamename ? ` (${sub2.ingamename})`: ''}${admin && sub2.steam ? ' '+sub2.steam:''}\r`;
    }
    if(sub3) {
      response += `, <@${sub3.id}> ${sub3.registered ? steam : ''}${sub3.ingamename ? ` (${sub3.ingamename})`: ''}${admin && sub3.steam ? ' '+sub3.steam:''}\r`;
    }
    if(sub4) {
      response += `, <@${sub4.id}> ${sub4.registered ? steam : ''}${sub4.ingamename ? ` (${sub4.ingamename})`: ''}${admin && sub4.steam ? ' '+sub4.steam:''}\r`;
    }
    if(sub5) {
      response += `, <@${sub5.id}> ${sub5.registered ? steam : ''}${sub5.ingamename ? ` (${sub5.ingamename})`: ''}${admin && sub5.steam ? ' '+sub5.steam:''}\r`;
    }
    return response
  } else {
    let response = `GK: <@${gk}>\r`;
    response += `LB: <@${lb}>\r`;
    response += `CB: <@${cb}>\r`;
    response += `RB: <@${rb}>\r`;
    response += `LCM: <@${lcm}>\r`;
    response += `RCM: <@${rcm}>\r`;
    response += `LST: <@${lst}>\r`;
    response += `RST: <@${rst}>`;
    if(sub1) {
      response += `\rSubs: <@${sub1}>`;
    }
    if(sub2) {
      response += `, <@${sub2}>`;
    }
    if(sub3) {
      response += `, <@${sub3}>`;
    }
    if(sub4) {
      response += `, <@${sub4}>`;
    }
    if(sub5) {
      response += `, <@${sub5}>`;
    }
    return response
  }
}

const saveLineup = async ({dbClient, callerId, lineup, objLineup={}, playerTeam, member, guild_id, channel_id }) => {
  if(isOfficialLineup(guild_id, channel_id)) {
    let playerTeam= ''
    const startOfDay = new Date()
    startOfDay.setHours(startOfDay.getHours()-1,0,0,0)
    const endOfDay = new Date()
    endOfDay.setHours(23,59,59,999)
    const startDateTimestamp = msToTimestamp(Date.parse(startOfDay))
    const endDateTimestamp = msToTimestamp(Date.parse(endOfDay))
    
    return await dbClient(async ({teams, matches, players, lineups, nationalTeams, nationalContracts})=>{
      const season = getFastCurrentSeason()
      const [nations, nationalSelections, selfNationalContract, memberTeam, allTeams] = await Promise.all([
        getAllNationalities(),
        nationalTeams.find({active: true}).toArray(),
        nationalContracts.findOne({season, playerId: callerId}),
        getPlayerTeam(member, teams),
        teams.find({active: true}).toArray()
      ])
      const memberSelection = await nationalSelections.find(selection=> selection?.shortName=== selfNationalContract?.selection)
      const teamIds = [memberTeam?.id, memberSelection?.shortname].filter(item=> item)
      const nextMatches = await matches.find({season, dateTimestamp: { $gt: startDateTimestamp, $lt: endDateTimestamp}, finished: {$in: [false, null]}, $or: [{home: {$in: teamIds}}, {away: {$in: teamIds}}]}).sort({dateTimestamp:1}).toArray()
      let savedLineup
      const lineupId = Math.random().toString(36).slice(-6)
      if(!lineup.id) {
        savedLineup = await lineups.findOneAndUpdate({postedBy: callerId, id: lineup.id}, {
          $setOnInsert: {
            postedBy: callerId,
            id: lineupId
          },
          $set: {
            ...lineup
          }
        }, {upsert: true, returnDocument: 'after'})
      } else {
        savedLineup = {postedBy: callerId, id: lineupId, ...lineup}
        await lineup.insertOne(savedLineup)
      }
      console.log(savedLineup)
      let nextMatch, theMatchId, teamId
      if(nextMatches.length > 1) {
        return {
          content: 'Which match is it for?', 
          components: [{
            type: 1,
            components: nextMatches.map(match=> {
              const home = allTeams.find(team=> team.id === match.home)
              const away = allTeams.find(team=> team.id === match.away)
              return {
                type: 2,
                label: `${home.name} vs ${away.name}`.substring(0, 79),
                style: 2,
                custom_id: `lineup_${savedLineup.id}_${match._id.toString()}`,
              }
            }).slice(0, 4)
          }]
        }
      } else if(nextMatches.length === 1) {
        nextMatch = nextMatches[0]
        theMatchId = nextMatch?._id?.toString() || ''
        const allLeagues = await getAllLeagues()
        teamId = teamIds.includes(nextMatch.home) ? nextMatch.home : nextMatch.away
        if(!nextMatch.isInternational){
          const teamsOfMatch = await teams.find({id: {$in: [nextMatch.home,nextMatch.away]}}).toArray()
          playerTeam = genericFormatMatch(teamsOfMatch, nextMatch, allLeagues) + '\r'
        } else {
          playerTeam = genericInterFormatMatch(nations, nationalSelections, nextMatch, allLeagues)
        }
        await lineups.updateOne({postedBy:callerId, id:savedLineup.id}, {
          $set: {
            matchId: theMatchId,
            team: teamId,
          }
        }, {upsert: true})
      }
      let lineupPlayers = await players.find({id: {$in: Object.values(lineup)}}, {projection: {id:1, steam: 1, ingamename: 1}}).toArray()
      //playerTeam += (isInternational ? selectionFlags : memberTeam.emoji) + ' ' + memberTeam.name + ' '
      //lineupPlayers = lineupPlayers.filter(lineupPlayer=> lineupPlayer.steam)
      objLineup = Object.fromEntries(Object.entries(objLineup).map(([position, objPlayer])=> {
        const player = (lineupPlayers.find(lineupPlayer => lineupPlayer.id === objPlayer.id))
        return ([position, {...objPlayer, ...player}])
      }))
      let response = `\r<@${callerId}> posted:\r${playerTeam}lineup ${lineup.vs? `vs ${lineup.vs}`: ''}\r`
      response += formatGenericLineup({vs: lineup.vs, ...objLineup})
      
      let threadMessage = `\r<@${callerId}> posted:\r${playerTeam}lineup ${lineup.vs? `vs ${lineup.vs}`: ''}\r`
      threadMessage += formatGenericLineup({vs: lineup.vs, ...objLineup}, true)
      
      const messageResp = await postMessage({channel_id, content: response})
      const message = await messageResp.json()
      if(nextMatch?.thread) {
        try {
          await DiscordRequest(`/channels/${nextMatch.thread}/messages`, {
            method: 'POST',
            body: {
              content: threadMessage
            }
          })
        }
        catch(e) {
          console.error(e)
        }
      }
      if(theMatchId){
        await lineups.updateOne({matchId: theMatchId, team: teamId}, {$set: {message: message.id}})
      }
      return {content: `${nextMatch ? `Your lineup code: ${savedLineup?.id}\r` : ''}${response}`}
    })
  } else {
    let response = `<@${callerId}> posted:\r${playerTeam? playerTeam : ''}lineup ${lineup.vs? `vs ${lineup.vs}`: ''}\r`
    response += formatGenericLineup({vs: lineup.vs, ...objLineup})
    await postMessage({channel_id, content: response})
    return {content: response}
  }
}

const verifyClubLineup = (discPlayer, playerId) => {
  const response = {}
  if(lineupBlacklist.includes(playerId)) {
    response.message = `<@${playerId}> can't be included in a lineup`
  }
  if(discPlayer.roles.some(role => lineupRolesBlacklist.includes(role))) {
    response.message = `<@${playerId}> is not eligible to play`
  }
  if(!discPlayer.roles.some(role => lineupRolesWhitelist === role)) {
    response.message =`<@${playerId}> isn't registered`
  }
  return response
}

const verifyWCLineup = (discPlayer, playerId) => {
  const response = {}
  if(lineupBlacklist.includes(playerId)) {
    response.message = `<@${playerId}> can't be included in a lineup`
  }
  if(discPlayer.roles.some(role => wcLineupBlacklist.includes(role))) {
    response.message = `<@${playerId}> is not eligible to play`
  }
  if(!discPlayer.roles.some(role => wcLineupRolesWhilelist === role)) {
    response.message =`<@${playerId}> isn't registered`
  }
  return response
}

const verifyInternationalLineup = (discPlayer, playerId) => {
  const response = {}
  if(lineupBlacklist.includes(playerId)) {
    response.message = `<@${playerId}> can't be included in a lineup`
  }
  if(discPlayer.roles.some(role => lineupRolesBlacklist.includes(role))) {
    response.message = `<@${playerId}> is not eligible to play`
  }
  if(!discPlayer.roles.includes(serverRoles.nationalTeamPlayerRole)) {
     response.message = `<@${playerId}> is not an international player`
  }
  if(!discPlayer.roles.some(role => lineupRolesWhitelist === role)) {
     response.message = `<@${playerId}> isn't verified`
  }
  return response
}

export const editLineup = async({options, interaction_id, callerId, token, member, guild_id, application_id, channel_id, dbClient}) => {
  return lineup({options, interaction_id, callerId, token, member, edit:true, guild_id, application_id, channel_id, dbClient})
}

export const lineup = async({options, callerId, token, member, edit = false, guild_id, application_id, channel_id, dbClient}) => {
  const lineup = optionsToObject(options)
  const allPlayers = await getAllPlayers(guild_id)
  let forbiddenUsersList = []
  let objLineup = Object.fromEntries(
    Object.entries(lineup)
      .filter(([name])=> !nonLineupAttributes.includes(name))
      .map(([name, value])=> {
        const discPlayer = allPlayers.find(player=> player?.user?.id === value)
        if(guild_id === process.env.GUILD_ID) {
          const response = verifyClubLineup(discPlayer, value)
          if(response.message) {
            forbiddenUsersList.push(response.message)
          }
        }
        return [name, {id: value, name: getPlayerNick(discPlayer), registered: discPlayer.roles.includes(serverRoles.registeredRole)}]
      })
  )
  if(forbiddenUsersList.length>0) {
    const content = forbiddenUsersList.join('\r')
    await postMessage({channel_id, content})
    return updateResponse({application_id, token, content})
  }
  const {content, components} = await saveLineup({dbClient, lineup, callerId, objLineup, member, edit, application_id, guild_id, isInternational:false, token, channel_id, isEightPlayers: false})
  return updateResponse({application_id, token, content, components})
}

export const internationalLineup = async ({options, member, callerId, guild_id, interaction_id, application_id, token, channel_id, dbClient}) => {
  const lineup = optionsToObject(options)
  const allPlayers = await getAllPlayers(guild_id)
  let forbiddenUsersList = []
  let objLineup = Object.fromEntries(
    Object.entries(lineup)
      .filter(([name])=> !nonLineupAttributes.includes(name))
      .map(([name, value])=> {
        const discPlayer = allPlayers.find(player=> player?.user?.id === value)
        if(guild_id === process.env.GUILD_ID) {
          const response = verifyInternationalLineup(discPlayer, value)
          if(response.message) {
            forbiddenUsersList.push(response.message)
          }
        }
        return [name, {id: value, name: getPlayerNick(discPlayer), registered: discPlayer.roles.includes(serverRoles.registeredRole)}]
      })
  )
  if(forbiddenUsersList.length>0) {
    await postMessage({channel_id, content})
    return updateResponse({application_id, token, content})
  }
  await waitingMsg({interaction_id, token})
  const {content, components} = await saveLineup({dbClient, lineup, callerId, objLineup, member, guild_id, application_id, isInternational:true, interaction_id, token, channel_id, isEightPlayers: false})
  return updateResponse({application_id, token, content, components})
}

export const editEightLineup = ({options, interaction_id, callerId, token, application_id, channel_id, member, guild_id, dbClient}) => 
  eightLineup({options, interaction_id, callerId, token, application_id, channel_id, member, guild_id, edit: true, dbClient})

export const eightLineup = async ({options, interaction_id, callerId, token, application_id, channel_id, edit=false, member, guild_id, dbClient}) => {
  const lineup = optionsToObject(options)
  await waitingMsg({interaction_id, token})
  const allPlayers = await getAllPlayers(guild_id)
  let forbiddenUsersList = []
  let objLineup = Object.fromEntries(
    Object.entries(lineup)
      .filter(([name])=> !nonLineupAttributes.includes(name))
      .map(([name, value])=> {
        const discPlayer = allPlayers.find(player=> player?.user?.id === value)
        if(guild_id === process.env.GUILD_ID) {
          const response = verifyClubLineup(discPlayer, value)
          if(response.message) {
            forbiddenUsersList.push(response.message)
          }
        }
        return [name, {id: value, name: getPlayerNick(discPlayer), registered: discPlayer.roles.includes(serverRoles.registeredRole)}]
      })
  )
  if(forbiddenUsersList.length>0) {
    return postMessage({channel_id, content: `<@${callerId}> - Can't post this lineup, restricted users: ${forbiddenUsersList.join(', ')}`})
  }
  const {content, components} = await saveLineup({dbClient, lineup, callerId, objLineup, member, guild_id, application_id, edit, isInternational:false, interaction_id, token, channel_id, isEightPlayers: true})
  return updateResponse({application_id, token, content, components})
}

const findPlayerNick = (playersList, id) => {
  const player = playersList.find(player => player?.user?.id === id)
  return getPlayerNick(player)
}

export const boxLineup = async ({res, options, member, guild_id, dbClient}) => {
  const {gk, lb, rb, cm, lw, rw, sub1, sub2, sub3, sub4, sub5, vs} = Object.fromEntries(options.map(({name, value})=> [name, value]))
  let playerTeam = ''
  let embedColor = 16777215
  let teamIcon = ''
  const allPlayers = await getAllPlayers(guild_id)
  if(process.env.GUILD_ID === guild_id) {
    const startOfDay = new Date()
    startOfDay.setHours(startOfDay.getHours()-1,0,0,0)
    const endOfDay = new Date()
    endOfDay.setHours(23,59,59,999)
    const startDateTimestamp = msToTimestamp(Date.parse(startOfDay))
    const endDateTimestamp = msToTimestamp(Date.parse(endOfDay))
    await dbClient(async ({teams, matches, lineups})=>{
      const memberTeam = await getPlayerTeam(member, teams)
      const nextMatches = await matches.find({dateTimestamp: { $gt: startDateTimestamp, $lt: endDateTimestamp}, finished: {$in: [false, null]}, $or: [{home: memberTeam.id}, {away: memberTeam.id}]}).sort({dateTimestamp:1}).toArray()
      const nextMatch = nextMatches[0]
      if(nextMatch) {
        const allLeagues = await getAllLeagues()
        const teamsOfMatch = await teams.find({active: true, $or:[{id:nextMatch.home}, {id:nextMatch.away}]}).toArray()
        playerTeam = genericFormatMatch(teamsOfMatch, nextMatch, allLeagues) + '\r'
        const matchId = nextMatch._id.toString()
        await lineups.updateOne({matchId, team:memberTeam.id}, {
          $setOnInsert: {
            matchId,
            team: memberTeam.id
          },
          $set: {
            gk,
            lb,
            rb,
            cm,
            lw,
            rw,
            sub1,
            sub2,
            sub3,
            sub4,
            sub5
          }
        }, {upsert: true})
      }
      playerTeam = memberTeam.name +' '
      embedColor = memberTeam.color
      teamIcon = `https://cdn.discordapp.com/role-icons/${memberTeam.id}/${memberTeam.icon}.png`
    })
  }
  const optionValues = options.map(option => option.value).sort()
  const lineupPlayers = optionValues.map(id => allPlayers.find(player => player.user.id === id))
  const lineupEmbed = {
    "type": "rich",
    "color": embedColor,
    "thumbnail": {
      "url": "https://shinmugen.net/Football-pitch-icon.png"
    },
    "author": {
      "name": `${playerTeam}Lineup by ${getPlayerNick(member)}`
    },
    "fields": [
      {
        "name": `${vs? `Against ${vs}`: ' '}`,
        "value": " ",
        "inline": false
      },
      {
        "name": " ",
        "value": "",
        "inline": false
      },
      {
        "name": "LW:",
        "value": `<@${lw}>\r(${findPlayerNick(lineupPlayers, lw)})`,
        "inline": true
      },
      {
        "name": " ",
        "value": "",
        "inline": true
      },
      {
        "name": "RW:",
        "value": `<@${rw}>\r(${findPlayerNick(lineupPlayers, rw)})`,
        "inline": true
      },
      {
        "name": " ",
        "value": "",
        "inline": true
      },
      {
        "name": "CM",
        "value": `<@${cm}>\r(${findPlayerNick(lineupPlayers, cm)})`,
        "inline": true
      },
      {
        "name": " ",
        "value": "",
        "inline": true
      },
      {
        "name": "LB",
        "value": `<@${lb}>\r(${findPlayerNick(lineupPlayers, lb)})`,
        "inline": true
      },
      {
        "name": " ",
        "value": "",
        "inline": true
      },
      {
        "name": "RB",
        "value": `<@${rb}>\r(${findPlayerNick(lineupPlayers, rb)})`,
        "inline": true
      },
      {
        "name": " ",
        "value": "",
        "inline": true
      },
      {
        "name": "GK",
        "value": `<@${gk}>\r(${findPlayerNick(lineupPlayers, gk)})`,
        "inline": true
      },
      {
        "name": " ",
        "value": "",
        "inline": true
      }
    ]
  }
  if(sub1) {
    lineupEmbed.fields.push(
      {
        "name": "Subs",
        "value": `${sub1? `<@${sub1}> (${findPlayerNick(lineupPlayers, sub1)})`: ''}${sub2? `, <@${sub2}> (${findPlayerNick(lineupPlayers, sub2)})`: ''}${sub3? `, <@${sub3}> (${findPlayerNick(lineupPlayers, sub3)})`: ''}${sub4? `, <@${sub4}> (${findPlayerNick(lineupPlayers, sub4)})`: ''}${sub5? `, <@${sub5}> (${findPlayerNick(lineupPlayers, sub5)})`: ''}`,
        "inline": false
      })
  }
  if(teamIcon){
    lineupEmbed.author.icon_url = teamIcon
  }
  return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { embeds : [lineupEmbed]}
  })
}

const lineupSelections = async(commandOptions) => 
  handleSubCommands(commandOptions, wcLineupSubCommands)

const lineupClub = async (commandOptions) => 
  handleSubCommands(commandOptions, clubLineupSubCommands)

const interLineup = async ({options, guild_id, token, application_id, callerId, member, channel_id, dbClient}) => {
  const lineup = optionsToObject(options)
  const allPlayers = await getAllPlayers(guild_id)
  let forbiddenUsersList = []
  let objLineup = Object.fromEntries(
    Object.entries(lineup)
      .filter(([name])=> !nonLineupAttributes.includes(name))
      .map(([name, value])=> {
        const discPlayer = allPlayers.find(player=> player?.user?.id === value)
        if(isServerSupported(guild_id) && isLineupChannel(guild_id, channel_id)) {
          const response = verifyWCLineup(discPlayer, value)
          if(response.message) {
            forbiddenUsersList.push(response.message)
          }
        }
        return [name, {id: value, name: getPlayerNick(discPlayer), registered: discPlayer.roles.includes(getRegisteredRole(guild_id))}]
      })
  )
  if(forbiddenUsersList.length>0) {
    const content = `<@${callerId}> can't post this lineup, restricted users: ${forbiddenUsersList.join(', ')}`
    await postMessage({channel_id, content})
    return updateResponse({application_id, token, content})
  }
  const {content, components} = await saveLineup({dbClient, lineup, callerId, objLineup, member, guild_id, edit:false, isInternational:true, channel_id, isEightPlayers: true})
  return updateResponse({application_id, token, content, components})
}

const wcLineupSubCommands = {
  'a': interLineup,
  'b' : interLineup,
  'c': interLineup,
}

const clubLineupSubCommands = {
  'a': lineup,
  'b': lineup,
  'c': lineup,
}
const lineupCmd = {
  name: 'lineup',
  description: 'Create a lineup for your team',
  type: 1,
  app: true,
  func: eightLineup,
  options: [{
    type: 6,
    name: 'gk',
    description: 'GK',
    required: true
  },{
    type: 6,
    name: 'lb',
    description: 'LB',
    required: true
  },{
    type: 6,
    name: 'rb',
    description: 'RB',
    required: true
  },{
    type: 6,
    name: 'cm',
    description: 'CM',
    required: true
  },{
    type: 6,
    name: 'lw',
    description: 'LW',
    required: true
  },{
    type: 6,
    name: 'rw',
    description: 'RW',
    required: true
  },{
    type: 6,
    name: 'sub1',
    description: 'Sub1'
  },{
    type: 6,
    name: 'sub2',
    description: 'Sub2'
  },{
    type: 6,
    name: 'sub3',
    description: 'Sub3'
  },{
    type: 6,
    name: 'sub4',
    description: 'Sub4'
  },{
    type: 6,
    name: 'sub5',
    description: 'Sub5'
  }, {
    type: 3,
    name: 'vs',
    description: 'Against'
  }]
}

const boxLineupcmd = {...lineupCmd, name: 'boxlineup'}
const internationalLineupCmd = {...lineupCmd, name: 'interlineup'}
/*export const editLineupCmd = {
  name: 'lineupedit',
  description: 'Edit a saved lineup for your team',
  type: 1,
  options: lineupCmd.options.map(option=> ({...option, required: false}))
}*/
const eightLineupCmd = {
  name: 'eightlineup',
  description: 'Create a 8v8 lineup for your team',
  type: 1,
  app: true,
  func: eightLineup,
  options: [{
    type: 6,
    name: 'gk',
    description: 'GK',
    required: true
  },{
    type: 6,
    name: 'lb',
    description: 'LB',
    required: true
  },{
    type: 6,
    name: 'cb',
    description: 'CB',
    required: true
  },{
    type: 6,
    name: 'rb',
    description: 'RB',
    required: true
  },{
    type: 6,
    name: 'lcm',
    description: 'LCM',
    required: true
  },{
    type: 6,
    name: 'rcm',
    description: 'RCM',
    required: true
  },{
    type: 6,
    name: 'lst',
    description: 'LST',
    required: true
  },{
    type: 6,
    name: 'rst',
    description: 'RST',
    required: true
  },{
    type: 6,
    name: 'sub1',
    description: 'Sub1'
  },{
    type: 6,
    name: 'sub2',
    description: 'Sub2'
  },{
    type: 6,
    name: 'sub3',
    description: 'Sub3'
  },{
    type: 6,
    name: 'sub4',
    description: 'Sub4'
  },{
    type: 6,
    name: 'sub5',
    description: 'Sub5'
  },{
    type: 6,
    name: 'sub6',
    description: 'Sub6'
  }, {
    type: 3,
    name: 'vs',
    description: 'Against'
  }]
}

const wcLineupCmd = {
  name: 'wclineup',
  description: 'Lineup for a World cup match',
  type: 1,
  psaf: true,
  wc: true,
  func: lineupSelections,
  options: [{
    type: 1,
    name: 'a',
    description: '3-3-2 Lineup',
    options: [{
      type: 6,
      name: 'gk',
      description: 'GK',
      required: true
    },{
      type: 6,
      name: 'lb',
      description: 'LB',
      required: true
    },{
      type: 6,
      name: 'cb',
      description: 'CB',
      required: true
    },{
      type: 6,
      name: 'rb',
      description: 'RB',
      required: true
    },{
      type: 6,
      name: 'lcm',
      description: 'LCM',
      required: true
    },{
      type: 6,
      name: 'rcm',
      description: 'RCM',
      required: true
    },{
      type: 6,
      name: 'lst',
      description: 'LST',
      required: true
    },{
      type: 6,
      name: 'rst',
      description: 'RST',
      required: true
    },{
      type: 6,
      name: 'sub1',
      description: 'Sub1'
    },{
      type: 6,
      name: 'sub2',
      description: 'Sub2'
    },{
      type: 6,
      name: 'sub3',
      description: 'Sub3'
    },{
      type: 6,
      name: 'sub4',
      description: 'Sub4'
    },{
      type: 6,
      name: 'sub5',
      description: 'Sub5'
    },{
      type: 6,
      name: 'sub6',
      description: 'Sub6'
    }, {
      type: 3,
      name: 'vs',
      description: 'Against'
    }]
  },{
    type: 1,
    name: 'b',
    description: 'A 3-1-3 lineup',
    options: [{
      type: 6,
      name: 'gk',
      description: 'GK',
      required: true
    },{
      type: 6,
      name: 'lb',
      description: 'LB',
      required: true
    },{
      type: 6,
      name: 'cb',
      description: 'CB',
      required: true
    },{
      type: 6,
      name: 'rb',
      description: 'RB',
      required: true
    },{
      type: 6,
      name: 'cm',
      description: 'CM',
      required: true
    },{
      type: 6,
      name: 'lw',
      description: 'LW',
      required: true
    },{
      type: 6,
      name: 'st',
      description: 'ST',
      required: true
    },{
      type: 6,
      name: 'rw',
      description: 'RW',
      required: true
    },{
      type: 6,
      name: 'sub1',
      description: 'Sub1'
    },{
      type: 6,
      name: 'sub2',
      description: 'Sub2'
    },{
      type: 6,
      name: 'sub3',
      description: 'Sub3'
    },{
      type: 6,
      name: 'sub4',
      description: 'Sub4'
    },{
      type: 6,
      name: 'sub5',
      description: 'Sub5'
    },{
      type: 6,
      name: 'sub6',
      description: 'Sub6'
    }, {
      type: 3,
      name: 'vs',
      description: 'Against'
    }]
  },{
    type: 1,
    name: 'c',
    description: 'a 4-1-2 lineup',
    options: [{
      type: 6,
      name: 'gk',
      description: 'GK',
      required: true
    },{
      type: 6,
      name: 'lb',
      description: 'LB',
      required: true
    },{
      type: 6,
      name: 'lcb',
      description: 'LCB',
      required: true
    },{
      type: 6,
      name: 'rcb',
      description: 'RCB',
      required: true
    },{
      type: 6,
      name: 'rb',
      description: 'RB',
      required: true
    },{
      type: 6,
      name: 'cm',
      description: 'CM',
      required: true
    },{
      type: 6,
      name: 'lst',
      description: 'LST',
      required: true
    },{
      type: 6,
      name: 'rst',
      description: 'RST',
      required: true
    },{
      type: 6,
      name: 'sub1',
      description: 'Sub1'
    },{
      type: 6,
      name: 'sub2',
      description: 'Sub2'
    },{
      type: 6,
      name: 'sub3',
      description: 'Sub3'
    },{
      type: 6,
      name: 'sub4',
      description: 'Sub4'
    },{
      type: 6,
      name: 'sub5',
      description: 'Sub5'
    },{
      type: 6,
      name: 'sub6',
      description: 'Sub6'
    }, {
      type: 3,
      name: 'vs',
      description: 'Against'
    }]
  }]
}
const startingSix = {
  name: 'startingsix',
  description: 'Lineup for a 6v6 match',
  type: 1,
  app: true,
  func: lineupClub,
  options: [{
    type: 1,
    name: 'a',
    description: '2-1-2 Lineup',
    options: [{
      type: 6,
      name: 'gk',
      description: 'GK',
      required: true
    },{
      type: 6,
      name: 'lb',
      description: 'LB',
      required: true
    },{
      type: 6,
      name: 'rb',
      description: 'RB',
      required: true
    },{
      type: 6,
      name: 'cm',
      description: 'CM',
      required: true
    },{
      type: 6,
      name: 'lw',
      description: 'LW',
      required: true
    },{
      type: 6,
      name: 'rw',
      description: 'RW',
      required: true
    },{
      type: 6,
      name: 'sub1',
      description: 'Sub1'
    },{
      type: 6,
      name: 'sub2',
      description: 'Sub2'
    },{
      type: 6,
      name: 'sub3',
      description: 'Sub3'
    },{
      type: 6,
      name: 'sub4',
      description: 'Sub4'
    },{
      type: 6,
      name: 'sub5',
      description: 'Sub5'
    }, {
      type: 3,
      name: 'vs',
      description: 'Against'
    }]
  },{
    type: 1,
    name: 'b',
    description: 'A 2-3 lineup',
    options: [{
      type: 6,
      name: 'gk',
      description: 'GK',
      required: true
    },{
      type: 6,
      name: 'lb',
      description: 'LB',
      required: true
    },{
      type: 6,
      name: 'rb',
      description: 'RB',
      required: true
    },{
      type: 6,
      name: 'lw',
      description: 'LW',
      required: true
    },{
      type: 6,
      name: 'st',
      description: 'ST',
      required: true
    },{
      type: 6,
      name: 'rw',
      description: 'RW',
      required: true
    },{
      type: 6,
      name: 'sub1',
      description: 'Sub1'
    },{
      type: 6,
      name: 'sub2',
      description: 'Sub2'
    },{
      type: 6,
      name: 'sub3',
      description: 'Sub3'
    },{
      type: 6,
      name: 'sub4',
      description: 'Sub4'
    },{
      type: 6,
      name: 'sub5',
      description: 'Sub5'
    }, {
      type: 3,
      name: 'vs',
      description: 'Against'
    }]
  },{
    type: 1,
    name: 'c',
    description: 'a 3-2 lineup',
    options: [{
      type: 6,
      name: 'gk',
      description: 'GK',
      required: true
    },{
      type: 6,
      name: 'lb',
      description: 'LB',
      required: true
    },{
      type: 6,
      name: 'cb',
      description: 'CB',
      required: true
    },{
      type: 6,
      name: 'rb',
      description: 'RB',
      required: true
    },{
      type: 6,
      name: 'lf',
      description: 'LF',
      required: true
    },{
      type: 6,
      name: 'rf',
      description: 'RF',
      required: true
    },{
      type: 6,
      name: 'sub1',
      description: 'Sub1'
    },{
      type: 6,
      name: 'sub2',
      description: 'Sub2'
    },{
      type: 6,
      name: 'sub3',
      description: 'Sub3'
    },{
      type: 6,
      name: 'sub4',
      description: 'Sub4'
    },{
      type: 6,
      name: 'sub5',
      description: 'Sub5'
    }, {
      type: 3,
      name: 'vs',
      description: 'Against'
    }]
  }]
}

const startingEight = {
  name: 'startingeight',
  description: 'Your 8v8 club lineup',
  func: lineupClub,
  app: true,
  options: wcLineupCmd.options
}

export default [wcLineupCmd, startingSix, startingEight, lineupCmd, boxLineupcmd, eightLineupCmd, internationalLineupCmd]