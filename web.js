import express from 'express'
import session from 'express-session'
import path from 'path'
import { renderFile } from 'ejs'
import { fileURLToPath } from 'url'
import createMongoStore from 'connect-mongodb-session'
const MongoDBStore = createMongoStore(session);
import { authUser, hasSession, isAdmin } from './functions/siteUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getWeb = (localdev=false, uri='') =>{
  const web = express() // the site app
  web.set('view engine', 'html');
  web.set('views', __dirname + '/web');
  web.engine('html', renderFile)
  web.use('/static', express.static('web/static'))
  
  if(!localdev){
    var store = new MongoDBStore({
      uri,
      databaseName: 'PSOTeamManager',
      collection: 'siteSessions',
    })
    
    // Catch errors
    store.on('error', function(error) {
      console.log(error)
    })
    if(store) {
      web.use(session({
        cookie: { maxAge: 86400000, secure: true },
        store,
        resave: true,
        saveUninitialized: true,
        secret: process.env.SESS_SC
      }))
    }
  }
  web.use(express.json())
  web.use(express.urlencoded({extended: true}))

  web.use('/api/*', async (req, res) => {
    const href = req._parsedUrl.href
    if(!localdev && !hasSession(req)) {
      return res.send('Unauthorised')
    }
    if(!localdev && !isAdmin(req)) {
      return res.send('Unauthorised')
    }
    const headers = {
      'x-api-key': process.env.PSAF_API_KEY,
      accept: 'application/json',
      'Content-Type': 'application/json',
      'sec-fetch-mode': 'cors',
      referer: req.headers.referer,
      'sec-fetch-site': 'same-origin',
    }
    if(hasSession(req)) {
      headers.userId = req.session.userId
      headers.name = req.session.name
    }
    const options = {
      headers,
      method: req.method,
    }
    if(req.method === 'PUT' || req.method === 'POST') {
      options.body = JSON.stringify(req.body)
    }
    const response = await fetch(`${localdev ? 'http://':'https://'}${req.headers.host}${href}`, options)
    const json = await response.json()
    return res.json(json)
  })
  web.use(async(req, res, next) => {
    if(!localdev) {
      console.log("!localdev")
      if(!hasSession(req)) {
        console.log("no session")
        authUser(req, res, next)
      } else {
        console.log(req.session)
         if(!localdev && !isAdmin(req)) {
          return res.send('Unauthorised')
        } else {
          console.log("next")
          return next()
        }
      }
    } else {
      console.log("localdev")
      return next()
    }
  })
  
  const paths = ['/*', '/leagues', '/teams', '/team/*', '/league/*']

  web.get(paths, async function (req, res) {
    if(localdev)
      return res.render('index')
    
    if(!hasSession(req)) {
      return res.send('Unauthorised')
    }
    if(!isAdmin(req))
      return res.send('Unauthorised')

    return res.render('index')
  })
  
  return web
}