import express from 'express'
import bodyParser from 'body-parser'
//import pinoHttp from 'pino-http'
import { getTeam, getTeamAndPlayers, getTeams } from './commands/teams/getTeam.js'
import { getPlayer, getPlayerStats, getPlayers } from './commands/player/api.js'
import { getMatches } from './commands/matches/matches.js'
import { getMatch } from './commands/matches/api.js'
import { apiLeagueTable } from './commands/league/leagueTable.js'
import { getTransfers } from './commands/transfers.js'
import { showMatchDayInternal } from './commands/matches/matchday.js'
import { getLeaguesInfo } from './commands/league/editLeague.js'

export const getApi = (localdev=false, dbClient={}) =>{
  const api = express() // the API app
  //api.use(pinoHttp)
  api.use(bodyParser.urlencoded({extended: true}))
  api.use((req, res, next) => {
    if(global.isConnected) {
      next()
    } else {
      res.status(500).end()
    }
  })
  if(!localdev) {
    api.use(async(req, res, next) => {
      //console.log(req.url)
      //console.log(req.query)
      let api_key = req.header("x-api-key")
      if(process.env.PSAF_API_KEY === api_key) {
        next()
      } else {
        res.status(403).send({ error: { code: 403, message: "Nope." } });
      }
    })
  }

  api.get('/teams', async(req, res) => {
    const response = await getTeams({dbClient})
    res.json(response)
  })


  api.get('/team', async (req, res) => {
    const response = await getTeam({id: req.query.id, dbClient})
    res.json(response)
  })
  api.get('/teamplayers', async (req, res) => {
    const response = await getTeamAndPlayers({id: req.query.id, dbClient, guild_id: process.env.GUILD_ID})
    res.json(response)
  })

  api.get('/players', async (req, res) => {
    const response = await getPlayers({getParams: req.query, dbClient})
    res.json(response)
  })

  api.get('/player', async (req, res) => {
    const response = await getPlayer({getParams: req.query, dbClient})
    res.json(response)
  })

  api.get('/playerstats', async (req, res) => {
    const response = await getPlayerStats({getParams: req.query, dbClient})
    res.json(response)
  })

  api.get('/transfers', async (req, res) => {
    const response = await getTransfers({getParams: req.query, dbClient})
    res.json(response)
  })

  api.get('/matches', async (req, res) => {
    const response = await getMatches({getParams: req.query, dbClient})
    res.json(response)
  })

  api.get('/match', async (req,res)=> {
    if(!req.query?.id) {
      res.status(400).send({ error: { code: 400, message: "Please document an id" } });
    } else {
      const response = await getMatch({matchId: req.query?.id, dbClient})
      res.json(response)
    }
  })

  api.get('/matchday', async (req, res)=> {
    const {matchday, league} = req.query || {}
    if(!matchday || !league) {
      res.status(400).send({ error: { code: 400, message: "Please document a matchday and league" } });
    } else {
      const response = await showMatchDayInternal({dbClient, league, matchday})
      res.json(response)
    }
  })

  api.get('/league', async (req,res)=> {
    //console.log(req.url)
    //console.log(req.query)
    if(!req.query?.league) {
      res.status(400).send({ error: { code: 400, message: "Please document an league" } });
    } else {
      const response = await apiLeagueTable({league: req.query?.league, dbClient})
      res.json(response)
    }
  })

  api.get('/leagues', async (req,res) => {
    //console.log(req.url)
    const response = await getLeaguesInfo({dbClient})
    res.json(response)
  })

  api.get('/leaguechoices', async (req, res) => {
    const response = await getLeaguesInfo({dbClient, short: true})
    res.json(response)
  })

  api.get('/', async function (req, res) {
    console.log('main', req.session)
    return res.send('<p>no thank you</p>')
  })

  return api
}