import { serverChannels, serverRoles } from "../config/psafServerConfig.js"
import { getAllNationalities } from "../functions/allCache.js"
import { addPlayerPrefix, getPlayerNick, getRegisteredRole, optionsToObject, sendDM, updateResponse, waitingMsg } from "../functions/helpers.js"
import { getPSOSteamDetails, isSteamIdIncorrect } from "../functions/steamUtils.js"
import { DiscordRequest, logSystemError } from "../utils.js"


const summaryToText = (psoSummary) => {
  let lines = []
  if(psoSummary.message)
    lines.push(`${psoSummary.isPrivate ? 'PRIVATE ACCOUNT' : ``} ${psoSummary.message}`)
  if(psoSummary.playtime_forever)
    lines.push(`Total PSO hours: ${psoSummary.playtime_forever/60}h`)
  if(psoSummary.playtime_2weeks)
    lines.push(`Played PSO over the last 2 weeks: ${psoSummary.playtime_2weeks/60}h`)
  if(psoSummary.communityState !== undefined)
    lines.push(`Steam visibility: ${psoSummary.communityState}`)
  if(psoSummary.discordCreated) 
    lines.push(`Discord Account creation date: ${psoSummary.discordCreated}`)
  if(psoSummary.discordJoined)
    lines.push(`Joined PSAF at: ${psoSummary.discordJoined}`)

  return lines.join('\r')
}

