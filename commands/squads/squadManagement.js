import { serverChannels, serverRegions, serverRoles } from "../../config/psafServerConfig"
import { getCurrentSeason, handleSubCommands, optionsToObject, removeSubCommands, updateResponse } from "../../functions/helpers"
import { getAllPlayers } from "../../functions/playersCache"
import { DiscordRequest } from "../../utils"
import { getFastCurrentSeason } from "../season"


const createSquad = async ({application_id, token, options, dbClient}) => {
  const {name, shortname, region, country, logo} = optionsToObject(options)
  const content = await dbClient(async({squads, nationalities}) => {
    const foundSquad = await squads.findOne({shortname})
    if(foundSquad) {
      return `A squad with the shortname ${shortname} already exists: ${foundSquad.name}`
    }
    const countryObj = await nationalities.findOne({name: country})
    await squads.updateOne({shortname}, {$set: {name, shortname, region, country, logo, active: true}}, {upsert: true})
    
    return getSquadDetails({name, shortname, region, country, logo}, countryObj, [], true)
  })
  return updateResponse({application_id, token, content})
}

const disableSquad = async ({application_id, token, options, dbClient}) => {
  const {squad} = optionsToObject(options)
  const content = await dbClient(async ({squads}) => {
    await squads.updateOne({shortname:squad}, {$set: {active: false}})
    return `${squad} disabled`
  })
  return updateResponse({application_id, token, content})
}

const enableSquad = async ({application_id, token, options, dbClient}) => {
  const {squad} = optionsToObject(options)
  const content = await dbClient(async ({squads}) => {
    await squads.updateOne({shortname:squad}, {$set: {active: true}})
    return `${squad} enabled`
  })
  return updateResponse({application_id, token, content})
}


const editSquad = async ({application_id, token, options, dbClient})=> {
  const {selection, name, shortname, region, eligiblenationality, logo, eligiblenationality2, eligiblenationality3, eligiblenationality4, eligiblenationality5} = optionsToObject(options)
  let eligibleNationalities = [...new Set([eligiblenationality, eligiblenationality2, eligiblenationality3, eligiblenationality4, eligiblenationality5])]
  const content = await dbClient(async({nationalTeams, nationalities, nationalContracts, seasonsCollect}) => {
    const season = await getCurrentSeason(seasonsCollect)
    const nationalTeam = await nationalTeams.findOne({shortname: selection})
    const allConcernedNationalities = [... new Set([...eligibleNationalities, ...(nationalTeam.eligibleNationalities || [])])]
    const nationalitiesEntered = await nationalities.find({name: {$in: allConcernedNationalities}}).toArray()
    if(!(eligibleNationalities?.[0])) {
      eligibleNationalities = nationalTeam.eligibleNationalities || []
    }
    const payload = {
      name: name || nationalTeam.name,
      shortname: shortname || nationalTeam.shortname,
      region: region || nationalTeam.region,
      eligibleNationalities: eligibleNationalities,
      logo: logo || nationalTeam.logo,
    }
    await nationalTeams.updateOne({shortname: selection}, {$set: payload})
    const nationalPlayers = await nationalContracts.find({season, selection: nationalTeam.shortname}).toArray()
    
    return getSquadDetails(payload, nationalitiesEntered, nationalPlayers, true)
  })
  return updateResponse({application_id, token, content})
}

export const updateSquadPost = async ({selection, dbClient}) => {
  const season = getFastCurrentSeason()
  return dbClient(async ({nationalTeams, nationalities, nationalContracts})=> {
    const nationalTeam = await nationalTeams.findOne({shortname: selection})
    const selectedNationalities = await nationalities.find({name: {$in: nationalTeam.eligibleNationalities}}).toArray()
    const nationalPlayers = await nationalContracts.find({season, selection}).toArray()
    const content = getSquadDetails(nationalTeam, selectedNationalities, nationalPlayers)
    const payload = {}
    if(nationalTeam.psafMsg) {
      try {
        await DiscordRequest(`/channels/${serverChannels.nationalTeamsPostsChannelId}/messages/${nationalTeam.psafLogo}`, {
          method: 'PATCH',
          body: {
            content: nationalTeam.logo || '--'
          }
        })
        await DiscordRequest(`/channels/${serverChannels.nationalTeamsPostsChannelId}/messages/${nationalTeam.psafMsg}`, {
          method: 'PATCH',
          body: {
            content
          }
        })
      }
      catch(e) {
        nationalTeam.psafMsg = null
        nationalTeam.psafLogo = null
        await nationalTeams.updateOne({shortname: nationalTeam.shortname}, {$set: {psafMsg: null, psafLogo: null}})
      }
    } else {
      const psafResp = await DiscordRequest(`/channels/${serverChannels.nationalTeamsPostsChannelId}/messages`, {
        method: 'POST',
        body: {
          content: nationalTeam.logo || '--'
        }
      })
      const psafMessage = await psafResp.json()
      payload.psafLogo = psafMessage.id
      const resp = await DiscordRequest(`/channels/${serverChannels.nationalTeamsPostsChannelId}/messages`, {
        method: 'POST',
        body: {
          content
        }
      })
      const message = await resp.json()
      payload.psafMsg = message.id
    }

    if(Object.keys(payload).length>0) {
      await nationalTeams.updateOne({shortname:nationalTeam.shortname}, {$set: {...payload}})
    }

    const allPlayers = await getAllPlayers(process.env.GUILD_ID)
    const nationalPlayersId = nationalPlayers.map(dbPlayer => dbPlayer.playerId)
    const discNationalPlayers = allPlayers.filter(player=> nationalPlayersId.includes(player.user.id))
    for await (const discPlayer of discNationalPlayers) {
      await DiscordRequest(`guilds/${process.env.GUILD_ID}/members/${discPlayer.user.id}`, {
        method: 'PATCH',
        body: {
          roles: [...new Set([...discPlayer.roles, serverRoles.nationalTeamPlayerRole])]
        }
      })
    }
  })
}

