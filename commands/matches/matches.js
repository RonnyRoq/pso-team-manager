import { parseDate } from "chrono-node"
import { getCurrentSeason, msToTimestamp } from "../../functions/helpers.js"


export const getMatches = async ({getParams, dbClient}) => {
  const {leagueId, matchday, date, season} = getParams
  let query = {}
  if(leagueId) {
    query.league = leagueId
  }
  if(matchday) {
    query.matchday = matchday
  }
  if(date) {
    const parsedDate = parseDate(date)
    const startOfDay = new Date(parsedDate)
    startOfDay.setUTCHours(0,0,0,0)
    const endOfDay = new Date(parsedDate)
    endOfDay.setUTCHours(23,59,59,999)
    const startDateTimestamp = msToTimestamp(Date.parse(startOfDay))
    const endDateTimestamp = msToTimestamp(Date.parse(endOfDay))
    query.dateTimestamp = { $gt: startDateTimestamp, $lt: endDateTimestamp }
  }

  return dbClient(async ({matches, seasonsCollect})=> {
    let seasonQuery = season
    if(!seasonQuery) {
      seasonQuery = await getCurrentSeason(seasonsCollect)
    }
    return matches.find({...query, season: seasonQuery}, {limit: 100, sort: {dateTimestamp: 1}}).toArray()
  })
}