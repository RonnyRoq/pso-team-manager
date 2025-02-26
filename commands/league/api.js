
export const getLeagueConfig = async ({leagueId, dbClient}) => {
  return dbClient(async ({leagueConfig, leagues, teams})=> {
    const [league, leagueTeams] = await Promise.all([
      leagueConfig.findOne({value: leagueId}),
      leagues.find({leagueId}).toArray(),
    ])
    const teamIds = leagueTeams.map(team=>team.team)
    const leagueTeamsInfo = await teams.find({id: {$in: teamIds}}).toArray()
    return {league, leagueTeams: leagueTeamsInfo}
  })
}