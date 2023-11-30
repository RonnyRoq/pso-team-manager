import 'dotenv/config';
import express from 'express';
import http from 'http';
import https from 'https';
import fs from 'fs';
import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags
} from 'discord-interactions';
import { CronJob } from 'cron';
import { VerifyDiscordRequest, DiscordRequest } from './utils.js';
import mongoClient from './functions/mongoClient.js';
import { now } from './commands/now.js';
import { timestamp } from './commands/timestamp.js';
import { help, helpAdmin } from './commands/help.js';
import { boxLineup, eightLineup, internationalLineup, lineup } from './commands/lineup.js';
import { allPlayers, autoCompleteNation, editPlayer, player, players } from './commands/player.js';
import { team } from './commands/team.js';
import { editInterMatch, editMatch, endMatch, getMatchesOfDay, internationalMatch, match, matchId, matches, pastMatches, publishMatch } from './commands/match.js';
import { blacklistTeam, doubleContracts, emoji, initCountries, systemTeam } from './commands/system.js';
import { activateTeam, editTeam } from './commands/editTeams.js';
import { addSelection, allNationalTeams, nationalTeam, postNationalTeams, registerElections, removeSelection, showElectionCandidates, showVotes, voteCoach } from './commands/nationalTeam.js';
import { confirm, pendingConfirmations } from './commands/confirm.js';
import { approveDealAction, approveLoanAction, declineDealAction, declineLoanAction, finishLoanRequest } from './commands/confirmations/actions.js';
import componentRegister from './componentsRegister.js'
import commandsRegister from './commandsRegister.js';
import { freePlayer, renew, setContract, teamTransfer, transfer } from './commands/transfers.js';
import { innerUpdateTeam, postAllTeams, postTeam, updateTeamPost } from './commands/postTeam.js';
import { sleep } from './functions/helpers.js';
import { deal, loan } from './commands/confirmations/deal.js';
import { listDeals } from './commands/confirmations/listDeals.js';
import { showBlacklist } from './commands/blacklist.js';
import { emergencyOneSeasonContract, expireContracts, showExpiringContracts, showNoContracts } from './commands/contracts.js';
import { disbandTeam, disbandTeamConfirmed } from './commands/disbandTeam.js';
import { getCurrentSeasonPhase } from './commands/season.js';
import { setAllMatchToSeason } from './commands/matches/batchWork.js';
import { refereeMatch } from './commands/matches/actions.js';
import { serverChannels } from './config/psafServerConfig.js';
import { notifyMatchStart, testDMMatch } from './commands/matches/notifyMatchStart.js';
import { voteAction } from './commands/nationalTeams/actions.js';
import { client, uri } from './config/mongoConfig.js';
import { getSite } from './site.js';

const keyPath = process.env.CERTKEY;
const certPath = process.env.CERT;

let online = false;
if(fs.existsSync(keyPath)&& fs.existsSync(certPath)){
  online = true
}

const dbClient = mongoClient(client)
let credentials = {}

const webHookDetails = process.env.WEBHOOK

if(online){
  const privateKey  = fs.readFileSync(keyPath, 'utf8');
  const certificate = fs.readFileSync(certPath, 'utf8');
  credentials = {key: privateKey, cert: certificate};
}

const getTeamsCollection = async () => {
  await client.connect();
  const psoTeams = client.db("PSOTeamManager");
  return psoTeams.collection("Teams");
}

const displayTeam = (team) => (
  `Team: ${team.flag} ${team.emoji} ${team.name} - ${team.shortName}` +
  `\rBudget: ${new Intl.NumberFormat('en-US').format(team.budget)}` +
  `\rCity: ${team.city}` +
  `\rPalmarès: ${team.description}` +
  `\rLogo: ${team.logo}`
)

