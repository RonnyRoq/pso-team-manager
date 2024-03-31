import express from 'express'
import bodyParser from 'body-parser'
import session from 'express-session'
import path from 'path';
import { fileURLToPath } from 'url';
import createMongoStore from 'connect-mongodb-session'
const MongoDBStore = createMongoStore(session);

import { getMatch, getMatchesOfDay, saveMatchStats } from './commands/match.js';
import { authUser, getGuildMember, hasSession, isMemberStaff, isStaff } from './site/siteUtils.js';
import { mockMatch } from './site/mockMatch.js';
import mockMatches from './site/mockMatches.js';
import { getAllTeams, getTeam, getTeamAndPlayers, getTeams } from './commands/teams/getTeam.js';
import { getPlayers } from './commands/player/api.js';
import { allLeagueList } from './config/psafServerConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getSite = (localdev=false, uri='', dbClient={}) =>{
  const site = express() // the site app
  site.set('view engine', 'ejs');
  site.set('views', __dirname + '/site/pages');
  site.use(express.static('site'))
  
  if(!localdev){
    var store = new MongoDBStore({
      uri,
      collection: 'siteSessions'
    })
    
    // Catch errors
    store.on('error', function(error) {
      console.log(error)
    })
    if(store) {
      site.use(session({
        cookie: { maxAge: 86400000, secure: true },
        store,
        resave: true,
        saveUninitialized: true,
        secret: process.env.SESS_SC
      }))
    }
  }
  
  site.use(bodyParser.urlencoded({extended: true}))

  if(!localdev) {
    site.use(async(req, res, next) => {
      if(!hasSession(req)) {
        authUser(req, res, next)
      } else {
        next()
      }
    })
  }
  
  site.get('/matches', async (req, res) => {
    const date = req.query.date || 'today'
    const matches = localdev ? mockMatches.values : await getMatchesOfDay({date, dbClient, forSite:true})
    console.log(matches)
    return res.render('matches', {matches})
  })
  
  site.get('/teams', async (req, res) => {
    const teams = await getAllTeams({dbClient})
    const leagues = Object.fromEntries(allLeagueList.map(league=> ([league.value, league.name])))
    return res.render('teams', {teams, leagues})
  })

  site.post('/editmatch', async (req, res) => {
    if(localdev)
      return editMatch(req, res)

    const member = await getGuildMember(req)
    if(!isMemberStaff(member))
      return res.send('Unauthorised')
    
      console.log(req.body)
    await saveMatchStats({id: req.query.id, dbClient, matchStats: req.body, callerId: member?.user?.id })
    return editMatch(req, res)
  })

  const editMatch = async (req, res) => {
    if(!localdev && !isStaff(req))
      return res.send('Unauthorised')

    let response = mockMatch
    if(!localdev) {
      try{
        response = await getMatch({id: req.query.id, dbClient})
        console.log(response)
      }
      catch(e) {
        console.log('Match not found', req.query.id)
      }
    }
    return res.render('editmatch', response)
  }

  site.get('/editmatch', editMatch)

  site.get('/match', async (req, res) => {
    console.log('/match')
    let response = mockMatch
    if(!localdev) {
      try{
        response = await getMatch({id: req.query.id, dbClient})
      }
      catch(e) {
        console.log('Match not found', req.query.id)
      }
    }
    return res.render('match', response)
  })

  site.get('/api/teams', async(req, res) => {
    console.log(req.url)
    const response = await getTeams({dbClient})
    res.json(response)
  })


  site.get('/api/team', async (req, res) => {
    console.log(req.url)
    console.log(req.query)
    const response = await getTeam({id: req.query.id, dbClient})
    res.json(response)
  })
  site.get('/api/teamplayers', async (req, res) => {
    console.log(req.url)
    console.log(req.query)
    const response = await getTeamAndPlayers({id: req.query.id, dbClient, guild_id: process.env.GUILD_ID})
    res.json(response)
  })

  site.get('/api/players', async (req, res) => {
    console.log(req.url)
    console.log(req.query)
    const response = await getPlayers({getParams: req.query, dbClient})
    res.json(response)
  })

/*  const matchDay = (req, res) => {
    const data = {}
    return res.render('matchday', data)
  }*/

  site.get('/test', async (req, res)=> {
    return res.render('test')
  })

  site.get('/', async function (req, res) {
    console.log('main', req.session)
    return res.send('<p>no thank you</p>')
  })

  return site
}