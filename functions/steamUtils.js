import { SteamIds, SteamRequest, SteamRequestTypes } from "../utils.js"
import { validateSnowflake } from "./snowflakeConvert.js"

const communityStateToText = (state) => {
  switch(state) {
    case 1:
      return "Private"
    case 2:
      return "Friends only"
    case 3:
      return "Friends of Friends"
    case 4:
      return "Users Only"
    case 5:
      return "Public"
  }
}

export const getSteamIdFromSteamUrl = async (steamUrl) => {
  let steamid
  if(steamUrl.includes("steamcommunity.com/id/")) {
    const infoIndex = steamUrl.indexOf('edit/info')
    const cleanedUrl = infoIndex === -1 ? steamUrl : steamUrl.substring(0, infoIndex)
    const [,vanityurl] = cleanedUrl.match(/steamcommunity.com\/id\/(.+)\//)
    const vanityResp = await SteamRequest(SteamRequestTypes.VanityUrl, {vanityurl})
    const vanityProfile = await vanityResp.json()
    console.log(vanityProfile)
    if(vanityProfile?.response?.steamid) {
      steamid = vanityProfile.response.steamid
    }
  } else {
    const profileMatch = steamUrl.match(/.*\/(\d+)\/?/)
    if(profileMatch !== null) {
      steamid = profileMatch[1]
    }
  }
  return steamid
}

export const isSteamIdIncorrect = (steamId="") => {
  if(steamId === null || !steamId.includes("steamcommunity.com/profiles/") && !steamId.includes("steamcommunity.com/id/") ) {
    return 'Invalid Steam ID. Please enter the URL shown when you are in your Steam profile page.'
  }
}

export const getPSOSteamDetails = async ({steamUrl, steamId, playerId, member}) => {
  let psoSummary = {}
  try {
    let steamid
    if(steamId){
      steamid = steamId
    } else {
      steamid = await getSteamIdFromSteamUrl(steamUrl)
    }
    if(!steamid) {
      psoSummary = {
        message: "Steam Url incorrect."
      }
    } else {
      const playerSummaryResp = await SteamRequest(SteamRequestTypes.GetPlayerSummaries, {steamids: [steamid]})
      const playerSummary = await playerSummaryResp.json()
      const player = playerSummary?.response?.players?.[0]
      if(!player) {
        psoSummary = {
          message: "Steam account not found."
        }
      } else {
        const actualsteamId = player.steamid
        const communityState = communityStateToText(player.communityvisibilitystate)
        const gamesSummaryResp = await SteamRequest(SteamRequestTypes.GetGameSummary, {steamid: actualsteamId, "appIds_filter[0]": SteamIds.psoGameId})
        const gamesSummary = await gamesSummaryResp.json()
        const games = gamesSummary?.response?.games || []
        psoSummary = games?.[0] || {message: "Can't find PSO on account"}
        psoSummary.discordCreated = validateSnowflake(playerId)
        psoSummary.steamUrl = player.profileurl
        psoSummary.steamId = player.steamid
        psoSummary.discordJoined = new Date(member.joined_at)
        psoSummary.communityState = communityState
        psoSummary.isPrivate = player.communityvisibilitystate == 1
        if(!psoSummary.message) {
          if((psoSummary.playtime_forever || 0)/60 > 10) {
            psoSummary.validated = true
          } else {
            psoSummary.message = "PSO hours are not visible."
          }
        }
      }
    }
  } catch(e) {
    console.log(e)
  }
  return psoSummary
}