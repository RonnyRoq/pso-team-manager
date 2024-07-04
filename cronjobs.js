import { CronJob } from "cron"
import { getMatchesOfDay, getMatchesSummary, remindMissedMatches } from "./commands/match.js"
import { innerUpdateTeam } from "./commands/postTeam.js"
import { notifyMatchStart } from "./commands/matches/notifyMatchStart.js"
import { DiscordRequest } from "./utils.js"
import { serverChannels } from "./config/psafServerConfig.js"
import { updateLeagueTable } from "./commands/league/leagueTable.js"
import { autoPublish } from "./commands/matches/matchday.js"
import { internalUpdateRegister, internalValidateSteamId, updateSteamNames } from "./commands/system.js"
import { updateSelectionPost } from "./commands/nationalTeams/nationalTeamManagement.js"
import { updateCacheCurrentSeason } from "./commands/season.js"

let currentTeamIndex = 0
let currentSelectionIndex = 0
export const initCronJobs = ({dbClient, allActiveTeams, allNationalSelections, allLeagues}) => {
  const cronJobs = [[
    '1 9 * * *',
    async function() {
      getMatchesOfDay({date:'today', dbClient, isSchedule: true})
    },
  ],[
    '*/5 7-22 * * *',
    async function() {
      if(allActiveTeams.length > 0) {
        await innerUpdateTeam({guild_id: process.env.GUILD_ID, team: allActiveTeams[currentTeamIndex]?.id, dbClient})
        console.log(`${allActiveTeams[currentTeamIndex].name} updated.`)
        currentTeamIndex++
        if(currentTeamIndex>= allActiveTeams.length) {
          currentTeamIndex = 0
        }
      }
    },
  ],[
    '*/9 7-22 * * *',
    async function() {
      console.log('Updating National Selections')
      if(allNationalSelections.length > 0) {
        console.log(allNationalSelections[currentSelectionIndex])
        await updateSelectionPost({selection: allNationalSelections[currentSelectionIndex]?.shortname, dbClient})
        console.log(`${allNationalSelections[currentSelectionIndex].name} updated.`)
        currentSelectionIndex++
        if(currentSelectionIndex>= allNationalSelections.length) {
          currentSelectionIndex = 0
        }
      }
    },
  ],[
    '*/2 6-22 * * *',
    async function() {
      await notifyMatchStart({dbClient})
    },
  ],[
    '1 22 * * *',
    async function() {
      const response = await getMatchesSummary({dbClient})
      for await(const message of response) {
        await DiscordRequest(`/channels/${serverChannels.dailyResultsChannelId}/messages`, {
          method: 'POST',
          body: {
            content: message
          }
        })
      }
    },
  ],[
    '35 23 * * *',
    async function() {
      for await (const league of allLeagues) {
        await updateLeagueTable({dbClient, league})
      }
    },
  ],[
    '1 22 * * *',
    async function() {
      await autoPublish({dbClient})
    },
  ],[
    '34 21 * * *',
    async function() {
      await remindMissedMatches({dbClient})
    },
  ],[
    '1 12 * * *',
    async function() {
      await internalValidateSteamId({dbClient})
    },
  ],[
    '31 12 * * *',
    async function() {
      await internalUpdateRegister({dryrun: false, guild_id: process.env.WC_GUILD_ID, dbClient})
    },
  ],[
    '51 12 * * *',
    async function() {
      await internalUpdateRegister({dryrun: false, guild_id: process.env.GUILD_ID, dbClient})
    },
  ],[
    '11 11,15,19 * * *',
    async function() {
      await updateSteamNames({dbClient})
    },
  ],[
    '0 8 * * *',
    async function() {
      await dbClient(async ({seasonsCollect}) => {
        await updateCacheCurrentSeason(seasonsCollect)
      })
    }
  ]]
  cronJobs.forEach(([time, func])=> {
    new CronJob(
      time,
      func,
      null,
      true,
      'Europe/London'
    )
  })
}