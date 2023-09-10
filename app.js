import 'dotenv/config';
import express from 'express';
import http from 'http';
import https from 'https';
import fs from 'fs';
import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  MessageComponentTypes,
  ButtonStyleTypes,
} from 'discord-interactions';
import { MongoClient, ServerApiVersion } from 'mongodb';
import { VerifyDiscordRequest, DiscordRequest } from './utils.js';
import mongoClient from './functions/mongoClient.js';
import { now } from './commands/now.js';
import { timestamp } from './commands/timestamp.js';

const keyPath = process.env.CERTKEY;
const certPath = process.env.CERT;
let online = false;
if(fs.existsSync(keyPath)&& fs.existsSync(certPath)){
  online = true
}

const mongu = encodeURIComponent(process.env.MONGU)
const mongp = encodeURIComponent(process.env.MONGP)
const uri = `mongodb+srv://${mongu}:${mongp}@psoteams.gmopjmu.mongodb.net/?retryWrites=true&w=majority&ssl=true`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
const dbClient = mongoClient(client)
let credentials = {}

const clubPlayerRole = '1072620805600592062'
const webHookDetails = process.env.WEBHOOK

if(online){
  const privateKey  = fs.readFileSync(keyPath, 'utf8');
  const certificate = fs.readFileSync(certPath, 'utf8');
  credentials = {key: privateKey, cert: certificate};
}

const isPSAF = (guild_id) => guild_id === process.env.GUILD_ID

const msToTimestamp = (ms) => {
  const msAsString = ms.toString();
  return msAsString.substring(0, msAsString.length - 3);
}

const optionToTimezoneStr = (option = 0) => {
  const today = new Date()
  switch (option) {
    case 1:
      return "CET";
    case 2:
      return "EEST";
    default:
      return "BST";
  }
}
const getPlayerNick = (player) => 
  player.nick || player.user.global_name || player.user.username

const removePlayerPrefix = (teamShortName, playerName) => {
  const teamPrefixToRemove = `${teamShortName} | `
  const indexTeamPrefix = playerName.indexOf(teamPrefixToRemove)
  let updatedPlayerName = `${playerName}`
  if(indexTeamPrefix>=0) {
    updatedPlayerName = `${playerName.substring(0,indexTeamPrefix)}${playerName.substring(indexTeamPrefix+teamPrefixToRemove.length)}`
  }
  return updatedPlayerName
}

const addPlayerPrefix = (teamShortName, playerName) => {
  return `${teamShortName} | ${playerName}`
}

const getTeamsCollection = async () => {
  await client.connect();
  const psoTeams = client.db("PSOTeamManager");
  return psoTeams.collection("Teams");
}

const getPlayerTeam = (player, teams) => 
  teams.findOne({active:true, $or:player.roles.map(role=>({id:role}))})

const displayTeam = (team) => (
  `Team: ${team.flag} ${team.emoji} ${team.name} - ${team.shortName}` +
  `\rBudget: ${new Intl.NumberFormat('en-US').format(team.budget)}` +
  `\rCity: ${team.city}` +
  `\rPalmarès: ${team.description}`
)

