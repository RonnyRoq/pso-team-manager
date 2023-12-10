const mongoClient = (client) => {
  const db = client;
  const connect = async (callback) => {
    try {
      await db.connect();
      const psoDb = db.db("PSOTeamManager");
      const collections = {
        teams : psoDb.collection("Teams"),
        players : psoDb.collection("Players"),
        matches : psoDb.collection("Matches"),
        nationalities: psoDb.collection("Nationalities"),
        confirmations: psoDb.collection("Confirmations"),
        contracts: psoDb.collection("Contracts"),
        seasonsCollect: psoDb.collection("Seasons"),
        pendingDeals: psoDb.collection("PendingDeals"),
        pendingLoans: psoDb.collection("PendingLoans"),
        candidates: psoDb.collection("Candidates"),
        lineups: psoDb.collection("Lineups"),
        playerStats: psoDb.collection("PlayerStats"),
        votes: psoDb.collection("Votes")
      }
      return await callback(collections)
    }
    catch(e) {
      console.error(e.stack)
      throw e
    }
    finally {
      console.log('close Db')
      db.close()
    }
  }
  return connect
}

export default mongoClient