import 'dotenv/config';
import express from 'express';
import http from 'http';
import https from 'https';
import fs from 'fs';
//import pinoHttp from 'pino-http'
import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags
} from 'discord-interactions';
import { VerifyDiscordRequest, DiscordRequest } from './utils.js';
import mongoClient from './functions/mongoClient.js';
import { now } from './commands/now.js';
import { timestamp } from './commands/timestamp.js';
import { help, helpAdmin } from './commands/help.js';
import { allPlayers, autoCompleteNation, player, players } from './commands/player.js';
import { team } from './commands/team.js';
import { editMatch, endMatch, match, matchId, matches, pastMatches, publishMatch, resetMatch, unpublishMatch } from './commands/match.js';
import { blacklistTeam, doubleContracts, emoji, expireThings, fixNames, initCountries, managerContracts, systemTeam } from './commands/system.js';
import { addSelection, autoCompleteSelections, postNationalTeams, registerElections, removeSelection, showElectionCandidates, showVotes, voteCoach } from './commands/nationalTeam.js';
import { confirm, pendingConfirmations, register, releasePlayer } from './commands/confirm.js';
import { approveDealAction, approveLoanAction, declineDealAction, declineLoanAction, finishLoanRequest, removeConfirmation, removeDeal, removeLoan, removeRelease } from './commands/confirmations/actions.js';
import commandsRegister from './commandsRegister.js';
import { freePlayer, releaseAction, renew, setContract, teamTransfer, transfer, transferAction } from './commands/transfers.js';
import { postAllTeams, postTeam, updateTeamPost } from './commands/postTeam.js';
import { sleep } from './functions/helpers.js';
import { deal, loan } from './commands/confirmations/deal.js';
import { showBlacklist } from './commands/blacklist.js';
import { emergencyOneSeasonContract, expireContracts, showExpiringContracts, showNoContracts } from './commands/contracts.js';
import { disbandTeam, disbandTeamConfirmed } from './commands/disbandTeam.js';
import { getCurrentSeasonPhase, progressCurrentSeasonPhase, updateCacheCurrentSeason } from './commands/season.js';
import { setAllMatchToSeason } from './commands/matches/batchWork.js';
import { endMatchModalResponse, matchResultPrompt, matchStatsModalResponse, matchStatsPrompt, refereeMatch } from './commands/matches/actions.js';
import { testDMMatch } from './commands/matches/notifyMatchStart.js';
import { voteAction } from './commands/nationalTeams/actions.js';
import { client, uri } from './config/mongoConfig.js';
import { getSite } from './site.js';
import { addSteam, addSteamId, manualDoubleSteam, setName } from './commands/player/steamid.js';
import { leagueTeams } from './commands/league/leagueTeams.js';
import { imageLeagueTable, leagueTable, postLeagueTable } from './commands/league/leagueTable.js';
import { generateMatchday, onetimeseason, publishNextMatches, randomMatchesDay, showMatchDay, updateMatchDayImage } from './commands/matches/matchday.js';
import { setRating } from './commands/player/rating.js';
import { approveMoveMatch, declineMoveMatch, listMatchMoves, moveMatch, moveMatchModalResponse, moveMatchPrompt } from './commands/matches/moveMatch.js';
import { getApi } from './api.js';
import { arrangeDaySchedule } from './commands/matches/arrangeDaySchedule.js';
import { addUniqueId } from './commands/player/uniqueId.js';
import { editLeague } from './commands/league/editLeague.js';
import { initCronJobs } from './cronjobs.js';
import { cacheKeys, initCache } from './functions/allCache.js';
import { autoCompleteLeague } from './functions/autoComplete.js';
import { cancelPicture, confirmPicture } from './commands/player/playerPicture.js';
import { getWeb } from './web.js';
import { selectMatchLineup } from './commands/lineup/actions.js';

const keyPath = process.env.CERTKEY;
const certPath = process.env.CERT;

let online = false;
global.isConnected = false
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

