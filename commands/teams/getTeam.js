import { getAllPlayers } from "../../functions/playersCache.js"


export const getTeams = ({dbClient}) => dbClient(({teams})=> teams.find({active:true}).toArray())

export const getTeam = ({id, dbClient}) => dbClient(({teams})=> teams.findOne({active:true, id}))

export const getTeamAndPlayers = async({id, dbClient, guild_id}) => {
  const players = await getAllPlayers(guild_id)
  const teamPlayers = players.filter(player => player.roles.includes(id))
  const playerIds = teamPlayers.map(player=> player.user.id)
  const [team, dbPlayers, contracts] = await dbClient(({teams, players, contracts})=> (
    Promise.all([
      teams.findOne({active:true, id}),
      players.find({id: { $in: playerIds }}).toArray(),
      contracts.find({team: id, endedAt:null})
    ])
  ))
  return {
    team,
    players: teamPlayers.map(player => {
      const dbPlayer = dbPlayers.find(id=> id == player.user.id) || {}
      console.log(dbPlayer)
      return {
      ...dbPlayer,
      ...player,
      }
    }),
    contracts
  }
}