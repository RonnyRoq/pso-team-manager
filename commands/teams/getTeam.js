import {createWriteStream} from 'fs'
import { pipeline } from 'stream/promises'
import fetch from "node-fetch"
import { serverChannels } from "../../config/psafServerConfig.js"
import { updateResponse, waitingMsg } from "../../functions/helpers.js"
import { getAllPlayers } from "../../functions/playersCache.js"
import { DiscordRequest } from "../../utils.js"


export const getTeams = ({dbClient}) => dbClient(({teams})=> teams.find({active:true}).toArray())
export const getAllTeams = ({dbClient}) => dbClient(async ({teams, leagues, leagueConfig})=> {
  const [allTeams, allLeagues, allLeaguesConfig] = await Promise.all([
    teams.find({}, {sort: {active: -1, name: 1}}).toArray(),
    leagues.find({}).toArray(),
    leagueConfig.find({}).toArray()
   ])
  const response = allTeams.map(team=> {
    const teamLeagues = allLeagues.filter(league=> league.team === team.id)
    return {
      ...team,
      leagues: teamLeagues.map(teamLeague=> teamLeague.leagueId)
    }
  })
  return {teams:response, leagues: allLeaguesConfig}
})

export const getTeam = ({id, dbClient}) => dbClient(({teams})=> teams.findOne({active:true, id}))
//export const getTeamExtended 

export const updateTeamPictures = async ({interaction_id, token, application_id, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const content = await dbClient(async({teams}) => {
    const teamsWithPictures = await teams.find({logoMsg: {$ne: null}}).toArray()
    
    const headers = {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      'User-Agent': 'PSAF Team Manager',
    }
    for await (const team of teamsWithPictures) {
      console.log(team.name)
      try {
        const msgResp = await DiscordRequest(`/channels/${serverChannels.clubsChannelId}/messages/${team.logoMsg}`)
        const message = await msgResp.json()
        console.log(message)
              
        const imgResp = await fetch(message.content, {headers})
        const imgTest = await fetch(message.content)
        console.log(imgResp)
        console.log(imgTest)
        
        if (!imgResp.ok) throw new Error(`unexpected response ${imgResp.statusText}`);

        await pipeline(imgResp.body, createWriteStream(`./site/images${team.shortname}.png`))

      } catch(e){
        console.error(e)
        //await teams.updateOne({_id: team._id}, {$set: {logoMsg: null}})
      } 
    }
    return 'done'
  })
  return updateResponse({application_id, token, content})
}

export const getTeamAndPlayers = async({id, dbClient, guild_id}) => {
  const players = await getAllPlayers(guild_id)
  const teamPlayers = players.filter(player => player.roles.includes(id))
  const playerIds = teamPlayers.map(player=> player.user.id)
  const [team, dbPlayers, contracts, teamLeagues, allLeagueList] = await dbClient(({teams, players, contracts, leagues, leagueConfig})=> (
    Promise.all([
      teams.findOne({active:true, id}),
      players.find({id: { $in: playerIds }}).toArray(),
      contracts.find({team: id, endedAt:null}).toArray(),
      leagues.find({team: id}).toArray(),
      leagueConfig.find({}).toArray()
    ])
  ))
  const activeLeagues = allLeagueList.filter(league=>league.active).map(({name, value, players})=> ({name, value, players}))
  const teamLeaguesId = teamLeagues.map(({leagueId})=> leagueId) || []
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
    contracts,
    leagues: activeLeagues.filter(league=> teamLeaguesId.includes(league.value))
  }
}

export const updateTeamPicturesCmd = {
  type: 1,
  name: 'updateteampictures',
  description: 'update the team logos in storage',
  func: updateTeamPictures,
  psaf: true,
}

export default [updateTeamPicturesCmd]