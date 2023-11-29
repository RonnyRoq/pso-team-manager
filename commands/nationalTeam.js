import { InteractionResponseType, InteractionResponseFlags } from "discord-interactions"
import { DiscordRequest } from "../utils.js"
import { getAllPlayers } from "../functions/playersCache.js"
import { getPlayerNick, optionsToObject, removeInternational, setInternational, sleep, updateResponse, waitingMsg } from "../functions/helpers.js"

const nationalTeamPlayerRole = '1103327647955685536'
const nationalTeamCaptainRole = '1103327640942809108'
const matchBlacklistRole = '1095055617703543025'

const getNationalTeamPostInsideDb = async (allPlayers, players, nation) => {
  const countryPlayers = await players.find({nat1: nation.name}, {projection: {id:1}}).toArray()
  const countryPlayerIds = countryPlayers.map(({id})=> id)
  const teamPlayers = allPlayers.filter(({user, roles}) => countryPlayerIds.includes(user.id) && roles.includes(nationalTeamPlayerRole)).sort((playerA, playerB) => {
    const aManager = playerA.roles.includes(nationalTeamCaptainRole)
    const bManager = playerB.roles.includes(nationalTeamCaptainRole)
    if(aManager === bManager) {
      return getPlayerNick(playerA).localeCompare(getPlayerNick(playerB))
    } else if (aManager) {
      return -1
    } else {
      return 1
    }
  })
  let response = `### ${nation.flag} - ${nation.name} ${teamPlayers.length}/18\r`
  response += teamPlayers.map(player => `> ${player.roles.includes(nationalTeamCaptainRole) ? ':crown: ':''}${player.roles.includes(matchBlacklistRole)? ':no_entry_sign:':''}<@${player.user.id}>`).join('\r')
  return {response, length:teamPlayers.length}
}

const getNationalTeamPost = async ({country, guild_id, dbClient}) => {
  const allPlayers = await getAllPlayers(guild_id)
  return dbClient(async ({players, nationalities})=>{
    const nation = await nationalities.findOne({name: country})
    return await getNationalTeamPostInsideDb(allPlayers, players, nation)
  })
}

export const updateNationalTeam = async ({guild_id, nation, players, nationalities})=> {
  const allPlayers = await getAllPlayers(guild_id)
  const {response, length} = await getNationalTeamPostInsideDb(allPlayers, players, nation)
  if(nation.messageId) {
    await DiscordRequest(`/channels/1091749687356297307/messages/${nation.messageId}`, {
      method: 'PATCH',
      body: {
        content: response
      }
    })
  } else if(length>0) {
    const postResponse = await DiscordRequest('/channels/1091749687356297307/messages', {
      method: 'POST',
      body: {
        content: response
      }
    })
    const message = await postResponse.json()
    await nationalities.updateOne({name: nation.name}, {$set: {messageId: message.id}})
  }
}

export const nationalTeam = async ({options, interaction_id, guild_id, application_id, token, dbClient}) => {
  const {country} = Object.fromEntries(options.map(({name, value})=> [name, value]))
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Searching...',
        flags: 1 << 6
      }
    }
  })
  const {response} = await getNationalTeamPost({country, guild_id, dbClient})
  return DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      content: response,
    }
  })
}

export const allNationalTeams =  async ({interaction_id, guild_id, application_id, token, dbClient}) => {
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Searching...',
        flags: 1 << 6
      }
    }
  })
  const allPlayers = await getAllPlayers(guild_id)
  dbClient(async ({players, nationalities})=>{
    const allNations = nationalities.find({})
    for await(const nation of allNations) {
      const {response, length} = await getNationalTeamPostInsideDb(allPlayers, players, nation)
      if(length>0) {
        await DiscordRequest('/channels/1150376229178978377/messages', {
          method: 'POST',
          body: {
            content: response
          }
        })
        await sleep(1000)
      }
    }
  })

  return DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      content: 'Done',
    }
  })
}

export const postNationalTeams = async({application_id, interaction_id, guild_id, token, dbClient, options}) => {
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL
      }
    }
  })
  const updateFunction = (team) => {
    DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
      method: 'PATCH',
      body: {
        type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        content: `Updated ${team}`,
      }
    })
  }
  const {country} = Object.fromEntries(options.map(({name, value})=> [name, value]))

  await updateNationalTeams({guild_id, dbClient, updateFunction, country})

  return DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      content: 'Done',
    }
  })
}

