import {
  InteractionResponseType,
} from 'discord-interactions';
import { getPlayerTeam, getPlayerNick, optionsToObject, msToTimestamp, genericFormatMatch } from '../functions/helpers.js';
import { getAllPlayers } from '../functions/playersCache.js';

export const formatDMLineup = ({gk, lb, rb, cm, lw, rw, sub1, sub2, sub3, sub4, sub5}) => {
  let response = `**GK:** ${gk.name} (<@${gk.id}>)\r`;
  response += `**LB:** ${lb.name} (<@${lb.id}>)\r`;
  response += `**RB:** ${rb.name} (<@${rb.id}>)\r`;
  response += `**CM:** ${cm.name} (<@${cm.id}>)\r`;
  response += `**LW:** ${lw.name} (<@${lw.id}>)\r`;
  response += `**RW:** ${rw.name} (<@${rw.id}>)`;
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

export const formatLineup = ({gk, lb, rb, cm, lw, rw, sub1, sub2, sub3, sub4, sub5}) => {
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

export const lineup = async({options, res, member, guild_id, dbClient}) => {
  const {gk, lb, rb, cm, lw, rw, sub1, sub2, sub3, sub4, sub5, vs} = Object.fromEntries(options.map(({name, value})=> [name, value]))
  let playerTeam = ''
  if(process.env.GUILD_ID === guild_id) {  
    const startOfDay = new Date()
    startOfDay.setUTCHours(startOfDay.getHours()-1,0,0,0)
    const endOfDay = new Date()
    endOfDay.setUTCHours(23,59,59,999)
    const startDateTimestamp = msToTimestamp(Date.parse(startOfDay))
    const endDateTimestamp = msToTimestamp(Date.parse(endOfDay))
    await dbClient(async ({teams, matches, lineups})=>{
      const memberTeam = await getPlayerTeam(member, teams)
      const nextMatches = await matches.find({dateTimestamp: { $gt: startDateTimestamp, $lt: endDateTimestamp}, finished: {$in: [false, null]}, $or: [{home: memberTeam.id}, {away: memberTeam.id}]}).sort({dateTimestamp:1}).toArray()
      const nextMatch = nextMatches[0]
      if(nextMatch) {
        const teamsOfMatch = await teams.find({active: true, $or:[{id:nextMatch.home}, {id:nextMatch.away}]}).toArray()
        playerTeam = genericFormatMatch(teamsOfMatch, nextMatch) + '\r'
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
      playerTeam += memberTeam.emoji+' ' + memberTeam.name +' '
    })
  }
  let response = `${playerTeam}lineup ${vs? `vs ${vs}`: ''}\r`
  response += formatLineup({gk, lb, rb, cm, lw, rw, sub1, sub2, sub3, sub4, sub5})
  
  return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content : response }
  })
}

export const internationalLineup = async ({options, res, callerId, guild_id, dbClient}) => {
  const {gk, lb, rb, cm, lw, rw, sub1, sub2, sub3, sub4, sub5, vs} = Object.fromEntries(options.map(({name, value})=> [name, value]))
  let playerCountry = {}
  if(process.env.GUILD_ID === guild_id) {
    await dbClient(async ({players, nationalities})=>{
      const dbPlayer = await players.findOne({id: callerId})
      playerCountry = await nationalities.findOne({name: dbPlayer?.nat1})
    })
  }
  let response = ''
  if(playerCountry?.name) {
    response = `${playerCountry?.flag} ${playerCountry?.name} lineup ${vs? `vs ${vs}`: ''}\r`
  } else {
    response = `Lineup ${vs? `vs ${vs}`: ''}\r`
  }
  response += formatLineup({gk, lb, rb, cm, lw, rw, sub1, sub2, sub3, sub4, sub5})
  
  return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content : response }
  })
}

export const eightLineup = async ({options, res, member, guild_id, dbClient}) => {
  const {gk, lb, cb, rb, lcm, rcm, lst, rst, sub1, sub2, sub3, sub4, sub5, sub6, vs} = optionsToObject(options)
  let playerTeam = ''
  if(process.env.GUILD_ID === guild_id) {
    await dbClient(async ({teams})=>{            
      const memberTeam = await getPlayerTeam(member, teams)
      playerTeam = memberTeam.emoji+' ' + memberTeam.name +' '
    })
  }
  let response = `${playerTeam}lineup ${vs? `vs ${vs}`: ''}\r`
  response += `GK: <@${gk}>\r`;
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
  if(sub6) {
    response += `, <@${sub6}>`;
  }
  
  return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content : response }
  })
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
    startOfDay.setUTCHours(startOfDay.getHours()-1,0,0,0)
    const endOfDay = new Date()
    endOfDay.setUTCHours(23,59,59,999)
    const startDateTimestamp = msToTimestamp(Date.parse(startOfDay))
    const endDateTimestamp = msToTimestamp(Date.parse(endOfDay))
    await dbClient(async ({teams, matches, lineups})=>{
      const memberTeam = await getPlayerTeam(member, teams)
      const nextMatches = await matches.find({dateTimestamp: { $gt: startDateTimestamp, $lt: endDateTimestamp}, finished: {$in: [false, null]}, $or: [{home: memberTeam.id}, {away: memberTeam.id}]}).sort({dateTimestamp:1}).toArray()
      const nextMatch = nextMatches[0]
      if(nextMatch) {
        const teamsOfMatch = await teams.find({active: true, $or:[{id:nextMatch.home}, {id:nextMatch.away}]}).toArray()
        playerTeam = genericFormatMatch(teamsOfMatch, nextMatch) + '\r'
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


export const lineupCmd = {
  name: 'lineup',
  description: 'Create a lineup for your team',
  type: 1,
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

export const boxLineupcmd = {...lineupCmd, name: 'boxlineup'}
export const internationalLineupCmd = {...lineupCmd, name: 'interlineup'}
export const eightLineupCmd = {
  name: 'eightlineup',
  description: 'Create a 8v8 lineup for your team',
  type: 1,
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
