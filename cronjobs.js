import { CronJob } from "cron"
import { getMatchesOfDay, getMatchesSummary, remindMissedMatches } from "./commands/match.js"
import { innerUpdateTeam } from "./commands/postTeam.js"
import { notifyMatchStart } from "./commands/matches/notifyMatchStart.js"
import { DiscordRequest, logSystemError } from "./utils.js"
import { serverChannels, serverRoles } from "./config/psafServerConfig.js"
import { updateLeagueTable } from "./commands/league/leagueTable.js"
import { autoPublish } from "./commands/matches/matchday.js"
import { checkForPSO, detectSteamAlts, getUnregisteredPlayerIds, internalValidateSteamId, updateSteamNames } from "./commands/system.js"
import { updateSelectionPost } from "./commands/nationalTeams/nationalTeamManagement.js"
import { updateCacheCurrentSeason } from "./commands/season.js"
import { postMessage } from "./functions/helpers.js"
import { buildPlayerSearch } from "./commands/search/buildSearchIndexes.js"

const callCronJob = (name, callback) => {
  return async () => {
    try {
      console.log(`Start Cronjob ${name}`)
      await callback()
      console.log(`End Cronjob ${name}`)
    } catch (e) {
      const failedText = `Failed Cronjob ${name}`
      console.log(failedText)
      logSystemError(failedText + '\r' + JSON.stringify(e))
    }
  }
}


let currentTeamIndex = 0
let currentSelectionIndex = 0
let playerIdsToPSOCheck = []
export const initCronJobs = ({dbClient, allActiveTeams, allNationalSelections, allLeagues}) => {
  const cronJobs = [[
    '1 9 * * *',
    callCronJob('postMatchesOfDay',
    async function() {
      getMatchesOfDay({date:'today', dbClient, isSchedule: true})
    }),
  ],[
    '*/5 * * * *',
    callCronJob('Update team details',
      async function() {
        const team = allActiveTeams[currentTeamIndex]
        try{
          if(allActiveTeams.length > 0) {
            if(team.id !== serverRoles.unknownTeam) {
              await innerUpdateTeam({guild_id: process.env.GUILD_ID, team: team?.id, dbClient})
              console.log(`${team.name} updated.`)
            }
            currentTeamIndex++
            if(currentTeamIndex>= allActiveTeams.length) {
              currentTeamIndex = 0
            }
          }
        } catch (e) {
          console.error(e)
          console.log(currentTeamIndex, team)
          await postMessage({channel_id: serverChannels.botTestingChannelId, content: `Failed to auto update ${team?.id} <@&${team?.id}> (${team.name}):`})
          await postMessage({channel_id: serverChannels.botTestingChannelId, content: JSON.stringify(e, null, 2)})
        }
      }
    ),
  ],[
    '*/9 7-22 * * *',
    callCronJob('Update National Selection',
      async function() {
        const selection = allNationalSelections[currentSelectionIndex]
        try{
          if(allNationalSelections.length > 0) {
            console.log(currentSelectionIndex, selection.shortname)
            await updateSelectionPost({selection: selection?.shortname, dbClient})
            console.log(`${selection.name} updated.`)
            currentSelectionIndex++
            if(currentSelectionIndex>= allNationalSelections.length) {
              currentSelectionIndex = 0
            }
          }
        } catch (e) {
          console.error(e)
          console.log(currentSelectionIndex, selection)
          await postMessage({channel_id: serverChannels.botTestingChannelId, content: `Failed to auto update national selection ${selection?.shortname} <@&${selection?.shortname}> (${selection.name}):`})
          await postMessage({channel_id: serverChannels.botTestingChannelId, content: JSON.stringify(e, null, 2)})
        }
      }
    ),
  ],[
    '*/2 6-22 * * *',
    callCronJob('notify match start',
      async function() {
        await notifyMatchStart({dbClient})
      }
    ),
  ],[
    '1 22 * * *',
    callCronJob('post matches summary of day',
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
      }
    ),
  ],[
    '51 22 * * 1',
    callCronJob('detectSteamAlts',
      async function () {
        await detectSteamAlts({dbClient})
      }
    ),
  /*],[
    '11 22 * * *',
    async function() {
      const refs = await getRefStatsLeaderboard({dbClient})
      console.log(refs)
      await postMessage({channel_id: serverChannels.botTestingChannelId, content: 'Match result stats:'+refs.map(ref=> `<@${ref._id}>: ${ref.finishedCount}`).join('\r')})
    }*/
  ],[
    '53 22 * * *',
    callCronJob('update league table', 
      async function() {
        for await (const league of allLeagues) {
          await updateLeagueTable({dbClient, league})
        }
      }
    ),
  ],[
    '1 22 * * *',
    callCronJob('publish next matchday',
      async function() {
        await autoPublish({dbClient})
      }
    ),
  ],[
    '34 21 * * *',
    callCronJob('remind missed matches',
      async function() {
        await remindMissedMatches({dbClient})
      }
    ),
  ],[
    '1 12 * * *',
    callCronJob('validate steam IDs',
      async function() {
        await internalValidateSteamId({dbClient})
      }
    ),
/*  ],[
    '31 12 * * *',
    async function() {
      await internalUpdateRegister({dryrun: false, guild_id: process.env.WC_GUILD_ID, dbClient})
    },
  ],[
    '51 12 * * *',
    async function() {
      await internalUpdateRegister({dryrun: false, guild_id: process.env.GUILD_ID, dbClient})
    },*/
  ],[
    '11 11,15,19 * * *',
    callCronJob('update steam names',
      async function() {
        await updateSteamNames({dbClient})
      }
    ),
  ],[
    '0 8 * * *',
    callCronJob('update season cache',
      async function() {
        await dbClient(async ({seasonsCollect}) => {
          await updateCacheCurrentSeason(seasonsCollect)
        })
      }
    ),
  ],[
    '*/10 * * * *',
    callCronJob('Steam verified check',
      async function() {
        playerIdsToPSOCheck = await checkForPSO({dbClient, playerIdsToPSOCheck})
      }
    )
  ],[
    '1 23 * * *',
    callCronJob('find unregisted playerids',
      async function() {
        playerIdsToPSOCheck = await getUnregisteredPlayerIds()
      }
    )
  ],[
    '0 */6 * * *',
    callCronJob('refreshing search indexes',
      async function() {
        console.log('building search indexes')
        await buildPlayerSearch({dbClient})
        console.log('search indexes filled')
      }
    )
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