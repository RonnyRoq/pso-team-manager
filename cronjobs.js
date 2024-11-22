import { CronJob } from "cron"
import { getMatchesOfDay, getMatchesSummary, remindMissedMatches } from "./commands/match.js"
import { innerUpdateTeam } from "./commands/postTeam.js"
import { notifyMatchStart } from "./commands/matches/notifyMatchStart.js"
import { DiscordRequest } from "./utils.js"
import { serverChannels, serverRoles } from "./config/psafServerConfig.js"
import { updateLeagueTable } from "./commands/league/leagueTable.js"
import { autoPublish } from "./commands/matches/matchday.js"
import { checkForPSO, detectSteamAlts, getUnregisteredPlayerIds, internalValidateSteamId, updateSteamNames } from "./commands/system.js"
import { updateSelectionPost } from "./commands/nationalTeams/nationalTeamManagement.js"
import { updateCacheCurrentSeason } from "./commands/season.js"
import { postMessage } from "./functions/helpers.js"

let currentTeamIndex = 0
let currentSelectionIndex = 0
let playerIdsToPSOCheck = []
export const initCronJobs = ({dbClient, allActiveTeams, allNationalSelections, allLeagues}) => {
  const cronJobs = [[
    '1 9 * * *',
    async function() {
      getMatchesOfDay({date:'today', dbClient, isSchedule: true})
    },
  ],[
    '*/5 * * * *',
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
    },
  ],[
    '*/9 7-22 * * *',
    async function() {
      console.log('Updating National Selections')
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
    '51 22 * * 1',
    async function () {
      await detectSteamAlts({dbClient})
    }
  /*],[
    '11 22 * * *',
    async function() {
      const refs = await getRefStatsLeaderboard({dbClient})
      console.log(refs)
      await postMessage({channel_id: serverChannels.botTestingChannelId, content: 'Match result stats:'+refs.map(ref=> `<@${ref._id}>: ${ref.finishedCount}`).join('\r')})
    }*/
  ],[
    '53 22 * * *',
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
  ],[
    '*/10 * * * *',
    async function() {
      playerIdsToPSOCheck = await checkForPSO({dbClient, playerIdsToPSOCheck})
    }
  ],[
    '1 23 * * *',
    async function() {
      playerIdsToPSOCheck = await getUnregisteredPlayerIds()
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