export const updateNationalTeams = async({guild_id, dbClient, updateFunction, country}) => {
  const allPlayers = await getAllPlayers(guild_id)
  await dbClient(async ({players, nationalities})=>{
    const allNations = nationalities.find({})
    for await(const nation of allNations) {
      if(nation.name !== country)
        continue
      const {response, length} = await getNationalTeamPostInsideDb(allPlayers, players, nation)
      if(length>0) {
        if(nation.messageId) {
          await DiscordRequest(`/channels/1091749687356297307/messages/${nation.messageId}`, {
            method: 'PATCH',
            body: {
              content: response
            }
          })
        } else {
          const postResponse = await DiscordRequest('/channels/1091749687356297307/messages', {
            method: 'POST',
            body: {
              content: response
            }
          })
          const message = await postResponse.json()
          await nationalities.updateOne({name: nation.name}, {$set: {messageId: message.id}})
        }
        updateFunction(nation.name)
        await sleep(1000)
      }
    }
  })
}

export const addSelection = async ({options, dbClient, guild_id, application_id, token, interaction_id}) => {
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: 1 << 6
      }
    }
  })
  const {player, country} = Object.fromEntries(options.map(({name, value})=> [name, value]))
  const discordPlayerResp = await DiscordRequest(`/guilds/${guild_id}/members/${player}`, {method: 'GET'})
  const discordPlayer = await discordPlayerResp.json()
  const response = await dbClient(async ({players, nationalities}) => {
    const foundPlayer = await players.findOne({id: player})
    const nation = await nationalities.findOne({name: country})
    if(foundPlayer && foundPlayer.nat1 === nation.name) {
      const nick = setInternational(getPlayerNick(discordPlayer))
      await Promise.all([
        DiscordRequest(`/guilds/${guild_id}/members/${player}`, {
          method: 'PATCH',
          body: {
            roles: [...new Set([...discordPlayer.roles, nationalTeamPlayerRole])],
            nick
          }
        }),
        players.updateOne({id:player}, {$set: {nick}})
      ])
      await updateNationalTeam({guild_id, nation, nationalities, players})
      return `<@${player}> added in ${country}'s national team`
    }
    return 'Did not add player - did you check if he\'s eligible?'
  })

  return DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      content: response,
    }
  })
}

export const removeSelection = async ({options, dbClient, guild_id, application_id, token, interaction_id}) => {
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: 1 << 6
      }
    }
  })
  const {player} = Object.fromEntries(options.map(({name, value})=> [name, value]))
  const discordPlayerResp = await DiscordRequest(`/guilds/${guild_id}/members/${player}`, {method: 'GET'})
  const discordPlayer = await discordPlayerResp.json()
  const response = await dbClient(async ({players, nationalities}) => {
    const nick = removeInternational(getPlayerNick(discordPlayer))
    const  [, dbPlayer] = await Promise.all([
      DiscordRequest(`/guilds/${guild_id}/members/${player}`, {
        method: 'PATCH',
        body: {
          roles: discordPlayer.roles.filter(role => role !== nationalTeamPlayerRole && role !== nationalTeamCaptainRole),
          nick
        }
      }),
      players.findOneAndUpdate({id: player}, {$set: {nick}}, {returnDocument: 'after', upsert: true})
    ])
    const nation = await nationalities.findOne({name: dbPlayer.nat1})
    await updateNationalTeam({guild_id, nation, nationalities, players})
    return `<@${player}> removed from national teams`
  })

  return DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      content: response,
    }
  })
}

export const registerElections = async ({options, dbClient, interaction_id, callerId, token, application_id}) => {
  await waitingMsg({interaction_id, token})
  const {nation, reason} = optionsToObject(options)
  const content = await dbClient(async ({players, nationalities, candidates})=> {
    const [existingCandidate, dbPlayer] = await Promise.all([
      candidates.findOne({playerId: callerId}),
      players.findOne({id: callerId}),
      nationalities.find({}).toArray()
    ])
    if(existingCandidate) {
      return `You already applied for ${existingCandidate.nation}`
    }
    if(!dbPlayer || !dbPlayer.nat1) {
      return `You are not registered with us. If you think it's an error, please open a ticket. Only club players/managers can apply.`
    }
    if(dbPlayer.nat1 !== nation) {
      if(dbPlayer.nat2 === nation) {
        return `You're not applying for your "main" country described in /myplayer. Please open a ticket if you wish to swap nations.`
      } else {
        return `You can only apply for your country.`
      }
    }
    await candidates.insertOne({playerId: callerId, nation, reason})
    return `Application saved for ${nation}.`
  })
  await updateResponse({application_id, token, content})
  
}

export const showElectionCandidates = async ({interaction_id, token, application_id, dbClient}) => {
  await DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'All candidates for elections:'
      }
    }
  })
  const [allCandidates, allNations] = await dbClient (async ({nationalities, candidates})=> 
    Promise.all([candidates.find({}).toArray(), nationalities.find({}).toArray()])
  )
  for await(const candidate of allCandidates) {
    const candidateNation = allNations.find(({name})=> name === candidate.nation)
    const content = `${candidateNation.flag} ${candidateNation.name} <@${candidate.playerId}> : ${candidate.reason}`
    await DiscordRequest(`/webhooks/${application_id}/${token}`, {
      method: 'POST',
      body: {
        content,
      }
    })
  }
}