function start() {
  // Create an express app
  const app = express();
  // Get port, or default
  const PORT = (online ? process.env.PORT : process.env.LOCALPORT) || 8080;
  const PORTHTTPS = process.env.PORTHTTPS || 8443;
  // Parse request body and verifies incoming requests using discord-interactions package
  app.use(express.json({ verify: VerifyDiscordRequest(process.env.PUBLIC_KEY) }));


  app.get('/', async function (req, res) {
    return res.send('<p>no thank you</p>')
  })
  /**
   * Interactions endpoint URL where Discord will send HTTP requests
   */
  app.post('/interactions', async function (req, res) {
    // Interaction type and data
    const { type, member, id:interaction_id, token, data, guild_id } = req.body;

    const callerId = member?.user?.id

    try {
      if (type === InteractionType.PING) {
        return res.send({ type: InteractionResponseType.PONG });
      }

      if (type === InteractionType.APPLICATION_COMMAND) {
        const { id, name, options, target_id } = data;

        if (name === 'help') {
          let responseLines = ['**/now**: Gives you privately a timestamp representing the current time, plus its code (<t:XXXXX:F>) with extra spaces for copy pasting.',
            '**/timestamp** *date* *timezone*: Gives you privately a timestamp for the date of your choice. Can be "Tomorrow 5PM", "Friday 14:32" etc... ',
            'Careful as the dates are american style, 06/08 is the 8th of June. The timezone attribute is your own timezone  (UK, Central Europe or Turkey) to help the bot generate an accurate time.',
            '**/lineup** *gk*... : Posts a lineup with up to 5 subs. You can also name your opponent by filling the attribute *vs*',
            `${isPSAF(guild_id) ? 'On the PSAF server, your own team name will be prefilled' :''}`,
            '**/boxlineup** *gk*... : Same as **/lineup** but the lineup is sent in a box with better formatting',
            `${isPSAF(guild_id) ? 'On the PSAF server, your own team name will be prefilled, and the box\'s shade will be the colour of your team.' :''}`
          ]
          if(isPSAF(guild_id)){
            const psafCommandLines = [
              '**/team** *team* : List a team\'s details, such as name and budget. Leave *team* empty for details on your own team.',
              '**/players** *team* : List players registered for a team. Leave *team* empty for your own list of players',
            ]
            responseLines = responseLines.concat(psafCommandLines)
          }
          const response = responseLines.join('\r')
          const helpEmbed = {
            "type": "rich",
            "color": 16777215,
            "title": "PSO Team Manager Commands",
            "description": response,
          }
          return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
            method: 'POST',
            body: {
              type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: { embeds : [helpEmbed]},
              flags: 1 << 6
            }
          })
        }

        if (name === 'now') {
          return now({interaction_id, token})
        }
        if (name === "timestamp") {
          return timestamp({interaction_id, token, options})
        }

        if(name === "boxlineup"){
          const {gk, lb, rb, cm, lw, rw, sub1, sub2, sub3, sub4, sub5, vs} = Object.fromEntries(options.map(({name, value})=> [name, value]))
          let playerTeam = ''
          let embedColor = 16777215
          let teamIcon = ''
          if(process.env.GUILD_ID === guild_id) {
            await dbClient(async ({teams})=>{            
              const memberTeam = await getPlayerTeam(member, teams)
              playerTeam = memberTeam.name +' '
              embedColor = memberTeam.color
              teamIcon = `https://cdn.discordapp.com/role-icons/${memberTeam.id}/${memberTeam.icon}.png`
            })
          }
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
                "value": `<@${lw}>`,
                "inline": true
              },
              {
                "name": " ",
                "value": "",
                "inline": true
              },
              {
                "name": "RW:",
                "value": `<@${rw}>`,
                "inline": true
              },
              {
                "name": " ",
                "value": "",
                "inline": true
              },
              {
                "name": "CM",
                "value": `<@${cm}>`,
                "inline": true
              },
              {
                "name": " ",
                "value": "",
                "inline": true
              },
              {
                "name": "LB",
                "value": `<@${lb}>`,
                "inline": true
              },
              {
                "name": " ",
                "value": "",
                "inline": true
              },
              {
                "name": "RB",
                "value": `<@${rb}>`,
                "inline": true
              },
              {
                "name": " ",
                "value": "",
                "inline": true
              },
              {
                "name": "GK",
                "value": `<@${gk}>`,
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
                "value": `${sub1? `<@${sub1}>`: ''}${sub2? `, <@${sub2}>`: ''}${sub3? `, <@${sub3}>`: ''}${sub4? `, <@${sub4}>`: ''}${sub5? `, <@${sub5}>`: ''}`,
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

        if(name === "lineup") {
          const {gk, lb, rb, cm, lw, rw, sub1, sub2, sub3, sub4, sub5, vs} = Object.fromEntries(options.map(({name, value})=> [name, value]))
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
          response += `RB: <@${rb}>\r`;
          response += `CM: <@${cm}>\r`;
          response += `LW: <@${lw}>\r`;
          response += `RW: <@${rw}>`;
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
          
          return res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content : response }
          })
        }

        if(process.env.GUILD_ID === guild_id) {

          if (name === "team") {
            let response = "No teams found"
            const [role] = options || []
            let roles = []
            if(!role) {
              roles = member.roles.map(role=>({id:role}))
            } else {
              roles = [{id: role.value}]
            }
            await dbClient(async (client, {teams})=>{            
              const team = await teams.findOne({active:true, $or:roles})
              response = displayTeam(team)
            })
          
            return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
              method: 'POST',
              body: {
                type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  content: response,
                  flags: 1 << 6
                }
              }
            })
          }

          if(name === "teams") {
            let teamsResponse = []
            try {
              const teams = await getTeamsCollection();
              const query = {active: true}
              if ((await teams.countDocuments(query)) === 0) {
                teamsResponse = ["No teams found !"]
              } else {
                let currentResponse = ''
                const allTeams = teams.find(query)
                let i=0
                for await (const team of allTeams) {
                  if(i>5) {
                    teamsResponse.push(currentResponse)
                    i=0
                    currentResponse =''
                  }
                  currentResponse += displayTeam(team) + '\r'
                  i++
                }
              }
            } finally {
              // Ensures that the client will close when you finish/error
              await client.close();
            }
            const teamsEmbed = teamsResponse.map(teamResponse => ({
              "type": "rich",
              "color": 16777215,
              "title": "PSAF Teams",
              "description": teamResponse,
            }))
            return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
              method: 'POST',
              body: {
                type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { embeds : teamsEmbed},
                flags: 1 << 6
              }
            })
          }

          if (name === "transfer") {
            let response = "No transfer happened"
            const [playeroption, role, desc] = options
            try {
              const teams = await getTeamsCollection();
              const [team, playerResp] = await Promise.all([
                teams.findOne({id: role.value}),
                DiscordRequest(`/guilds/${guild_id}/members/${playeroption.value}`, {})
              ])
              const player = await playerResp.json();
              const playerName = getPlayerNick(player);
              const updatedPlayerName = addPlayerPrefix(team.shortName, playerName)
              const payload= {
                nick: updatedPlayerName,
                roles: [...player.roles.filter(role => role !==clubPlayerRole), role.value, clubPlayerRole]
              }
              await DiscordRequest(`guilds/${guild_id}/members/${playeroption.value}`, {
                method: 'PATCH',
                body: payload
              })
            
              const log = `<@${player.user.id}> joined <@&${team.id}>${desc?.value ? `\r${desc.value}\r`: ' '}(from <@${callerId}>)`
              response = log
              await DiscordRequest(webHookDetails, {
                method: 'POST',
                body: {
                  content: log
                }
              })
            } finally {
              // Ensures that the client will close when you finish/error
              await client.close();
            }
            return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
              method: 'POST',
              body: {
                type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  content: response,
                  flags: 1 << 6
                }
              }
            })
          }

          if(name === "teamtransfer") {
            let response = "No transfer happened"
            const [playeroption, roleTo, amount, reason] = options

            try {
              const teams = await getTeamsCollection();
              const [teamTo, playerResp] = await Promise.all([
                teams.findOne({id: roleTo.value}),
                DiscordRequest(`/guilds/${guild_id}/members/${playeroption.value}`, {})
              ])
              const player = await playerResp.json();
              const teamFrom = await teams.findOne({active:true, $or:player.roles.map(role=>({id:role}))})
              const playerName = player.nick
              
              const updatedPlayerName = addPlayerPrefix(teamTo.shortName, removePlayerPrefix(teamFrom.shortName, playerName))
              const payload= {
                nick: updatedPlayerName,
                roles: [...new Set([...player.roles.filter(role => role!==teamFrom.id), roleTo.value, clubPlayerRole])]
              }
              Promise.all([
                await DiscordRequest(`guilds/${guild_id}/members/${playeroption.value}`, {
                  method: 'PATCH',
                  body: payload
                }),
                teams.updateOne({id: teamTo.id}, {$set: {budget: teamTo.budget-amount.value}}),
                teams.updateOne({id: teamFrom.id}, {$set: {budget: teamFrom.budget+amount.value}}),
              ])
              const log = `<@${player.user.id}> left <@&${teamFrom.id}> joined <@&${teamTo.id}> for ${new Intl.NumberFormat('en-US').format(amount.value)} EBits${reason?.value ? `\r${reason.value}\r`: ' '}(from <@${callerId}>)`
              response = log
              await DiscordRequest(webHookDetails, {
                method: 'POST',
                body: {
                  content: log
                }
              })
            } finally {
              // Ensures that the client will close when you finish/error
              await client.close();
            }
            return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
              method: 'POST',
              body: {
                type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  content: response,
                  flags: 1 << 6
                }
              }
            })
          }

          if(name === "freeplayer") {
            let response = "No transfer happened"
            const [playeroption, role] = options
            try {
              const teams = await getTeamsCollection();
              const [team, playerResp] = await Promise.all([
                teams.findOne({id: role.value}),
                DiscordRequest(`/guilds/${guild_id}/members/${playeroption.value}`)
              ])
              const player = await playerResp.json();
              const playerName = player.nick || player.user.global_name || player.user.username
              const teamPrefixToRemove = `${team.shortName} |`
              const indexTeamPrefix = playerName.indexOf(teamPrefixToRemove)
              let updatedPlayerName = `${playerName}`
              if(indexTeamPrefix>=0) {
                updatedPlayerName = `${playerName.substring(0,indexTeamPrefix)}${playerName.substring(indexTeamPrefix+teamPrefixToRemove.length)}`
              }
              
              const payload= {
                nick: updatedPlayerName,
                roles: player.roles.filter(playerRole=> playerRole.includes(role.value, '1072620805600592062'))
              }
              await DiscordRequest(`guilds/${guild_id}/members/${playeroption.value}`, {
                method: 'PATCH',
                body: payload
              })
              const log = `<@${player.user.id}> released from <@&${team.id}> (from <@${callerId}>)`
              response = log
              await DiscordRequest(webHookDetails, {
                method: 'POST',
                body: {
                  content: log
                }
              })
            } finally {
              await client.close();
            }
            return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
              method: 'POST',
              body: {
                type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  content: response,
                  flags: 1 << 6
                }
              }
            })

          }

          if (name === "fine") {
            let response = "Nothing happened"
            const {team, amount, reason} = Object.fromEntries(options.map(({name, value})=> ([name, value])))
            
            try {
              const teams = await getTeamsCollection();
              const teamObj = await teams.findOne({id: team, active:true})
              const previousBudget = teamObj.budget
              const newBudget = previousBudget - Number(amount)
              await teams.updateOne({id: team}, {$set: {budget: newBudget}})
              const log = `<@&${team}> has been fined ${new Intl.NumberFormat('en-US').format(amount)} EBits${reason ? `\rReason: ${reason}\r`: ''} (from <@${callerId}>)`
              response = log
              await DiscordRequest(webHookDetails, {
                method: 'POST',
                body: {
                  content: log
                }
              })
            } finally {
              await client.close();
            }
            return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
              method: 'POST',
              body: {
                type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  content: response,
                  flags: 1 << 6
                }
              }
            })
          }
          
          if (name === "bonus") {
            let response = "Nothing happened"
            const {team, amount, reason} = Object.fromEntries(options.map(({name, value})=> ([name, value])))
            
            try {
              const teams = await getTeamsCollection();
              const teamObj = await teams.findOne({id: team, active:true})
              const previousBudget = teamObj.budget
              const newBudget = previousBudget + Number(amount)
              await teams.updateOne({id: team}, {$set: {budget: newBudget}})
              const log = `<@&${team}> has received ${new Intl.NumberFormat('en-US').format(amount)} EBits${reason ? `\rReason: ${reason}\r`: ''} (from <@${callerId}>)`
              response = log
              await DiscordRequest(webHookDetails, {
                method: 'POST',
                body: {
                  content: log
                }
              })
            } finally {
              await client.close();
            }
            return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
              method: 'POST',
              body: {
                type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  content: response,
                  flags: 1 << 6
                }
              }
            })
          }

          if (name === "initteam") {
            const rolesResp = await DiscordRequest(`/guilds/${guild_id}/roles`, {})
            const roles = await rolesResp.json()
            
            let response = "Failed to insert teams"
            try {
              const teams = await getTeamsCollection();
              const team = await teams.insertMany(roles.map(role => (
                {
                  ...role,
                  active: false,
                  shortName: "",
                  displayName: "",
                  budget: 0,
                  city: ""
                })), {ordered: true})
              response = `${roles.length} teams inserted`
            } finally {
              await client.close();
            }
            return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
              method: 'POST',
              body: {
                type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  content: response,
                  flags: 1 << 6
                }
              }
            })
          }

          if (name==="editteam") {
            let response = "No teams found"
            const {team, palmares, emoji, city, flag} = Object.fromEntries(options.map(({name, value})=> [name, value]))
            const roles = [{id: team}]
            try {
              const teams = await getTeamsCollection();
              const team = await teams.findOne({active:true, $or:roles})
              const payload = {
                description: palmares || team.description,
                emoji: emoji || team.emoji,
                city: city || team.emoji,
                flag: flag || team.flag
              }
              teams.updateOne({id: team.id}, {$set: payload})
              const updatedTeam = await teams.findOne({active:true, id:team.id})
              response = displayTeam(updatedTeam)
            } finally {
              // Ensures that the client will close when you finish/error
              await client.close();
            }
          
            return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
              method: 'POST',
              body: {
                type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  content: response,
                  flags: 1 << 6
                }
              }
            })
          }

          if (name === "players") {
            const [role] = options || []
            let roles = []
            let response = "No team found"
            if(!role) {
              roles = member.roles.map(role=>({id:role}))
            } else {
              roles = [{id: role.value}]
            }
            let teamToList = ''
            const playersResp = await DiscordRequest(`/guilds/${guild_id}/members?limit=1000`, { method: 'GET' })
            const players1 = await playersResp.json()
            let players = []
            if(players1.size === 1000) {
              const playersResp2 = await DiscordRequest(`/guilds/${guild_id}/members?limit=1000&after=${players1[players1.length-1].user.id}`, { method: 'GET' })
              const player2 = await playersResp2.json()
              players = players1.concat(player2)
            }
            else {
              players = players1
            }
            try {
              const teams = await getTeamsCollection();
              const team = await teams.findOne({active:true, $or:roles})
              teamToList = team.id
            } finally {
              // Ensures that the client will close when you finish/error
              await client.close();
            }
            const rolePlayers = players.filter((player) => player.roles.includes(teamToList))
            const teamPlayers = [...new Set(rolePlayers)]
            response = `Players: \r${teamPlayers.map(({ user, nick }) => `<@${user.id}>`).join('\r')}`
            return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
              method: 'POST',
              body: {
                type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  content: response,
                  flags: 1 << 6
                }
              }
            })
          }
        }
      }
    }
    catch(e) {
      console.error(e)
    }
    return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
      method: 'POST',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'Failed to process the command.',
          flags: 1 << 6
        }
      }
    })
  });


  var httpServer = http.createServer(app);
  httpServer.listen(PORT, async ()=> {
    console.log('Listening http on port', PORT);
    if(!online){
      try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        await client.db("PSOTeams").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
      } finally {
        // Ensures that the client will close when you finish/error
        await client.close();
      }
    }
  });
  if(online) {
    var httpsServer = https.createServer(credentials, app);
    httpsServer.listen(PORTHTTPS, async ()=>{
      console.log('Listening https on port', PORTHTTPS);
      try {
        // Connect the client to the server	(optional starting in v4.7)
        console.log("connecting to Mongo...")
        await client.connect();
        console.log("connecting to DB...")
        // Send a ping to confirm a successful connection
        await client.db("PSOTeams").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
      }
      catch(e){
        console.error(e)
      } finally {
        // Ensures that the client will close when you finish/error
        await client.close();
      }
    });
  }
}

start()