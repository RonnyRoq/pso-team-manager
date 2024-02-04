import { ObjectId } from "mongodb"

export const getMatch = async ({matchId, dbClient}) => {
  return dbClient(async ({matches, playerStats, lineups}) =>{
    const [match, stats, homeAwayLineup] = await Promise.all([
      matches.findOne(new ObjectId(matchId)),
      playerStats.find({matchId}).toArray(),
      lineups.find({matchId}).toArray()
    ])
    return {
      ...match,
      playerStats: stats,
      lineups: homeAwayLineup
    }
  })
}