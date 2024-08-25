import { parseDate } from "../timestamp.js"
import { msToTimestamp, optionsToObject, shuffleArray, updateResponse, waitingMsg } from "../../functions/helpers.js"
import { editAMatchInternal } from "../match.js"

const thirtyMinutes = 30*60

export const arrangeDaySchedule = async({dbClient, application_id, interaction_id, token, options}) => {
  await waitingMsg({interaction_id, token})
  const {date} = optionsToObject(options)
  const parsedDate = parseDate(date)
  const midnight = new Date(parsedDate)
  midnight.setHours(0,0,0,0)
  const totalEndDay = new Date(parsedDate)
  totalEndDay.setHours(23,59,59,0)
  const startOfDay = new Date(parsedDate)
  startOfDay.setHours(17,0,0,0)
  const endOfDay = new Date(parsedDate)
  endOfDay.setHours(20,30,0,0)
  const startDateTimestamp = msToTimestamp(Date.parse(startOfDay))
  const endDateTimestamp = msToTimestamp(Date.parse(endOfDay))
  const startDayTimestamp = msToTimestamp(Date.parse(midnight))
  const endDayTimestamp = msToTimestamp(Date.parse(totalEndDay))

  const content = await dbClient(async({matches, teams, nationalTeams, leagueConfig})=> {
    const matchesOfDay = await matches.find({dateTimestamp: { $gt: startDayTimestamp, $lt: endDayTimestamp}, $or: [{finished:false}, {finished:null}]}).sort({dateTimestamp:1}).toArray()
    shuffleArray(matchesOfDay)
    
    let processedMatchesIds = []
    let currentTimestamp = startDateTimestamp
    for await (const match of matchesOfDay) {
      await matches.updateOne({_id: match._id}, {$set: {dateTimestamp: currentTimestamp}})
      processedMatchesIds.push(match._id.toString())
      currentTimestamp = (parseInt(currentTimestamp) + thirtyMinutes).toString()
      if(currentTimestamp > endDateTimestamp) {
        currentTimestamp = startDateTimestamp
      }
    }
    for await (const id of processedMatchesIds) {
      await editAMatchInternal({id, teams, nationalTeams, matches, leagueConfig})
    }
    console.log('done')
    //await Promise.allSettled(processedMatchesIds.map(id => editAMatchInternal({id, teams, nationalTeams, matches})))
    return `${processedMatchesIds.length} matches set between <t:${startDateTimestamp}:F> and <t:${endDateTimestamp}:F>`
  })
  return updateResponse({application_id, token, content})
}


export const arrangeDayScheduleCmd = {
  type: 1,
  name: 'arrangeday',
  description: 'Arrange the schedule for a matchday',
  options: [{
    type: 3,
    name: 'date',
    description: "The day you're looking for (UK timezone)",
    required: true
  }]
}