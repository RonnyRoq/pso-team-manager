export const buildPlayerSearch = async ({dbClient}) => 
  dbClient(async({players, teams, nationalTeams})=> {
    const response = await Promise.all([
      players.aggregate([
        {
          '$project': {
            'id': 1,
            'ingamename': {
              '$toLower': '$ingamename'
            }, 
            'nick': {
              '$toLower': '$nick'
            },
            'uniqueId': 1,
            'steam': 1,
            'steamId': 1,
            'pastSteams': 1
          }
        }, {
          '$out': 'searchPlayers'
        }
      ]).toArray(),
      teams.aggregate([
        {
          $match:
            {
              active: true,
            },
        }, {
          '$project': {
            'id': {
              '$toString': '$id'
            }, 
            'name': {
              '$toLower': '$name'
            }, 
            'shortName': {
              '$toLower': '$shortName'
            }
          }
        }, {
          '$out': 'searchTeams'
        }
      ]).toArray(),
      nationalTeams.aggregate([
        {
          '$project': {
            'name': {
              '$toLower': '$name'
            }, 
            'shortName': {
              '$toLower': '$shortname'
            }
          }
        }, {
          '$out': 'searchNationalSelections'
        }
      ]).toArray()
    ])
    console.log(JSON.stringify(response, null, 2))
  })
