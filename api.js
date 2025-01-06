import express from 'express'
//import pinoHttp from 'pino-http'
import { getAllTeams, getTeam, getTeamAndPlayers, getTeams } from './commands/teams/getTeam.js'
import { getPlayer, getPlayerStats, getPlayers } from './commands/player/api.js'
import { getMatches } from './commands/matches/matches.js'
import { getMatch, getRefLeaderboard } from './commands/matches/api.js'
import { apiLeagueTable } from './commands/league/leagueTable.js'
import { getTransfers } from './commands/transfers.js'
import { showMatchDayInternal } from './commands/matches/matchday.js'
import { apiUpdateLeague, getLeaguesInfo } from './commands/league/editLeague.js'
import { getAllNationalities } from './functions/allCache.js'
import { updateTeamStatus } from './commands/editTeams.js'
import { getAllSelections } from './functions/countriesCache.js'
import { getLft, getTransferList } from './commands/transfers/transferList.js'
import { getSelection } from './commands/nationalTeams/nationalTeamManagement.js'
import { buildPlayerSearch } from './commands/search/buildSearchIndexes.js'
import { globalSearch } from './commands/search/search.js'

export const getApi = (localdev=false, dbClient={}) =>{
  const api = express() // the API app
  //api.use(pinoHttp)
  api.use(express.json())
  //api.use(bodyParser.urlencoded({extended: true}))
  api.use((req, res, next) => {
    if(global.isConnected) {
      next()
    } else {
      res.status(500).end()
    }
  })
  if(!localdev) {
    console.log('online')
    api.use(async(req, res, next) => {
      //console.log(req.url)
      //console.log(req.query)
      let api_key = req.header("x-api-key")
      if(process.env.PSAF_API_KEY === api_key) {
        next()
      } else if(req.header('sec-fetch-mode') === 'cors' && req.header('sec-fetch-site') === 'same-origin' ) {
        next()
      } else {
        return res.status(403).send({ error: { code: 403, message: "Nope." } });
      }
    })
  }

  api.get('/teams', async(req, res) => {
    const response = await getTeams({dbClient})
    return res.json(response)
  })

  api.put('/teamstatus', async (req, res) => {
    console.log(req.body)
    const team = req.body.team
    const active = req.body.active
    console.log(active)
    const response = await updateTeamStatus({team, active, dbClient})
    return res.json(response)
  })

  api.get('/allteams', async(req, res) => {
    const response = await getAllTeams({dbClient})
    return res.json(response)
  })
  api.get('/team', async (req, res) => {
    const response = await getTeam({id: req.query.id, dbClient})
    return res.json(response)
  })
  api.get('/teamplayers', async (req, res) => {
    const response = await getTeamAndPlayers({id: req.query.id, dbClient, guild_id: process.env.GUILD_ID})
    return res.json(response)
  })

  api.get('/players', async (req, res) => {
    const response = await getPlayers({getParams: req.query, dbClient})
    return res.json(response)
  })

  api.get('/player', async (req, res) => {
    const response = await getPlayer({getParams: req.query, dbClient})
    return res.json(response)
  })

  api.get('/playerstats', async (req, res) => {
    const response = await getPlayerStats({getParams: req.query, dbClient})
    return res.json(response)
  })

  api.get('/transfers', async (req, res) => {
    const response = await getTransfers({getParams: req.query, dbClient})
    return res.json(response)
  })

  api.get('/matches', async (req, res) => {
    const response = await getMatches({getParams: req.query, dbClient})
    return res.json(response)
  })

  api.get('/match', async (req,res)=> {
    if(!req.query?.id) {
      return res.status(400).send({ error: { code: 400, message: "Please document an id" } });
    } else {
      const response = await getMatch({matchId: req.query?.id, dbClient})
      return res.json(response)
    }
  })

  api.get('/matchday', async (req, res)=> {
    console.log('/matchday', req.query)
    const {matchday, league, season} = req.query || {}
    if(!matchday || !league) {
      return res.status(400).send({ error: { code: 400, message: "Please document a matchday and league" } });
    } else {
      const response = await showMatchDayInternal({dbClient, league, matchday, season})
      return res.json(response)
    }
  })

  api.get('/league', async (req,res)=> {
    //console.log(req.url)
    //console.log(req.query)
    if(!req.query?.league) {
      return res.status(400).send({ error: { code: 400, message: "Please document an league" } });
    } else {
      const response = await apiLeagueTable({league: req.query?.league, dbClient})
      return res.json(response)
    }
  })

  api.put('/activateleague', async (req, res) => {
    if(!req.body?.league) {
      return res.status(400).send({ error: { code: 400, message: "Please document an league" } });
    } else {
      const response = await apiUpdateLeague({active: req.body?.active, league: req.body?.league}, dbClient)
      return res.json(response)
    }
  })

  api.put('/editleague', async (req, res) => {
    if(!req.body?.league) {
      return res.status(400).send({ error: { code: 400, message: "Please document an league" } });
    } else {
      const response = await apiUpdateLeague(req.body, dbClient)
      return res.json(response)
    }
  })

  api.get('/leagues', async (req,res) => {
    //console.log(req.url)
    const response = await getLeaguesInfo({dbClient})
    return res.json(response)
  })

  api.get('/leaguechoices', async (req, res) => {
    const response = await getLeaguesInfo({dbClient, short: true})
    return res.json(response)
  })

  api.get('/refsleaderboard', async (req, res)=> {
    const response = await getRefLeaderboard({dbClient})
    return res.json(response)
  })

  api.get('/nationalselections', async(req, res) => {
    const response = await getAllSelections(dbClient)
    return res.json(response)
  })

  api.get('/nationalselection', async (req, res) => {
    const {shortname, name} = req.query || {}
    const response = await getSelection({dbClient, shortname, name})
    return res.json(response)
  })

  api.get('/search', async (req, res) => {
    const {s = ''} = req.query || {}
    const response = await globalSearch({dbClient, s})
    return res.json(response)
  })

  api.get('/buildsearch', async (req, res) => {
    const response = await buildPlayerSearch({dbClient})
    return res.json(response)
  })

  api.get('/nationalities', async(req, res) => {
    const response = await getAllNationalities()
    return res.json(response)
  })

  api.get('/lft', async (req, res) => {
    const { position, minHours } = req.query;
    const response = await getLft({ position, minHours, dbClient });
    return res.json(response);
  });

  api.get('/transferlist', async (req, res) => {
    const { position, maxBuyout } = req.query;
    const response = await getTransferList({ position, maxBuyout, dbClient });
    return res.json(response);
  });

  api.get('/', async function (req, res) {
    console.log('main', req.session)
    return res.send('<p>no thank you</p>')
  })

  return api
}