import player from "./commands/player.js"
import editLeague from "./commands/league/editLeague.js"
import getTeam from "./commands/teams/getTeam.js"
import nationalTeam from "./commands/nationalTeam.js"
import nationalTeamManagement from "./commands/nationalTeams/nationalTeamManagement.js"
import system from "./commands/system.js"
import lineup from "./commands/lineup/lineup.js"
import addToLeague from "./commands/league/addToLeague.js"
import transferBan from "./commands/teams/transferBan.js"
import generateGroup from "./commands/league/generateGroup.js"
import match from "./commands/match.js"
import playerPicture from "./commands/player/playerPicture.js"
import season from "./commands/season.js"
import editTeams from "./commands/editTeams.js"
import transferList from "./commands/transfers/transferList.js"

export default function() {
  return [
    ...player,
    ...editLeague,
    ...getTeam,
    ...nationalTeam,
    ...nationalTeamManagement,
    ...system,
    ...lineup,
    ...addToLeague,
    ...transferBan,
    ...generateGroup,
    ...match,
    ...playerPicture,
    ...season,
    ...editTeams,
    ...transferList,
  ]
}