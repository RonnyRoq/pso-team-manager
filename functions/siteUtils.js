import DiscordOauth2 from 'discord-oauth2'
import crypto from 'crypto'
import { getPlayerNick, isAdminRole, isStaffRole } from "./helpers.js"
import { scope } from "../config/constants.js"

const redirectUri = "https://pso.shinmugen.net/web/"
const oauth = new DiscordOauth2({
  clientId: process.env.APP_ID,
  clientSecret: process.env.AUTHSC,
  redirectUri
});

export const hasSession = (req) => req?.session?.userId

const startDiscordAuth = (req, res) => {
  const state = crypto.randomBytes(16).toString("hex")
  req.session.oauthState = state
  const url = oauth.generateAuthUrl({
    scope,
    state,
  });
  console.log('saving before auth', req.session.from)
  // Wait for the session (with the state) to be stored before leaving for Discord
  return req.session.save(() => res.redirect(url))
}

export const authUser = async (req, res, next) => {
  if(req.query.code) {
    const expectedState = req.session.oauthState
    delete req.session.oauthState
    if(!expectedState || req.query.state !== expectedState) {
      console.log('OAuth state mismatch, restarting login')
      return startDiscordAuth(req, res)
    }
    const authResp = await oauth.tokenRequest({
      clientId: process.env.APP_ID,
      code: req.query.code,
      scope,
      grantType: "authorization_code",
      redirectUri
    })
    req.session.access_token = authResp.access_token
    req.session.refresh_token = authResp.refresh_token
    req.session.toRefresh = Date.now()+authResp.expires_in
    console.log('auth done')
    const guildMember = await oauth.getGuildMember(req.session.access_token, process.env.GUILD_ID)
    req.session.userId = guildMember?.user?.id
    req.session.name = getPlayerNick(guildMember)
    req.session.isAdmin = isMemberAdmin(guildMember)
    req.session.save()
    console.log('Saving session', req.session)
    if(req.session.from) {
      console.log('redirect')
      if(req.session.isAdmin) {
        return res.redirect(req.baseUrl + req.session.from)
      } else {
        return res.send('Unauthorised')
      }
    }
  }
  if(req.session.access_token) {
    if(req.session.isAdmin) {
      console.log('validated, next', req.session)
      return next()
    } else {
      return res.send('Unauthorised')
    }
  } else {
    req.session.from = req.url.toString()
    return startDiscordAuth(req, res)
  }
}

export const getGuildMember = async (req) => 
  oauth.getGuildMember(req.session.access_token, process.env.GUILD_ID)

export const isMemberStaff = (guildMember) => {
  return (guildMember.roles.find(role => isStaffRole(role)))
}

export const isMemberAdmin = (guildMember) => {
  return !!(guildMember.roles.find(role => isAdminRole(role)))
}

export const isStaff = async (req) => {
  if(!req?.session?.access_token) {
    console.log('isStaff')
    console.log(req?.session?.access_token)
    return false
  }
  const guildMember = await getGuildMember(req)
  return isMemberStaff(guildMember)
}
export const isAdmin = (req) => !!req?.session?.isAdmin