const register = async ({member, callerId, interaction_id, guild_id, application_id, token, options, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const {nationality, extranat, steamprofileurl, uniqueid} = optionsToObject(options)
  const steam = steamprofileurl
    
  const content = await dbClient(async ({players, contracts, teams})=> {
    try {
      const [dbPlayer, allCountries, activeContracts] = await Promise.all([
        players.findOne({id: callerId}),
        getAllNationalities(),
        contracts.find({playerId: callerId, endedAt: null}).toArray()
      ])
      const activeContract = activeContracts.find(contract=>contract.isLoan) || activeContracts.find(contract=>!contract.isLoan)
      let currentTeam = null
      if(activeContract) {
        console.log(activeContract)
        currentTeam = await teams.findOne({id: activeContract.team})
      }
      const nat1 = dbPlayer?.nat1 || nationality
      const nat2 = dbPlayer?.nat1 ? dbPlayer.nat2 : (extranat !== nationality ? extranat : null)
      const nat3 = dbPlayer?.nat3
      let steamUrl = dbPlayer?.steam || ""
      if(!steamUrl || !(steamUrl.includes("steamcommunity.com/profiles/") || steamUrl.includes("steamcommunity.com/id/"))) {
        console.log(`New user ( ${steamUrl} - ${steam} ), using the steam profile entered with the command`)
        steamUrl = steam.endsWith('/') ? steam : `${steam}/`
      } else {
        console.log("Keeping the steam ID already registered")
      }
      const {flag: flag1 = ''} = allCountries.find(({name})=> name === nat1) || {}
      const {flag: flag2 = ''} = allCountries.find(({name})=> name === nat2) || {}
      const {flag: flag3 = ''} = allCountries.find(({name})=> name === nat3) || {}
      const uniqueId = dbPlayer?.uniqueId || uniqueid
      let userDetails = [`${flag1}${flag2}${flag3}<@${callerId}>`,
        `Steam: ${dbPlayer?.steam}`,
        `Unique ID: ${dbPlayer?.uniqueId}`
        ].join('\r')

      if(member.roles.includes(serverRoles.registeredRole) && dbPlayer) {
        return `You're already registered:\r${userDetails}\rPSO Steam validated: ${dbPlayer?.steamVerified ? 'yes': dbPlayer?.steamValidation}`
      }
      if(member.roles.includes(serverRoles.matchBlacklistRole) || member.roles.includes(serverRoles.permanentlyBanned)) {
        return 'Can\'t register while blacklisted.'
      }
      if(!member.roles.includes(serverRoles.verifiedRole)){
        return 'Please verify before confirming.'
      }

      let psoSummary = await getPSOSteamDetails({steamUrl, playerId: callerId, member})

      if(!steamUrl) {
        console.log('no steam', steamUrl)
        return 'Please enter your Steam Profile address. If you can\'t, please open a ticket and have your Steam URL and PSO Unique ID ready.'
      }
      const steamCheckFailed = isSteamIdIncorrect(steamUrl)
      if(steamCheckFailed){
        return steamCheckFailed
      }
      if(!nationality) {
        return 'Please select a nationality'
      }
      if(extranat && extranat === nationality) {
        return 'No need to enter the same nationality as an extra one :)'
      }
      if(!allCountries.find(({name})=> name === nationality)) {
        return `Can't find ${nationality}, please select one of the nationalities of the autofill`
      }
      if(extranat && !allCountries.find(({name})=> name === extranat)) {
        return `Can't find ${extranat}, please select one of the nationalities of the autofill`
      }

      let nick = getPlayerNick(member)
      const teamSeparator = ' | '

      if(nick.includes(teamSeparator)) {
        nick = nick.substring(nick.indexOf(teamSeparator) + teamSeparator.length)
      }
      if(currentTeam) {
        nick = addPlayerPrefix(currentTeam.shortName, nick)
      }

      const updatedPlayer = {
        nick,
        nat1,
        nat2,
        nat3,
        steam: steamUrl,
        uniqueId,
        steamVerified: psoSummary.validated,
        steamValidation: psoSummary.message
      }
      await players.updateOne({id: callerId}, {$set: updatedPlayer}, {upsert: true})
      const payload = {
        nick,
        roles: [...new Set([...member.roles, getRegisteredRole(guild_id), ...(currentTeam? [currentTeam.id, serverRoles.clubPlayerRole] : [])])]
      }
      if(psoSummary.validated) {
        payload.roles.push(serverRoles.steamVerified)
      }
      payload.roles = [...new Set(payload.roles)]
      userDetails = [
        `${flag1}${flag2}${flag3}<@${callerId}>`,
        `Steam: ${encodeURI(steamUrl || '')}`,
        `Unique ID: ${uniqueId || ''}`,
        `PSO Steam validated: ${psoSummary.validated ? 'yes': psoSummary.message}`
      ].join('\r')
      DiscordRequest(`guilds/${guild_id}/members/${callerId}`, {
        method: 'PATCH',
        body: payload
      })
      
      const content = `Registered:\r${userDetails}`
      const adminContent = content+'\r'+summaryToText(psoSummary)
      await DiscordRequest(`/channels/${serverChannels.registrationsChannelId}/messages`, {
        method: 'POST',
        body: {
          content: adminContent,
        }
      })
      await DiscordRequest(`/channels/${serverChannels.wcRegistrationChannelId}/messages`, {
        method: 'POST',
        body: {
          content,
        }
      })
      if(psoSummary.validated) {
        await sendDM({playerId:callerId, content: `You have been Steam verified.\rPSO Hours: ${(psoSummary.playtime_forever || 0)/60}.\rYou can now access transfers, and play matches.`})
      }
      return content
    } catch(e) {
      logSystemError(e.message)
      return "Failed to register. Please report this error with the exact time of request in a ticket. "+(new Date()).toISOString()
    }
  })


  return updateResponse({application_id, token, content})
}


export const registerCmd = {
  name: 'register',
  description: 'Register with PSAF',
  type: 1,
  psaf: true,
  func: register,
  options: [{
    type: 3,
    name: 'nationality',
    description: 'Nationality',
    autocomplete: true,
    required: true
  },{
    type: 3,
    name: 'steamprofileurl',
    description: 'Your steam profile URL, like https://steamcommunity.com/profiles/123456789',
    required: true,
  },{
    type: 3,
    name: 'extranat',
    description: 'Extra Nationality',
    autocomplete: true
  },{
    type: 3,
    name: 'uniqueid',
    description: 'Your PSO unique ID (aBcD7FE3)',
  }]
}

export default [registerCmd]