import { getCurrentSeason } from "../../functions/helpers"

export const updateRefereesTableCommand = ({interaction_id, token, application_id, dbClient}) => {

}

export const updateRefereesTable = async ({dbClient}) => {
  const content = await dbClient(async ({matches, playerStats, seasonsCollect})=> {
    const season = await getCurrentSeason(seasonsCollect)
    const seasonMatches = await matches.find({season}).toArray()
  })
}