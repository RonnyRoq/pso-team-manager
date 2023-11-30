import express from 'express'
import bodyParser from 'body-parser'
import session from 'express-session'
import path from 'path';
import { fileURLToPath } from 'url';
import createMongoStore from 'connect-mongodb-session'
const MongoDBStore = createMongoStore(session);

import { getMatch, getMatchesOfDay } from './commands/match.js';
import { authUser, hasSession, isStaff } from './site/siteUtils.js';
import { mockMatch } from './site/mockMatch.js';

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
    const response = localdev ? [{content: 'test'}] : await getMatchesOfDay({date: 'today', dbClient})
    return res.send(response.map(({content})=>content).join('<br >'))
  })

  site.post('/editmatch', async (req, res) => {
    if(!localdev && !isStaff(req))
      return res.send('Unauthorised')
    console.log(req.body)
    return res.send(JSON.stringify(req.body))
  })

  site.get('/editmatch', async (req, res) => {
    if(!localdev && !isStaff(req))
      return res.send('Unauthorised')

    console.log('/editmatch')
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
  })

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

  site.get('/', async function (req, res) {
    console.log('main', req.session)
    return res.send('<p>no thank you</p>')
  })

  return site
}