export const voteCoach = async ({interaction_id, callerId, guild_id, token, application_id, dbClient}) => {
  await waitingMsg({interaction_id, token})
  const allPlayers = await getAllPlayers(guild_id)
  const response = await dbClient(async({nationalities, players, candidates})=> {
    const dbPlayer = await players.findOne({id: callerId})
    const nationality = await nationalities.findOne({name: dbPlayer.nat1})
    if(!dbPlayer.nat1) {
      return {content: 'Can\'t find your nationality. Did you register with a club?'}
    }
    const candidatesToVote = await candidates.find({nation: dbPlayer.nat1}).toArray()
    const candidatesIds = candidatesToVote.map(candidate=>candidate.playerId)
    const candidatesPlayers = allPlayers.filter(player => candidatesIds.includes(player.user.id))
    if(candidatesToVote.length === 0) {
      return {content: `No candidates applied for ${nationality.flag} ${dbPlayer.nat1}, you can't vote.`}
    }
    if(candidatesToVote.length === 1) {
      return {content: `Only one candidate applied for ${nationality.flag} ${dbPlayer.nat1}, <@${candidatesToVote[0].playerId}>. No need to vote.`}
    }
    return {
      content: `Please vote for a candidate for ${nationality.flag} ${dbPlayer.nat1}`,
      components: [{
        type: 1,
        components: candidatesPlayers.map((player) => {
          return {
            type: 2,
            label: `${getPlayerNick(player)}`,
            style: 2,
            custom_id: `vote_${player.user.id}`
          }
        })
      }]
    }
  })
  return DiscordRequest(`/webhooks/${application_id}/${token}/messages/@original`, {
    method: 'PATCH',
    body: {
      ...response,
      flags: 1 << 6
    }
  })
}

export const showVotes = async ({interaction_id, token, application_id, options, dbClient}) => {
  const {nation} = optionsToObject(options)
  console.log(nation)
  await waitingMsg({interaction_id, token})
  const content = await dbClient(async ({votes})=> {
    const votingOptions = await votes.aggregate([
      { $match: { nation } },
      { $group: { _id: "$coachVote", count: { $sum: 1 } } }
    ]).toArray()
    console.log(votingOptions)
    return votingOptions.map(({_id, count}) => `<@${_id}> : ${count}`).join('\r')
  })
  await updateResponse({application_id, token, content: content || 'No result'})
}

export const voteCoachCmd = {
  name: 'votecoach',
  description: 'Vote for your national team coach',
  type: 1
}

export const showElectionCandidatesCmd = {
  name: 'showelectioncandidates',
  description: 'List all the election candidates and their reasons',
  type: 1
}

export const registerElectionsCmd = {
  name: 'registerelections',
  description: 'Register to become a national coach',
  type: 1,
  options: [{
    type: 3,
    name: 'nation',
    description: 'Nation',
    autocomplete: true,
    required: true,
  },{
    type: 3,
    name: 'reason',
    description: 'Please tell us why you\'d be a good national coach',
    required: true,
  }]
}

export const nationalTeamCmd = {
  name: 'nationalteam',
  description: 'List a national team players list',
  type: 1,
  options: [{
    type: 3,
    name: 'country',
    description: 'Country',
    autocomplete: true,
    required: true,
  }],
}

export const showVotesCmd = {
  name: 'showvotes',
  description: 'Show the votes for a nation',
  type: 1,
  options: [{
    type: 3,
    name: 'nation',
    description: 'Nation',
    autocomplete: true,
    required: true,
  }],
}

export const allNationalTeamsCmd = {
  name: 'allnationalteams',
  description: 'List all national teams',
  type: 1,
}

export const postNationalTeamsCmd = {
  name: 'postnationalteams',
  description: 'Post all national teams',
  type: 1,
  options: [{
    type: 3,
    name: 'country',
    description: 'Country to update',
    autocomplete: true,
  }]
}

export const addSelectionCmd = {
  name: 'addselection',
  description: 'Add a player in a selection',
  type: 1,
  options: [{
    type: 6,
    name: 'player',
    description: 'Player',
    required: true,
  }, {
    type: 3,
    name: 'country',
    description: 'Country',
    autocomplete: true,
    required: true,
  }],
}

export const removeSelectionCmd = {
  name: 'removeselection',
  description: 'Remove a player from a selection',
  type: 1,
  options: [{
    type: 6,
    name: 'player',
    description: 'Player',
    required: true,
  }],
}