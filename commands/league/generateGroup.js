import { handleSubCommands, optionsToObject, updateResponse } from "../../functions/helpers.js"
import { internalCreateMatch } from "../match.js";
import { NONE, elimMatchDays, matchDays as matchDayRef, serverRoles } from "../../config/psafServerConfig.js"
import { shuffleArray } from "../../functions/helpers.js"

const generateGroup = async ({application_id, token, dbClient, options}) => {
  const {league, homeaway} = optionsToObject(options)
  const content = await dbClient(async ({leagues, teams, matches, nationalTeams, seasonsCollect, leagueConfig})=> {
    const currentLeague = await leagueConfig.findOne({value: league})
    if(!currentLeague){
      return `Can't find League ${league}`
    }
    const leagueTeams = await leagues.find({leagueId: league}).toArray()
    const teamsPerGroup = {
      'A': [],
      'B': [],
      'C': [],
      'D': []
    }
    teamsPerGroup[NONE] = []
    console.log(leagueTeams)
    leagueTeams.forEach(leagueTeam => {
      const group = leagueTeam.group || NONE
      teamsPerGroup[group] = [...teamsPerGroup[group], leagueTeam]
    })
    const groupEntries = Object.entries(teamsPerGroup)
    console.log(JSON.stringify(groupEntries))
    const groupMatchDays = groupEntries.filter(([,groupTeams])=> groupTeams.length>0 ).map(([group, groupTeams]) => {
      let matchDays = []
      const matchDayCount = groupTeams.length-1
      let [, ...teamsRotation] = groupTeams.map((leagueTeam)=> leagueTeam.team)
      for(let matchday = 0 ; matchday < matchDayCount; matchday++) {
        const currentTeamIndexes = [groupTeams[0].team, ...teamsRotation]
        const matchIndexes = []
        for(let i = 0; i < groupTeams.length/2 ; i++) {
          matchIndexes.push([currentTeamIndexes[i], currentTeamIndexes[currentTeamIndexes.length-1-i], group === 'none' ? '' : group])
        }
        matchDays.push(matchIndexes)
        teamsRotation.unshift(...teamsRotation.splice(-1, 1))
      }
      shuffleArray(matchDays)
      if(homeaway) {
        let awayMatchDays = []
        matchDays.forEach(matchDay => {
          const awayMatchday = matchDay.map(([home, away])=> [away, home])
          awayMatchDays.push(awayMatchday)
        })
        matchDays = matchDays.concat(awayMatchDays)
      }
      return matchDays
    })
    let matchesCreated = 0
    console.log(currentLeague)
    for await(const matchDays of groupMatchDays) {
      let currentMatchDay = 0
      for await(const matchDay of matchDays) {
        for await(const match of matchDay) {
          console.log(match)
          const response = await internalCreateMatch({league, home:match[0], away:match[1], isInternational:currentLeague.isInternational, matchday: matchDayRef[currentMatchDay]?.name, teams, matches, nationalTeams, seasonsCollect, leagueConfig, group: match[2]})
          console.log(response)
          matchesCreated++
        }
        currentMatchDay++
      }
    }
    return `Success, ${matchesCreated} matches created.`
  })
  return updateResponse({application_id, token, content})
}

const generateElimTree = async ({application_id, token, dbClient, options}) => {
  const {league} = optionsToObject(options)
  const content = await dbClient(async ({leagues, teams, matches, nationalTeams, seasonsCollect, leagueConfig})=> {
    const leagueObj = await leagueConfig.findOne({value: league})
    if(!leagueObj){
      return `Can't find League ${league}`
    }
    const leagueTeams = await leagues.find({leagueId: league}).sort({position: 1}).toArray()
    const isCup = leagueTeams.every(team=> !Number.isNaN(Number.parseInt(team.position)))
    if(!isCup) {
      return 'This league is not a cup, please assign positions to every single team if you want to make it a cup.'
    }
    const roundSize = elimMatchDays[leagueTeams.length] ? leagueTeams.length : 16
    let currentRoundSize = 2
    let matchDay = elimMatchDays[currentRoundSize]
    const matchesCreated = []
    while(currentRoundSize <= roundSize) {
      const matchesToCreate = []
      for(let i=0; i<currentRoundSize; i+=2){
        const matchEntry = (roundSize === currentRoundSize) ? 
        ({home: leagueTeams[i].team, away: leagueTeams[i+1].team, matchday: matchDay})
        : ({home: serverRoles.unknownTeam, away: serverRoles.unknownTeam, matchday: matchDay})
        console.log(matchEntry, roundSize, currentRoundSize, i)
        matchesToCreate.push(matchEntry)
      }
      let order = 0
      for await (const match of matchesToCreate){
        console.log(match)
        const resp = await internalCreateMatch({...match, league, isInternational:leagueObj.isInternational, teams, matches, nationalTeams, seasonsCollect, leagueConfig, order})
        matchesCreated.push(resp)
        order++
      }
      currentRoundSize *= 2
      matchDay = elimMatchDays[currentRoundSize]
    }
    return `Tournament of ${roundSize} teams, 1st round starting at ${elimMatchDays[roundSize]}. ${matchesCreated.length} matches created.`
  })
  return updateResponse({application_id, token, content})
}

const generateSubCommands = {
  'elimtree': generateElimTree,
  'league': generateGroup
}

const generateFunc = async (commandOptions) => 
  handleSubCommands(commandOptions, generateSubCommands)

const generate = {
  name: 'generate',
  description: 'Batch match generation',
  type: 1,
  psaf: true,
  func: generateFunc,
  options:[{
    name: 'league',
    description: 'Generate the league matches',
    type: 1,
    options: [{
      type: 3,
      name: 'league',
      description: 'League',
      required: true,
      autocomplete: true,
    },{
      type: 5,
      name: 'homeaway',
      description: 'With an Home Away phase?',
      required: false
    }]
  },{
    name: 'elimtree',
    description: 'Generate an elimination tree',
    type: 1,
    options: [{
      type: 3,
      name: 'league',
      description: 'League',
      required: true,
      autocomplete: true,
    },{
      type: 5,
      name: 'homeaway',
      description: 'With an Home Away phase?',
      required: false
    }]
  }]
}

export default [generate]