const mapToFunc = (map) => {
  const globalCommands = new Map()
  const psafCommands = new Map()
  const wcCommands = new Map()
  map.forEach(fullCmd => {
    // eslint-disable-next-line no-unused-vars
    const {func, psaf, wc, app, name} = fullCmd
    if (psaf) {
      psafCommands.set(name, func)
    }
    if(wc) {
      wcCommands.set(name, func)
    }
    if(app) {
      globalCommands.set(name, func)
    }
  })
  return {
    globalCommands,
    psafCommands,
    wcCommands
  }
}

const {
  globalCommands,
  psafCommands,
  wcCommands
} = mapToFunc(commandsRegister())

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
  if(online){
    app.use(express.json({ verify: VerifyDiscordRequest(process.env.PUBLIC_KEY) }));
  }
  
  //app.use(pinoHttp)
  app.use('/site', getSite(!online, uri, dbClient))
  app.use('/api', getApi(!online, dbClient))
  app.use('/web', getWeb(!online, uri, dbClient))
  /**
   * Interactions endpoint URL where Discord will send HTTP requests
   */
  app.post('/interactions', async function (req, res) {
    // Interaction type and data
    const { type, member, id:interaction_id, application_id, channel_id, token, data, guild_id, user } = req.body;

    const callerId = member?.user?.id || user?.id

    try {
      if (type === InteractionType.PING) {
        return res.send({ type: InteractionResponseType.PONG });
      }

      if (type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) {
        let optionChanged = data.options.find(option=> option.focused)
        if(!optionChanged)
          optionChanged = data.options?.[0]?.options.find(option => option.focused)
        if(data.name==="editplayer"){
          return autoCompleteNation(optionChanged, dbClient, res)
        }
        if(data.name === "nationalteam"){
          return autoCompleteNation(optionChanged, dbClient, res)
        }
        if(data.name === "selectionmatch"){
          return autoCompleteSelections(optionChanged, dbClient, res)
        }
        if(optionChanged.name === "selection") {
          return autoCompleteSelections(optionChanged, dbClient, res)
        }
        if(optionChanged.name === "eligiblenationality") {
          return autoCompleteNation(optionChanged, dbClient, res)
        }
        if(optionChanged.name === "nationality") {
          return autoCompleteNation(optionChanged, dbClient, res)
        }
        if(optionChanged.name === "league") {
          return autoCompleteLeague(optionChanged, dbClient, res)
        }
        return autoCompleteNation(data, dbClient, res)
      }
      console.log(`Interaction ${type} from ${callerId}`)

      if(type === InteractionType.MESSAGE_COMPONENT) {
        const componentRegister = {
          cancel_transfer: removeConfirmation,
          cancel_deal: removeDeal,
          cancel_loan: removeLoan,
          confirm_transfer: transferAction,
          confirm_release: releaseAction,
          cancel_release: removeRelease,
          confirm_picture: confirmPicture,
          cancel_picture: cancelPicture,
        }
        
        const { message } = req.body
        const { custom_id } = data
        console.log(`custom_id ${custom_id}`)
        const componentOptions = {custom_id, callerId, member, message, interaction_id, application_id, channel_id, token, guild_id, dbClient}
        if(guild_id === process.env.GUILD_ID) {
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
          if(custom_id.startsWith("streamer_")) {
            return refereeMatch(componentOptions)
          }
          if(custom_id.startsWith("loan_")) {
            return finishLoanRequest(componentOptions)
          }
          if(custom_id.startsWith("vote_")) {
            return voteAction(componentOptions)
          }
          if(custom_id.startsWith("match_result_")) {
            return matchResultPrompt(componentOptions)
          }
          if(custom_id.startsWith("match_stats_")) {
            return matchStatsPrompt(componentOptions)
          }
          if(custom_id.startsWith("movematch_")) {
            return moveMatchPrompt(componentOptions)
          }
          if(custom_id.startsWith("approve_matchmove_")) {
            return approveMoveMatch(componentOptions)
          }
          if(custom_id.startsWith("decline_matchmove_")) {
            return declineMoveMatch(componentOptions)
          }
          if(custom_id.startsWith("lineup_")) {
            return selectMatchLineup(componentOptions)
          }
          return res.send({
            type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Failed to process the command.',
              flags: InteractionResponseFlags.EPHEMERAL
            }
          })
        } else if(guild_id === process.env.WC_GUILD_ID) {
          if(custom_id.startsWith("vote_")) {
            return voteAction(componentOptions)
          }
        }
      }

      if (type === InteractionType.MODAL_SUBMIT) {
        const {custom_id, components} = data
        console.log(custom_id)
        console.log(JSON.stringify(components))
        const componentOptions = {custom_id, callerId, member, components, interaction_id, application_id, channel_id, token, guild_id, dbClient}
        if(custom_id.startsWith('match_result')) {
          return endMatchModalResponse(componentOptions)
        }

        if(custom_id.startsWith('match_stats_')) {
          return matchStatsModalResponse(componentOptions)
        }

        if(custom_id.startsWith('move_the_match_')) {
          return moveMatchModalResponse(componentOptions)
        }
      }

      if (type === InteractionType.APPLICATION_COMMAND) {
        const { name, options, resolved, target_id } = data;
        //const optionsObj = optionsToObject(options || [])
        console.log(`command ${name}`)
        console.log(options)
        if(name === "uploadtest") {
          console.log(req)
          console.log(JSON.stringify(req.body))
        }

        const commandOptions = {
          name, options, member, interaction_id, application_id, channel_id, token, guild_id, callerId, res, resolved, dbClient, target_id, user,
        }
        //console.log(commandOptions)

        if (name === 'help') {
          return help(commandOptions)
        }

        if (name === 'now') {
          return now(commandOptions)
        }
        if (name === "timestamp") {
          return timestamp(commandOptions)
        }

        if(process.env.WC_GUILD_ID === guild_id) {
          if(name === "register") {
            return register(commandOptions)
          }

          if (name === "registerelections") {
            return registerElections(commandOptions)
          }

          if(name === 'showelectioncandidates') {
            return showElectionCandidates(commandOptions)
          }

          if (name === "votecoach") {
            return voteCoach(commandOptions)
          }
          if(wcCommands.has(name)) {
            return wcCommands.get(name)(commandOptions)
          }
        }

        if(process.env.GUILD_ID === guild_id) {
          if(commandsRegister[name]) {
            return commandsRegister[name](commandOptions)
          }
          
          if (name === "player") {
            return player(commandOptions)
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

          if (name === "movethematch") {
            return editMatch(commandOptions) //movethematch has less options and is aimed at non admin staff
          }

          if (name === "endmatch") {
            return endMatch(commandOptions)
          }

          if (name === "publishmatch") {
            return publishMatch(commandOptions)
          }

          if (name === "unpublishmatch") {
            return unpublishMatch(commandOptions)
          }

          if (name === "expirethings") {
            return expireThings(commandOptions)
          }

          if (name === "matchid") {
            return matchId(commandOptions)
          }

          if (name === "resetmatch") {
            return resetMatch(commandOptions)
          }

          if (name === "matches") {
            return matches(commandOptions)
          }

          if(name === "pastmatches") {
            return pastMatches(commandOptions)
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

          if(name=== "setname") {
            return setName(commandOptions)
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

          if(name === "myteam") {
            return team(commandOptions)
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

          if(name === "releaseplayer") {
            return releasePlayer(commandOptions)
          }

          if(name === "showmatchday") {
            return showMatchDay(commandOptions)
          }

          if(name === "updatematchdayimage") {
            return updateMatchDayImage(commandOptions)
          }

          if(name === "onetimeseason") {
            return onetimeseason(commandOptions)
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

          if (name === "progresscurrentseasonphase") {
            return progressCurrentSeasonPhase(commandOptions)
          }

          if (name === "loan") {
            return loan(commandOptions)
          }

          if(name === "votecoach") {
            return voteCoach(commandOptions)
          }

          if(name === "managercontracts"){
            return managerContracts(commandOptions)
          }

          if(name === "setrating") {
            return setRating(commandOptions)
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

          if(name === "addsteamid") {
            return addSteamId(commandOptions)
          }
          if(name === "addsteam") {
            return addSteam(commandOptions)
          }

          if(name === "leagueteams") {
            return leagueTeams(commandOptions)
          }

          if(name === "leaguetable") {
            return leagueTable(commandOptions)
          }

          if(name === "postleaguetable") {
            return postLeagueTable(commandOptions)
          }

          if(name === "imgleaguetable") {
            return imageLeagueTable(commandOptions)
          }

          if(name === "generatematchday") {
            return generateMatchday(commandOptions)
          }

          if(name === "randommatchday") {
            return randomMatchesDay(commandOptions)
          }

          if(name === "systemteam") {
            return systemTeam(commandOptions)
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

          if(name === 'movematch') {
            return moveMatch(commandOptions)
          }

          if(name === 'listmoves') {
            return listMatchMoves(commandOptions)
          }

          if(name === 'editleague') {
            return editLeague(commandOptions)
          }

          if(name === 'publishnextmatches') {
            return publishNextMatches(commandOptions)
          }

          if(name === 'checkdoublesteam') {
            return manualDoubleSteam(commandOptions)
          }

          if(name === 'arrangeday') {
            return arrangeDaySchedule(commandOptions)
          }

          if(name === 'register') {
            return register(commandOptions)
          }
          if(name === 'adduniqueid') {
            return addUniqueId(commandOptions)
          }
          if(name === 'fixnames') {
            return fixNames(commandOptions)
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
          if(psafCommands.has(name)) {
            return psafCommands.get(name)(commandOptions)
          }
        }

        if(globalCommands.has(name)) {
          return globalCommands.get(name)(commandOptions)
        }
      }
    }
    catch(e) {
      console.error(e)
    }
    console.log('no handlers found')
    console.log(data)
    
    return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
      method: 'POST',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `Failed to process the ${data?.name} command.`,
          flags: 1 << 6
        }
      }
    })
  });


  let allActiveTeams = []
  let allNationalSelections = []
  let allLeagues = []
  let allNationalities = []
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
        global.isConnected = true
      } finally {
        // Ensures that the client will close when you finish/error
        await client.close();
      }
      await dbClient(async ({seasonsCollect, teams, nationalTeams, nationalities, leagueConfig})=> {
        await updateCacheCurrentSeason(seasonsCollect)
        allActiveTeams = await teams.find({active: true}).toArray()
        allActiveTeams.sort(() => Math.random() - 0.5)
        allNationalSelections = await nationalTeams.find({active: true}).toArray()
        allNationalSelections.sort(() => Math.random() - 0.5)
        allLeagues = await leagueConfig.find(({archived: {$ne: true}})).sort({order: 1}).toArray()
        allNationalities = await nationalities.find({}).toArray()
        initCache(cacheKeys.leagues, allLeagues)
        initCache(cacheKeys.nationalities, allNationalities)
      })
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
        global.isConnected = true
      }
      catch(e){
        console.error(e)
      } finally {
        await client.close();
      }
      await dbClient(async ({seasonsCollect, teams, nationalTeams, nationalities, leagueConfig})=> {
        await updateCacheCurrentSeason(seasonsCollect)
        allActiveTeams = await teams.find({active: true}).toArray()
        allActiveTeams.sort(() => Math.random() - 0.5)
        allNationalSelections = await nationalTeams.find({active: true}).toArray()
        allNationalSelections.sort(() => Math.random() - 0.5)
        allLeagues = await leagueConfig.find(({archived: {$ne: true}})).sort({order: 1}).toArray()
        allNationalities = await nationalities.find({}).toArray()
        initCache(cacheKeys.leagues, allLeagues)
        initCache(cacheKeys.nationalities, allNationalities)
      })
      initCronJobs({dbClient, allActiveTeams, allNationalSelections, allLeagues})
    })
  }
}

start()