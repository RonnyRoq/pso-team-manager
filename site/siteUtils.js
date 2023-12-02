import DiscordOauth2 from 'discord-oauth2'
import crypto from 'crypto'
import { isStaffRole } from "../functions/helpers.js"
import { scope } from "../config/constants.js"

const redirectUri = "https://pso.shinmugen.net/site/"
const oauth = new DiscordOauth2({
  clientId: process.env.APP_ID,
  clientSecret: process.env.AUTHSC,
  redirectUri
});

export const hasSession = (req) => req?.session?.userId

export const authUser = async (req, res, next) => {
  if(req.query.code) {
    console.log('code', req.query.code)
    console.log(req.session)
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
    if(req.session.from) {
      console.log('redirect')
      console.log(req.baseUrl + req.session.from)
      req.session.save()
      return res.redirect(req.baseUrl + req.session.from)
    }
  }
  if(req.session.access_token) {
    const guildMember = await oauth.getGuildMember(req.session.access_token, process.env.GUILD_ID)
    req.session.userId = guildMember?.user?.id
    console.log('validated, next', req.session)
    next()
  } else {
    req.session.from = req.url.toString()
    const url = oauth.generateAuthUrl({
      scope,
      state: crypto.randomBytes(16).toString("hex"), // Be aware that randomBytes is sync if no callback is provided
    });
    console.log('saving before auth', req.session.from)
    req.session.save()
    return res.redirect(url)
  }
}

export const getGuildMember = async (req) => 
  oauth.getGuildMember(req.session.access_token, process.env.GUILD_ID)

export const isMemberStaff = async (guildMember) => {
  return (guildMember.roles.find(role => isStaffRole(role)))
}

export const isStaff = async (req) => {
  const guildMember = await getGuildMember(req)
  return isMemberStaff(guildMember)
}
