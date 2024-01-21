let connections = 0
const mongoClient = (client) => {
  const db = client;
  const connect = async (callback) => {
    connections++
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
        votes: psoDb.collection("Votes"),
        leagues: psoDb.collection("Leagues"),
        moveRequest: psoDb.collection("MoveRequest"),
      }
      return await callback(collections)
    }
    catch(e) {
      console.error(e.stack)
      throw e
    }
    finally {
      connections--
      if(connections<=0)
        db.close()
    }
  }
  return connect
}

export default mongoClient