function start() {
  // Create an express app
  const app = express();
  
  // Get port, or default
  const PORT = (online ? process.env.PORT : process.env.LOCALPORT) || 8080;
  const PORTHTTPS = process.env.PORTHTTPS || 8443;
  
  // Parse request body and verifies incoming requests using discord-interactions package
  app.use(express.json({ verify: VerifyDiscordRequest(process.env.PUBLIC_KEY) }));
  
  app.use('/site', getSite(false, uri, dbClient))
  /**
   * Interactions endpoint URL where Discord will send HTTP requests
   */
  app.post('/interactions', async function (req, res) {
    // Interaction type and data
    const { type, member, id:interaction_id, application_id, channel_id, token, data, guild_id } = req.body;

    const callerId = member?.user?.id

    try {
      if (type === InteractionType.PING) {
        return res.send({ type: InteractionResponseType.PONG });
      }

      if(type === InteractionType.MESSAGE_COMPONENT) {
        const { message } = req.body
        const { custom_id } = data
        if(guild_id === process.env.GUILD_ID) {
          const componentOptions = {custom_id, callerId, member, message, interaction_id, application_id, channel_id, token, guild_id, dbClient}
          if(componentRegister[custom_id]) {
            return componentRegister[custom_id](componentOptions)
          }
          if(custom_id.startsWith("approve_deal_")) {
            return approveDealAction(componentOptions)
          }
          if(custom_id.startsWith("decline_deal_")) {
            return declineDealAction(componentOptions)
          }
          if(custom_id.startsWith("approve_loan_")) {
            return approveLoanAction(componentOptions)
          }
          if(custom_id.startsWith("decline_loan_")) {
            return declineLoanAction(componentOptions)
          }
          if(custom_id.startsWith("confirm_delete_")) {
            return disbandTeamConfirmed(componentOptions)
          }
          if(custom_id.startsWith("referee_")) {
            return refereeMatch(componentOptions)
          }
          if(custom_id.startsWith("loan_")) {
            return finishLoanRequest(componentOptions)
          }
          if(custom_id.startsWith("vote_")) {
            return voteAction(componentOptions)
          }
          return res.send({
            type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Failed to process the command.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          })
        }
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
          name, options, member, interaction_id, application_id, channel_id, token, guild_id, callerId, res, dbClient
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

        if(name === "eightlineup") {
          return eightLineup(commandOptions)
        }

        if(process.env.GUILD_ID === guild_id) {
          if(commandsRegister[name]) {
            return commandsRegister[name](commandOptions)
          }
          
          if (name === "player") {
            return player(commandOptions)
          }

          if(name === "interlineup") {
            return internationalLineup(commandOptions)
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

          if (name === "intermatch") {
            return internationalMatch(commandOptions)
          }

          if (name === "editintermatch") {
            return editInterMatch(commandOptions);
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

          if(name === "pastmatches") {
            return pastMatches(commandOptions)
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

          if(name === "confirm") {
            return confirm(commandOptions)
          }

          if(name === "updateconfirm") {
            return pendingConfirmations(commandOptions)
          }

          if(name === "renew") {
            return renew(commandOptions)
          }

          if(name === "postteam") {
            return postTeam(commandOptions)
          }

          if(name === "setcontract") {
            return setContract(commandOptions)
          }

          if(name === "blacklistteam") {
            return blacklistTeam(commandOptions)
          }

          if(name === "showblacklist") {
            return showBlacklist(commandOptions)
          }

          if(name ==="helpadmin") {
            return helpAdmin(commandOptions)
          }

          if(name === "shownocontracts") {
            return showNoContracts(commandOptions)
          }

          if(name === "emergencyoneseasoncontract") {
            return emergencyOneSeasonContract(commandOptions)
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
                  if(i>3) {
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
            teamsEmbed.forEach(async (teamEmbed) => {
              await DiscordRequest(`/channels/${channel_id}/messages`, {
                method: 'POST',
                body: {
                  type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                  embeds : [teamEmbed],
                }
              })
              await sleep(500)
            })
            return 
          }

          if (name === "transfer") {
            return transfer(commandOptions)
          }

          if(name === "teamtransfer") {
            return teamTransfer(commandOptions)
          }

          if(name === "freeplayer") {
            return freePlayer(commandOptions)
          }

          if(name === "deal") {
            return deal(commandOptions)
          }

          if(name === "listdeals") {
            return listDeals(commandOptions)
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
          if (name === "activateteam") {
            return activateTeam(commandOptions)
          }

          if (name === "registerelections") {
            return registerElections(commandOptions)
          }

          if (name === "showelectioncandidates") {
            return showElectionCandidates(commandOptions)
          }

          if (name === "showcoach") {
            return voteCoach(commandOptions)
          }

          if (name === "showexpiringcontracts") {
            return showExpiringContracts(commandOptions)
          }

          if(name === "setallmatchseasons") {
            return setAllMatchToSeason(commandOptions)
          }

          if (name === "disbandteam") {
            return disbandTeam(commandOptions)
          }

          if (name === "expirecontracts") {
            return expireContracts(commandOptions)
          }

          if (name === "getcurrentseasonphase") {
            return getCurrentSeasonPhase(commandOptions)
          }

          if (name === "loan") {
            return loan(commandOptions)
          }

          if(name === "votecoach") {
            return voteCoach(commandOptions)
          }

          if (name === "initteam") {
            const rolesResp = await DiscordRequest(`/guilds/${guild_id}/roles`, {})
            const roles = await rolesResp.json()
            
            let response = "Failed to insert teams"
            try {
              const teams = await getTeamsCollection();
              await teams.insertMany(roles.map(role => (
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
            return editTeam(commandOptions)
          }

          if(name === "postallteams") {
            return postAllTeams(commandOptions)
          }

          if(name === "updateteam") {
            return updateTeamPost(commandOptions)
          }

          if(name === "initcountries") {
            return initCountries(commandOptions)
          }

          if (name === "players") {
            return players(commandOptions)
          }

          if(name === "doublecontracts") {
            return doubleContracts(commandOptions)
          }

          if(name === 'emoji') {
            return emoji(commandOptions)
          }

          if(name === 'testdmmatch') {
            return testDMMatch(commandOptions)
          }

          if(name === 'showvotes') {
            return showVotes(commandOptions)
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
                  flags: InteractionResponseFlags.EPHEMERAL
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


  let allActiveTeams = []
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
        console.log("connecting to Mongo...")
        await client.connect();
        console.log("connected, pinging the DB...")
        // Send a ping to confirm a successful connection
        await client.db("PSOTeams").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
        dbClient(async ({teams})=> {
          allActiveTeams = await teams.find({active: true}).toArray()
          allActiveTeams.sort(() => Math.random() - 0.5)
        })
      }
      catch(e){
        console.error(e)
      } finally {
        await client.close();
      }
    });
  }
  new CronJob(
    '1 9 * * *',
    async function() {
      const response = await getMatchesOfDay({date:'today', dbClient})
      for await (const match of response) {
        const {matchId, content} = match
        const body = matchId ? {
          content,
          components: [{
            type: 1,
            components: [{
              type: 2,
              label: `Referee`,
              style: 1,
              custom_id: `referee_${matchId}`
            }]
          }]
        } : {
          content
        }
        await DiscordRequest(`/channels/${serverChannels.scheduleChannelId}/messages`, {
          method: 'POST',
          body
        })
      }
    },
    null,
    true,
    'Europe/London'
  );
  let currentTeamIndex = 0
  new CronJob(
    '*/5 7-22 * * *',
    async function() {
      if(allActiveTeams.length > 0) {
        await innerUpdateTeam({guild_id: process.env.GUILD_ID, team: allActiveTeams[currentTeamIndex]?.id, dbClient})
        console.log(`${allActiveTeams[currentTeamIndex].name} updated.`)
        currentTeamIndex++
        if(currentTeamIndex>= allActiveTeams.length) {
          currentTeamIndex = 0
        }
      }
    },
    null, 
    true, 
    'Europe/London'
  )
  new CronJob(
    '*/2 6-22 * * *',
    async function() {
      //console.log('no notifications for now')
      await notifyMatchStart({dbClient})
    },
    null, 
    true, 
    'Europe/London'
  )
  new CronJob(
    '0 22 * * *',
    async function() {
      console.log('every day at 22')/*
      const response = await getMatchesOfDay({date:'today', finished:true, dbClient})
      await response.forEach(async ({content}) => {
        const body = {
          content
        }
        await DiscordRequest(`/channels/${serverChannels.dailyResultsChannelId}/messages`, {
          method: 'POST',
          body
        })
      })*/
    },
    null, 
    true, 
    'Europe/London'
  )
}

start()