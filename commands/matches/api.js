import { ObjectId } from "mongodb"
import { getFastCurrentSeason } from "../season.js"
import { getRefStatsLeaderboard } from "../match.js"

export const getMatch = async ({matchId, dbClient}) => {
  const matchIdAsId = new ObjectId(matchId)
  return dbClient(async ({matches, playerStats, lineups}) =>{
    const [match, stats, homeAwayLineup] = await Promise.all([
      matches.findOne(matchIdAsId),
      playerStats.find({matchId: matchIdAsId}).toArray(),
      lineups.find({matchId}).toArray()
    ])
    return {
      ...match,
      playerStats: stats,
      lineups: homeAwayLineup
    }
  })
}

export const getMatchDay = async ({league, matchday, dbClient}) => {
  return dbClient(async ({matches, playerStats, lineups, matchDays})=> {
    const season = getFastCurrentSeason()
    const [matchDayMatches, matchDay] = await Promise.all([
      matches.find({season, league, matchday}).toArray(),
      matchDays.findOne({season, league, matchday})
    ])
    const matchIds = matchDayMatches.map(match=> match._id.toString())
    const matchdayLineups = await lineups.find({matchId: {$in: matchIds}}).toArray()
    const matchdayPlayerStats = await playerStats.find({matchId: {$in: matchIds}}).toArray()
    return {
      matchDay,
      matches: matchDayMatches,
      lineups: matchdayLineups,
      playerStats: matchdayPlayerStats,
    }
  })
}

export const getRefLeaderboard = async ({dbClient}) => {
  return getRefStatsLeaderboard({dbClient})
}