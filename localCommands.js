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
    '$lookup': {
      'from': 'Leagues', 
      'localField': 'id', 
      'foreignField': 'team', 
      'let': {
        'teamId': '$id'
      }, 
      'pipeline': [
        {
          '$match': {
            '$expr': {
              '$in': [
                '$$teamId', [
                  '$team'
                ]
              ]
            }
          }
        }
      ], 
      'as': 'matches'
    }
  }, {
    '$match': {
      'matches': {
        '$elemMatch': {
          'leagueId': '1209539443271270452'
        }
      }
    }
  }, {
    '$set': {
      'budget': 0
    }
  }, {
    '$unset': 'matches'
  }, {
    '$merge': {
      'into': 'Teams', 
      'on': 'id', 
      'whenMatched': 'merge', 
      'whenNotMatched': 'fail'
    }
  }
];
await dbClient(async({teams})=>{
  const result = await teams.aggregate(agg).toArray()
  console.log(result)
})
