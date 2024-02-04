import { getPlayerNick, updateResponse, waitingMsg } from "../functions/helpers.js"
import { getAllPlayers } from "../functions/playersCache.js"
import { DiscordRequest } from "../utils.js"
import { endLoan } from "./transfers.js"

const logWebhook = process.env.WEBHOOK

export const seasonPhases = [{
  name: "first",
  desc: 'first half of regular season',
},{
  name: "second",
  desc: 'second half of regular season',
},{
  name: "post",
  desc: 'post regular season'
}]

export const getCurrentSeasonPhaseDb = async ({seasonsCollect}) => {
  const seasonObj = await seasonsCollect.findOne({endedAt: null})
  let phase = seasonPhases.find(sphase => sphase.name === seasonObj.phase)?.desc || seasonPhases[0].desc
  return `Season ${seasonObj.season}, ${phase}`
}

export const getCurrentSeasonPhase = async ({interaction_id, token, application_id, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const content = await dbClient(async ({seasonsCollect})=> {
    return getCurrentSeasonPhaseDb({seasonsCollect})
  })
  return updateResponse({application_id, token, content})
}

export const progressCurrentSeasonPhase = async ({interaction_id, token, guild_id, callerId, application_id, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const allPlayers = await getAllPlayers(guild_id)
  const content = await dbClient(async({seasonsCollect, contracts, teams})=> {
    const seasonObj = await seasonsCollect.findOne({endedAt: null})
    console.log(seasonObj)
    if(!seasonObj.phase) {
      seasonObj.phase = seasonPhases[0].name
    } else if (seasonObj.phase === seasonPhases[2].name) {
      seasonObj.phase = seasonPhases[0].name
      seasonObj.season++
    } else {
      const index = seasonPhases.findIndex(({name}) => name === seasonObj.phase)
      seasonObj.phase = seasonPhases[index+1].name
    }
    const untilPhase = seasonPhases.findIndex(({name})=> name === seasonObj.phase).toString()
    console.log(seasonObj)
    const {phase, season} = seasonObj
    const loanSearchObj = {endedAt: null, isLoan: true, phase: untilPhase, until: season}
    console.log(loanSearchObj)
    const loansSearch = await contracts.find(loanSearchObj).toArray()
    console.log(loansSearch.map(loan=> loan.playerId))
    const initialContracts = await contracts.find({endedAt: null, playerId: {$in: loansSearch.map(loan=> loan.playerId)}}).toArray()
    console.log(initialContracts)
    console.log(`${loansSearch.length} loans to end`)
    for await (const loan of loansSearch) {
      const player = allPlayers.find(currentPlayer => currentPlayer.user.id === loan.playerId)
      const endLoanTeam = await teams.findOne({id: loan.team})
      const initialContract = initialContracts.find(contract => contract.playerId === loan.playerId)
      if(initialContract) {
        const teamToReturn = await teams.findOne({id: initialContract.team})
        const content = await endLoan({callerId, guild_id, player, playerId:loan.playerId, teamToReturn, endLoanTeam, contracts})
        await DiscordRequest(logWebhook, {
          method: 'POST',
          body: {content}
        })
      } else {
        console.log(`Tried to end loan of ${getPlayerNick(player)} but couldn't find a team to return him to.`)
      }
    }
    await seasonsCollect.updateOne({endedAt: null}, {$set:{phase, season, phaseStartedAt: Date.now()}})
    return getCurrentSeasonPhaseDb({seasonsCollect})
  })
  await updateResponse({application_id, token, content})
}

export const getCurrentSeasonPhaseCmd = {
  name: 'getcurrentseasonphase',
  description: 'Check which season phase we\'re in',
  type: 1
}

export const progressCurrentSeasonPhaseCmd = {
  name: 'progresscurrentseasonphase',
  description: 'Move to the next season phase',
  type: 1
}