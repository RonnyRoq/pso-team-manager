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
import { getAllTeams } from './commands/teams/getTeam.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getSite = (localdev=false, uri='', dbClient={}) =>{
  const site = express() // the site app
  site.use(express.static('site'))
  site.set('view engine', 'ejs');
  site.set('views', __dirname + '/site/pages');
  
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
      /*if(!hasSession(req)) {
        authUser(req, res, next)
      } else {*/
        next()
      //}
    })
  }
  
  site.get('/matches', async (req, res) => {
    const date = req.query.date || 'today'
    const matches = localdev ? mockMatches.values : await getMatchesOfDay({date, dbClient, forSite:true})
    console.log(matches)
    return res.render('matches', {matches})
  })
  
  site.get('/team', async (req, res) => {
    const {teams, leagues} = await getAllTeams({dbClient})
    return res.render('team', {teams, leagues})
  })

  site.get('/teams', async (req, res) => {
    const {teams, leagues} = await getAllTeams({dbClient})
    const totalActiveMoney = teams.filter(team=>team.active).reduce((acc, team)=> acc + team.budget, 0)
    const totalSleepingMoney = teams.filter(team=>!team.active).reduce((acc, team)=> acc + team.budget, 0)
    return res.render('teams', {teams, leagues, totalActiveMoney, totalSleepingMoney})
  })

  /*site.post('/editmatch', async (req, res) => {
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

  site.get('/editmatch', editMatch)*/

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