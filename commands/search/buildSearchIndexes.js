export const buildPlayerSearch = async ({dbClient}) => 
  dbClient(async({players, teams, nationalTeams})=> {
    const response = await Promise.all([
      players.aggregate([
        {
          '$project': {
            'id': {
              '$toString': '$id'
            }, 
            'ingamename': {
              '$toLower': '$ingamename'
            }, 
            'nick': {
              '$toLower': '$nick'
            }
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
