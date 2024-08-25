import express from 'express'
import bodyParser from 'body-parser'
import session from 'express-session'
import path from 'path'
import { renderFile } from 'ejs'
import { fileURLToPath } from 'url'
import createMongoStore from 'connect-mongodb-session'
const MongoDBStore = createMongoStore(session);
import { authUser, hasSession, isAdmin } from './site/siteUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getWeb = (localdev=false, uri='') =>{
  const web = express() // the site app
  web.set('view engine', 'html');
  web.set('views', __dirname + '/web');
  web.use(express.static('web'))
  web.engine('html', renderFile)
  
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
      web.use(session({
        cookie: { maxAge: 86400000, secure: true },
        store,
        resave: true,
        saveUninitialized: true,
        secret: process.env.SESS_SC
      }))
    }
  }
  web.use(bodyParser.urlencoded({extended: true}))

  web.use(async(req, res, next) => {
    if(!localdev) {
      if(!hasSession(req)) {
        authUser(req, res, next)
      } else if(!localdev && !isAdmin(req)) {
        return res.send('Unauthorised')
      } else {
        return next()
      }
    } else {
      return next()
    }
  })
  
  const paths = ['/', '/leagues', '/teams', '/team/*', '/league/*']

  web.get(paths, async function (req, res) {
    if(!localdev && !isAdmin(req))
      return res.send('Unauthorised')
    console.log('main', req.session)

    return res.render('index')
  })
  
  return web
}