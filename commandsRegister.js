import player from "./commands/player.js"
import confirm from "./commands/confirm.js"
import editLeague from "./commands/league/editLeague.js"
import getTeam from "./commands/teams/getTeam.js"
import nationalTeam from "./commands/nationalTeam.js"
import nationalTeamManagement from "./commands/nationalTeams/nationalTeamManagement.js"
import system from "./commands/system.js"
import lineup from "./commands/lineup/lineup.js"
import addToLeague from "./commands/league/addToLeague.js"
import leagueTeams from "./commands/league/leagueTeams.js"
import leagueTable from "./commands/league/leagueTable.js"
import transferBan from "./commands/teams/transferBan.js"
import generateGroup from "./commands/league/generateGroup.js"
import match from "./commands/match.js"
import matchday from "./commands/matches/matchday.js"
import playerPicture from "./commands/player/playerPicture.js"
import season from "./commands/season.js"
import editTeams from "./commands/editTeams.js"
import transferList from "./commands/transfers/transferList.js"
import listDeals from "./commands/confirmations/listDeals.js"
import contracts from "./commands/contracts.js"
import team from "./commands/team.js"
import search from "./commands/search/search.js"
import register from "./commands/register.js"
import transfers from "./commands/transfers.js"

export default function() {
  return [
    ...player,
    ...confirm,
    ...editLeague,
    ...getTeam,
    ...transfers,
    ...nationalTeam,
    ...nationalTeamManagement,
    ...system,
    ...lineup,
    ...addToLeague,
    ...leagueTeams,
    ...leagueTable,
    ...transferBan,
    ...generateGroup,
    ...match,
    ...matchday,
    ...playerPicture,
    ...register,
    ...season,
    ...editTeams,
    ...transferList,
    ...listDeals,
    ...contracts,
    ...team,
    ...search,
  ]
}