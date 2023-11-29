import { updateResponse, waitingMsg } from "../functions/helpers.js"

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
  {
    const seasonObj = await seasonsCollect.findOne({endedAt: null})
    let phase = seasonPhases.find(sphase => sphase.name === seasonObj.phase)?.desc || seasonPhases[0].desc
    return `Season ${seasonObj.season}, ${phase}`
  }
}

export const getCurrentSeasonPhase = async ({interaction_id, token, application_id, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const content = await dbClient(async ({seasonsCollect})=> {
    return getCurrentSeasonPhaseDb({seasonsCollect})
  })
  return updateResponse({application_id, token, content})
}

export const progressCurrentSeasonPhase = async ({interaction_id, token, application_id, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const content = await dbClient(async({seasonsCollect})=> {
    const seasonObj = await seasonsCollect.findOne({endedAt: null})
    if(!seasonObj.phase) {
      seasonObj.phase = seasonPhases[0]
    } else if (seasonObj.phase === seasonPhases[2]) {
      seasonObj.phase = seasonPhases[0]
      seasonObj.season++
    }
    const {phase, season} = seasonObj
    await seasonsCollect.updateOne({endedAt: null}, {$set:{phase, season}})
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