export const getSquadDetails = (squad, countryObj, players, showLogo) => {
  return `## ${countryObj?.flag || ''} ${squad.shortname} - ${squad.name}\r
Region: ${squad.region}\r
Players: (${players.length})\r
${players.map(player => `> <@${player.playerId}>`).join('\r')}\r
${showLogo && squad.logo ? squad.logo : ''}`
}

export const getSquad = async ({dbClient, shortname, name}) => 
  dbClient(async({nationalTeams, nationalities, nationalContracts, seasonsCollect}) => {
    const season = await getCurrentSeason(seasonsCollect)
    const nationalTeam = await nationalTeams.findOne({$or: [{shortname}, {name}]})
    const eligibleNationalities = await nationalities.find({name: {$in: nationalTeam.eligibleNationalities}}).toArray()
    const nationalPlayers = await nationalContracts.find({season, selection: nationalTeam.shortname}).toArray()
    return {nationalTeam, eligibleNationalities, nationalPlayers}
  })

const showSquad = async ({application_id, token, options, dbClient}) => {
  const {selection} = optionsToObject(options)
  const content = await dbClient(async({nationalTeams, nationalities, nationalContracts, seasonsCollect}) => {
    const season = await getCurrentSeason(seasonsCollect)
    const nationalTeam = await nationalTeams.findOne({shortname: selection})
    const eligibleNationalities = await nationalities.find({name: {$in: nationalTeam.eligibleNationalities}}).toArray()
    const nationalPlayers = await nationalContracts.find({season, selection: nationalTeam.shortname}).toArray()
    return getSquadDetails(nationalTeam, eligibleNationalities, nationalPlayers, true)
  })
  return updateResponse({application_id, token, content})
}

export const adminSquads = async (commandPayload) => {
  return handleSubCommands(commandPayload, adminSquadSubCommands)
}

const createSquadCmd = {
  type: 1,
  name: 'create',
  description: 'Create a squad',
  func: createSquad,
  options: [{
    type: 3,
    name: 'name',
    description: 'Squad\'s name',
    required: true
  },{
    type: 3,
    name: 'shortname',
    description: '3-4 letter for the squad',
    required: true,
    min_length: 3,
    max_length: 4
  },{
    type: 3,
    name: 'nationality',
    description: 'Squad\'s nationality',
    autocomplete: true,
    required: true,
  },{
    type: 3,
    name: 'region',
    description: 'Which region this squad plays in',
    choices: serverRegions.map((region)=> ({name: region.name, value:region.name})),
    required: true
  },{
    type: 3,
    name: 'logo',
    description: 'The squad\'s logo URL',
  }]
}

const enableSquadCmd = {
  type: 1,
  name: 'enable',
  description: 'Enable a squad',
  func: enableSquad,
  options: [{
    type: 3,
    name: 'squad',
    description: 'Which Squad',
    autocomplete: true,
    required: true
  }]
}

const disableSquadCmd = {
  type: 1,
  name: 'disable',
  description: 'Disable a squad',
  func: disableSquad,
  options: [{
    type: 3,
    name: 'squad',
    description: 'Which Squad',
    autocomplete: true,
    required: true
  }]
}

const editSquadCmd = {
  type: 1,
  name: 'edit',
  description: 'Edit a squad',
  func: editSquad,
  options: [{
    type: 3,
    name: 'squad',
    description: 'Which Squad',
    autocomplete: true,
    required: true
  },
    ...createSquadCmd.options.map(option=>({
      ...option,
      required: false
    }))
  ]
}

const showSquadCmd = {
  type: 1,
  name: 'show',
  description: 'Show a Squad',
  func: showSquad,
  options: [{
    type: 3,
    name: 'squad',
    description: 'Which Squad',
    autocomplete: true,
    required: true,
  }]
}


export const adminSquadCmd = {
  name: 'adminsquad',
  description: 'Commands for administrating squads',
  psaf: true,
  func: adminSquads,
  options: [
    createSquadCmd,
    enableSquadCmd,
    disableSquadCmd,
    editSquadCmd,
    showSquadCmd
  ]
}

const adminSquadSubCommands = Object.fromEntries(adminSquadCmd.options.map(subCommand => [subCommand.name, subCommand.func]))

const commands = removeSubCommands([adminSquadCmd])
export default commands