import { ObjectId } from "mongodb"
import { genericFormatMatch, genericInterFormatMatch, getPlayerNick, getRegisteredRole, postMessage, updateResponse, waitingMsg } from "../../functions/helpers.js"
import { getFastCurrentSeason } from "../season.js"
import { getAllLeagues, getAllNationalities } from "../../functions/allCache.js"
import { formatGenericLineup, nonLineupAttributes } from "./lineup.js"
import { DiscordRequest } from "../../utils.js"
import { getAllPlayers } from "../../functions/playersCache.js"

export const selectMatchLineup =  async ({member, application_id, callerId, interaction_id, channel_id, guild_id, token, dbClient, custom_id}) => {
  await waitingMsg({interaction_id, token})
  const [,id, matchId] = custom_id.split("_")
  const content = await dbClient(async({lineups, matches, players, teams, nationalSelections, nationalContracts})=>{
    let [lineup, match, nations, allPlayers] = await Promise.all([
      lineups.findOne({postedBy: callerId, id}),
      matches.findOne({_id: new ObjectId(matchId)}),
      getAllNationalities(),
      getAllPlayers(guild_id)
    ])
    if(!(lineup && match)) {
      return 'Cannot find a lineup for the match you selected'
    }
    const season = getFastCurrentSeason()

    let team
    if(match.isInternational) {
      const selections = await nationalSelections.find({shortName: {$in: [match.home, match.away]}}).toArray()
      team = await nationalContracts.findOne({season, playerId: callerId, selection: selections.map(team=>team.shortName)})
    } else {
      const clubs = await teams.find({id: {$in: [match.home, match.away]}}).toArray()
      team = clubs.find(club=> member.roles.includes(club.id))
    }
    lineup = await lineups.findOneAndUpdate({_id: lineup._id}, {$set: {matchId, team}}, {returnDocument: 'after', upsert: true})
    const nextMatch = match
    const theMatchId = nextMatch?._id?.toString() || ''
    const allLeagues = await getAllLeagues()
    let playerTeam = ''
    if(!nextMatch.isInternational){
      const teamsOfMatch = await teams.find({id: {$in: [nextMatch.home,nextMatch.away]}}).toArray()
      playerTeam = genericFormatMatch(teamsOfMatch, nextMatch, allLeagues) + '\r'
    } else {
      playerTeam = genericInterFormatMatch(nations, nationalSelections, nextMatch, allLeagues)
    }
    await lineups.updateOne({postedBy:callerId, id}, {
      $set: {
        matchId: theMatchId,
        team,
      }
    }, {upsert: true})
    let objLineup = Object.fromEntries(
      Object.entries(lineup)
        .filter(([name])=> !nonLineupAttributes.includes(name))
        .map(([name, value])=> {
          console.log(name, value)
          const discPlayer = allPlayers.find(player=> player?.user?.id === value)
          return [name, {id: value, name: getPlayerNick(discPlayer), registered: discPlayer.roles.includes(getRegisteredRole(guild_id))}]
        })
    )
    let lineupPlayers = await players.find({id: {$in: Object.values(lineup)}}, {projection: {id:1, steam: 1, ingamename: 1}}).toArray()
    //playerTeam += (isInternational ? selectionFlags : memberTeam.emoji) + ' ' + memberTeam.name + ' '
    //lineupPlayers = lineupPlayers.filter(lineupPlayer=> lineupPlayer.steam)
    objLineup = Object.fromEntries(Object.entries(objLineup).map(([position, objPlayer])=> {
      const player = (lineupPlayers.find(lineupPlayer => lineupPlayer.id === objPlayer.id))
      return ([position, {...objPlayer, ...player}])
    }))
    let response = `\r<@${callerId}> posted:\r${playerTeam}lineup ${lineup.vs? `vs ${lineup.vs}`: ''}\r`
    response += formatGenericLineup({vs: lineup.vs, ...objLineup})
    
    let threadMessage = `\r<@${callerId}> posted:\r${playerTeam}lineup ${lineup.vs? `vs ${lineup.vs}`: ''}\r`
    threadMessage += formatGenericLineup({vs: lineup.vs, ...objLineup}, true)
    
    const messageResp = await postMessage({channel_id, content: response})
    const message = await messageResp.json()
    if(nextMatch?.thread) {
      try {
        await DiscordRequest(`/channels/${nextMatch.thread}/messages`, {
          method: 'POST',
          body: {
            content: threadMessage
          }
        })
      }
      catch(e) {
        console.error(e)
      }
    }
    if(theMatchId){
      await lineups.updateOne({matchId: theMatchId, team}, {$set: {message: message.id}})
    }
    return `${nextMatch ? `Your lineup code: ${lineup?.id}\r` : ''}${response}`
  })
  return updateResponse({application_id, token, content})
}