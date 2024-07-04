import 'dotenv/config';
import fs from 'fs/promises'
import { client } from './config/mongoConfig.js'
import mongoClient from './functions/mongoClient.js'

try {
  // Connect the client to the server	(optional starting in v4.7)
  await client.connect();
  // Send a ping to confirm a successful connection
  await client.db("PSOTeams").command({ ping: 1 });
  console.log("Pinged your deployment. You successfully connected to MongoDB!");
} finally {
  // Ensures that the client will close when you finish/error
  await client.close();
}

const dbClient = mongoClient(client)

const allLeagues = await dbClient(({leagueConfig})=> leagueConfig.find({}).toArray())
const leagueChoices = allLeagues.filter(league=> league.active).slice(0, 24).map(({name, value})=> ({name, value}))
fs.writeFile('./config/leagueData.js', `export const allLeagues = ${JSON.stringify(allLeagues, undefined, 2)}\rexport const leagueChoices = ${JSON.stringify(leagueChoices, undefined, 2)}`)

console.log('Export done')