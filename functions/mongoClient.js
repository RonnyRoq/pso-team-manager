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
      }
      await callback(collections)
    }
    finally {
      db.close()
    }
  }
  return connect
}

export default mongoClient