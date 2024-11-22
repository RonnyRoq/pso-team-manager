import { serverChannels, serverRegions, serverRoles } from "../../config/psafServerConfig.js"
import { getCurrentSeason, handleSubCommands, optionsToObject, removeSubCommands, updateResponse } from "../../functions/helpers.js"
import { getAllPlayers } from "../../functions/playersCache.js"
import { DiscordRequest } from "../../utils.js"
import { getFastCurrentSeason } from "../season.js"


const createSelection = async ({application_id, token, options, dbClient}) => {
  const {name, shortname, region, eligiblenationality, logo, eligiblenationality2, eligiblenationality3, eligiblenationality4, eligiblenationality5} = optionsToObject(options)
  const eligibleNationalities = [...new Set([eligiblenationality, eligiblenationality2, eligiblenationality3, eligiblenationality4, eligiblenationality5])].filter(nation=>!!nation)
  const content = await dbClient(async({nationalTeams, nationalities}) => {
    const nationalitiesEntered = await nationalities.find({name: {$in: eligibleNationalities}}).toArray()
    console.log(eligibleNationalities)
    console.log(nationalitiesEntered)
    if(nationalitiesEntered.length === 0) {
      return `Can't find ${eligiblenationality} as a nationality.`
    }
    await nationalTeams.updateOne({shortname}, {$set: {name, shortname, region, eligibleNationalities, logo, active: true}}, {upsert: true})
    
    return getSelectionDetails({name, shortname, region, eligibleNationalities, logo}, nationalitiesEntered, [], true)
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
    
    return getSelectionDetails(payload, nationalitiesEntered, nationalPlayers, true)
  })
  return updateResponse({application_id, token, content})
}

export const updateSelectionPost = async ({selection, dbClient}) => {
  return dbClient(async ({nationalTeams, nationalities, nationalContracts})=> {
    const season = getFastCurrentSeason()
    const nationalTeam = await nationalTeams.findOne({shortname: selection})
    const selectedNationalities = await nationalities.find({name: {$in: nationalTeam.eligibleNationalities}}).toArray()
    const nationalPlayers = await nationalContracts.find({season, selection}).toArray()
    const content = getSelectionDetails(nationalTeam, selectedNationalities, nationalPlayers)
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

export const getSelectionDetails = (nationalTeam, nationalities, players, showLogo) => {
  const nationalitiesForFlags = nationalities.filter(nationality=> nationalTeam.eligibleNationalities.includes(nationality.name))
  const flags = nationalitiesForFlags.map(nationality => nationality.flag)
  return `## ${flags.join(', ')} ${nationalTeam.shortname} - ${nationalTeam.name}\r
Region: ${nationalTeam.region}\r
Players: (${players.length})\r
${players.map(player => `> <@${player.playerId}>`).join('\r')}\r
${showLogo && nationalTeam.logo ? nationalTeam.logo : ''}`
}

const showSelection = async ({application_id, token, options, dbClient}) => {
  const {selection} = optionsToObject(options)
  const content = await dbClient(async({nationalTeams, nationalities, nationalContracts, seasonsCollect}) => {
    const season = await getCurrentSeason(seasonsCollect)
    const nationalTeam = await nationalTeams.findOne({shortname: selection})
    const eligibleNationalities = await nationalities.find({name: {$in: nationalTeam.eligibleNationalities}}).toArray()
    const nationalPlayers = await nationalContracts.find({season, selection: nationalTeam.shortname}).toArray()
    return getSelectionDetails(nationalTeam, eligibleNationalities, nationalPlayers, true)
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
    name: 'eligiblenationality2',
    description: 'Which nationality can play for this selection',
    autocomplete: true,
  },{
    type: 3,
    name: 'eligiblenationality3',
    description: 'Which nationality can play for this selection',
    autocomplete: true,
  },{
    type: 3,
    name: 'eligiblenationality4',
    description: 'Which nationality can play for this selection',
    autocomplete: true,
  },{
    type: 3,
    name: 'eligiblenationality5',
    description: 'Which nationality can play for this selection',
    autocomplete: true,
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