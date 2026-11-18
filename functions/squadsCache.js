import NodeCache from "node-cache";
import { sleep } from "./helpers.js";

const squadsCache = new NodeCache({ stdTTL: 500, checkperiod: 500, useClones: false})

export const getAllSquads = async (dbClient) => {
  let allSquads = squadsCache.get("squads")
  if(allSquads) {
    while(allSquads.length === 0) {
      await sleep(5000)
      allSquads = squadsCache.get("squads")
    }  
    return allSquads
  }
  
  squadsCache.set("squads", [])

  const dbSquads = await dbClient(({squads})=> {
    return squads.find({}).toArray()
  })
  squadsCache.set("squads", dbSquads)
  return dbSquads
}

export const getAllSelectionsFromDbClient = async (squads) => {
  let allSquads = squadsCache.get("squads")
  if(allSquads) {
    while(allSquads.length === 0) {
      await sleep(1000)
      allSquads = squadsCache.get("squads")
    }  
    return allSquads
  }
  
  squadsCache.set("squads", [])

  const dbSquads = await squads.find({}).toArray()
  squadsCache.set("squads", dbSquads)
  return dbSquads
}