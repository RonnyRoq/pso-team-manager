import { serverChannels, serverRegions, serverRoles } from "../../config/psafServerConfig.js"
import { getCurrentSeason, handleSubCommands, optionsToObject, removeSubCommands, updateResponse } from "../../functions/helpers.js"
import { getAllPlayers } from "../../functions/playersCache.js"
import { DiscordRequest } from "../../utils.js"
import { getFastCurrentSeason } from "../season.js"


const createSelection = async ({application_id, token, options, dbClient}) => {
  const {name, shortname, region, eligiblenationality, logo} = optionsToObject(options)
  const content = await dbClient(async({nationalTeams, nationalities}) => {
    const nationality = await nationalities.findOne({name: eligiblenationality})
    if(!nationality) {
      return `Can't find ${eligiblenationality} as a nationality.`
    }
    await nationalTeams.updateOne({shortname}, {$set: {name, shortname, region, eligiblenationality, logo, active: true}}, {upsert: true})
    
    return getSelectionDetails({name, shortname, region, eligiblenationality, logo}, nationality, [], true)
  })
  return updateResponse({application_id, token, content})
}

const disableSelection = async ({application_id, token, options, dbClient}) => {
  const {selection} = optionsToObject(options)
  const content = await dbClient(async ({nationalTeams}) => {
    await nationalTeams.updateOne({shortname:selection}, {$set: {active: false}})
    return `${selection} disabled`
  })
  return updateResponse({application_id, token, content})
}

const editSelection = async ({application_id, token, options, dbClient})=> {
  const {selection, name, shortname, region, eligiblenationality, logo} = optionsToObject(options)
  const content = await dbClient(async({nationalTeams, nationalities, nationalContracts, seasonsCollect}) => {
    const season = await getCurrentSeason(seasonsCollect)
    const nationalTeam = await nationalTeams.findOne({shortname: selection})
    const nationality = await nationalities.findOne({name: eligiblenationality || nationalTeam.eligiblenationality})
    const payload = {
      name: name || nationalTeam.name,
      shortname: shortname || nationalTeam.shortname,
      region: region || nationalTeam.region,
      eligiblenationality: eligiblenationality || nationalTeam.eligiblenationality,
      logo: logo || nationalTeam.logo,
    }
    await nationalTeams.updateOne({shortname: selection}, {$set: payload})
    const nationalPlayers = await nationalContracts.find({season, selection: nationalTeam.shortname}).toArray()
    
    return getSelectionDetails(payload, nationality, nationalPlayers, true)
  })
  return updateResponse({application_id, token, content})
}

export const updateSelectionPost = async ({selection, dbClient}) => {
  return dbClient(async ({nationalTeams, nationalities, nationalContracts})=> {
    const season = getFastCurrentSeason()
    const nationalTeam = await nationalTeams.findOne({shortname: selection})
    const nationality = await nationalities.findOne({name: nationalTeam.eligiblenationality})
    const nationalPlayers = await nationalContracts.find({season, selection}).toArray()
    const content = getSelectionDetails(nationalTeam, nationality, nationalPlayers)
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
    await discNationalPlayers.forEach(async discPlayer => {
      await DiscordRequest(`guilds/${process.env.GUILD_ID}/members/${discPlayer.user.id}`, {
        method: 'PATCH',
        body: {
          roles: [...new Set([...discPlayer.roles, serverRoles.nationalTeamPlayerRole])]
        }
      })
    })
  })
}

export const getSelectionDetails = (nationalTeam, nationality, players, showLogo) => `## ${nationality.flag} ${nationalTeam.shortname} - ${nationalTeam.name}\r
Region: ${nationalTeam.region}\r
Players: (${players.length})\r
${players.map(player => `> <@${player.playerId}>`).join('\r')}\r
${showLogo && nationalTeam.logo ? nationalTeam.logo : ''}`

const showSelection = async ({application_id, token, options, dbClient}) => {
  const {selection} = optionsToObject(options)
  const content = await dbClient(async({nationalTeams, nationalities, nationalContracts, seasonsCollect}) => {
    const season = await getCurrentSeason(seasonsCollect)
    const nationalTeam = await nationalTeams.findOne({shortname: selection})
    const eligibleNationality = await nationalities.findOne({name: nationalTeam.eligiblenationality})
    const nationalPlayers = await nationalContracts.find({season, selection: nationalTeam.shortname}).toArray()
    return getSelectionDetails(nationalTeam, eligibleNationality, nationalPlayers, true)
  })
  return updateResponse({application_id, token, content})
}

export const adminSelections = async (commandPayload) => {
  return handleSubCommands(commandPayload, adminSelectionSubCommands)
}

const createSelectionCmd = {
  type: 1,
  name: 'create',
  description: 'Create a national selection',
  func: createSelection,
  options: [{
    type: 3,
    name: 'name',
    description: 'Selection\'s name',
    required: true
  },{
    type: 3,
    name: 'shortname',
    description: '3-4 letter for the selection',
    required: true,
    min_length: 3,
    max_length: 4
  },{
    type: 3,
    name: 'eligiblenationality',
    description: 'Which nationality can play for this selection',
    autocomplete: true,
    required: true,
  },{
    type: 3,
    name: 'region',
    description: 'Which region this team plays in',
    choices: serverRegions.map((region)=> ({name: region.name, value:region.name})),
    required: true
  },{
    type: 3,
    name: 'logo',
    description: 'The selection\'s logo URL',
  }]
}

const disableSelectionCmd = {
  type: 1,
  name: 'disable',
  description: 'Disable a national selection',
  func: disableSelection,
  options: [{
    type: 3,
    name: 'selection',
    description: 'Which National Selection',
    autocomplete: true,
    required: true
  }]
}

const editSelectionCmd = {
  type: 1,
  name: 'edit',
  description: 'Edit a national selection',
  func: editSelection,
  options: [{
    type: 3,
    name: 'selection',
    description: 'Which National Selection',
    autocomplete: true,
    required: true
  },
    ...createSelectionCmd.options.map(option=>({
      ...option,
      required: false
    }))
  ]
}

const showSelectionCmd = {
  type: 1,
  name: 'show',
  description: 'Show a National Selection',
  func: showSelection,
  options: [{
    type: 3,
    name: 'selection',
    description: 'Which National Selection',
    autocomplete: true,
    required: true,
  }]
}


export const adminSelectionCmd = {
  name: 'adminselection',
  description: 'Commands for administrating national selections',
  psaf: true,
  func: adminSelections,
  options: [
    createSelectionCmd,
    disableSelectionCmd,
    editSelectionCmd,
    showSelectionCmd
  ]
}

const adminSelectionSubCommands = Object.fromEntries(adminSelectionCmd.options.map(subCommand => [subCommand.name, subCommand.func]))

const commands = removeSubCommands([adminSelectionCmd])
export default commands