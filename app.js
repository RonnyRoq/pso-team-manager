import 'dotenv/config';
import express from 'express';
import http from 'http';
import https from 'https';
import fs from 'fs';
import {
  InteractionType,
  InteractionResponseType
} from 'discord-interactions';
import { MongoClient, ServerApiVersion } from 'mongodb';
import { CronJob } from 'cron';
import { VerifyDiscordRequest, DiscordRequest } from './utils.js';
import mongoClient from './functions/mongoClient.js';
import { now } from './commands/now.js';
import { timestamp } from './commands/timestamp.js';
import { help } from './commands/help.js';
import { boxLineup, lineup } from './commands/lineup.js';
import { allPlayers, autoCompleteNation, editPlayer, player, players } from './commands/player.js';
import { team } from './commands/team.js';
import { editMatch, endMatch, getMatchesOfDay, match, matchId, matches, publishMatch } from './commands/match.js';
import { initCountries, systemTeam } from './commands/system.js';
import { editTeam } from './commands/editTeam.js';
import { addSelection, allNationalTeams, nationalTeam, postNationalTeams, removeSelection } from './commands/nationalTeam.js';
import { addPlayerPrefix, removePlayerPrefix } from './functions/helpers.js';

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
const matchesWebhook = process.env.MATCHESWEBOOK

if(online){
  const privateKey  = fs.readFileSync(keyPath, 'utf8');
  const certificate = fs.readFileSync(certPath, 'utf8');
  credentials = {key: privateKey, cert: certificate};
}

const getPlayerNick = (player) => 
  player.nick || player.user.global_name || player.user.username


const getTeamsCollection = async () => {
  await client.connect();
  const psoTeams = client.db("PSOTeamManager");
  return psoTeams.collection("Teams");
}

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
    const { type, member, id:interaction_id, application_id, token, data, guild_id } = req.body;

    const callerId = member?.user?.id

    try {
      if (type === InteractionType.PING) {
        return res.send({ type: InteractionResponseType.PONG });
      }

      if (type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) {
        if(data.name==="editplayer"){
          return autoCompleteNation(data, res)
        }
        if(data.name === "nationalteam"){
          return autoCompleteNation(data, res)
        }
        return autoCompleteNation(data, res)
      }

      if (type === InteractionType.APPLICATION_COMMAND) {
        const { name, options } = data;

        const commandOptions = {
          name, options, member, interaction_id, application_id, token, guild_id, callerId, res, dbClient
        }

        if (name === 'help') {
          return help(commandOptions)
        }

        if (name === 'now') {
          return now(commandOptions)
        }
        if (name === "timestamp") {
          return timestamp(commandOptions)
        }

        if(name === "boxlineup"){
          return boxLineup(commandOptions)
        }

        if(name === "lineup") {
          return lineup(commandOptions)
        }

        if(process.env.GUILD_ID === guild_id) {
          if (name === "player") {
            return player(commandOptions)
          }

          if (name==="myplayer") {
            return player(commandOptions)
          }

          if (name === "editplayer") {
            return editPlayer(commandOptions)
          }

          if (name === "allplayers") {
            return allPlayers(commandOptions)
          }

          if (name === "team") {
            return team(commandOptions)
          }

          if (name === "match") {
            return match(commandOptions)
          }

          if (name === "editmatch") {
            return editMatch(commandOptions)
          }

          if (name === "endmatch") {
            return endMatch(commandOptions)
          }

          if (name === "publishmatch") {
            return publishMatch(commandOptions)
          }

          if (name === "matchid") {
            return matchId(commandOptions)
          }

          if (name === "matches") {
            return matches(commandOptions)
          }

          if(name === "nationalteam") {
            return nationalTeam(commandOptions)
          }

          if(name === "allnationalteams") {
            return allNationalTeams(commandOptions)
          }

          if(name === "postnationalteams") {
            return postNationalTeams(commandOptions)
          }

          if(name === "addselection") {
            return addSelection(commandOptions)
          }

          if(name === "removeselection") {
            return removeSelection(commandOptions)
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
                DiscordRequest(`/guilds/${guild_id}/members/${playeroption.value}`, {})
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

          if(name === "systemteam") {
            return systemTeam(commandOptions)
          }

          if (name==="editteam") {
            editTeam(commandOptions)
          }

          if(name === "initcountries") {
            return initCountries(commandOptions)
          }

          if (name === "players") {
            return players(commandOptions)
          }
          if (name ==='emojis') {
            const emojisResp = await DiscordRequest(`/guilds/${guild_id}/emojis`, { method: 'GET' })
            const emojis = await emojisResp.json()
            console.log(emojis)
            return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
              method: 'POST',
              body: {
                type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  content: `${emojis.length} listed`,
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
  const job = new CronJob(
    '0 9 * * *',
    async function() {
      const response = await getMatchesOfDay({date:'today', dbClient})
      await DiscordRequest(matchesWebhook, {
        method: 'POST',
        body: {
          content: response.substring(0, 1999),
        }
      })
    },
    null,
    true,
    'Europe/London'
  );
}

start()