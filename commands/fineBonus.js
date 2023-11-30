
export const bonus = async ({options, interaction_id, token, application_id, dbClient}) => {
  let response = "Nothing happened"
  const {team, amount, reason} = Object.fromEntries(options.map(({name, value})=> ([name, value])))
  
  try {
    const teams = await getTeamsCollection();
    const teamObj = await teams.findOne({id: team, active:true})
    const previousBudget = teamObj.budget
    const newBudget = previousBudget + Number(amount)
    await teams.updateOne({id: team}, {$set: {budget: newBudget}})
    const log = `<@&${team}> has received ${new Intl.NumberFormat('en-US').format(amount)} EBits${reason ? `\rReason: ${reason}\r`: ''} (from <@${callerId}>)`
    response = log
    await DiscordRequest(webHookDetails, {
      method: 'POST',
      body: {
        content: log
      }
    })
  } finally {
    await client.close();
  }
  return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: response,
        flags: 1 << 6
      }
    }
  })
}