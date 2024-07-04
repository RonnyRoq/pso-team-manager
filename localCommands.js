import 'dotenv/config';
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

const agg = [
  {
    '$match': {
      'name': /\(Group/i
    }
  }, {
    '$set': {
      'archived': true
    }
  }
];
await dbClient(async({leagueConfig})=>{
  const result = await leagueConfig.aggregate(agg).toArray()
  console.log(result)
})
