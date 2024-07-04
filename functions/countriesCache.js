import NodeCache from "node-cache";
import { sleep } from "./helpers.js";

const countriesCache = new NodeCache({ stdTTL: 500, checkperiod: 500, useClones: false})

export const getAllCountries = async (dbClient) => {
  let allCountries = countriesCache.get("countries")
  if(allCountries) {
    while(allCountries.length === 0) {
      await sleep(5000)
      allCountries = countriesCache.get("countries")
    }
    return allCountries
  }
  
  countriesCache.set("countries", [])

  const countries = await dbClient(({nationalities})=> {
    return nationalities.find({}).toArray()
  })
  countriesCache.set("countries", countries)
  return countries
}

export const getAllCountriesFromNationalities = async (nationalities) => {
  let allCountries = countriesCache.get("countries")
  if(allCountries) {
    while(allCountries.length === 0) {
      await sleep(1000)
      allCountries = countriesCache.get("countries")
    }  
    return allCountries
  }
  
  countriesCache.set("countries", [])

  const countries = await nationalities.find({}).toArray()
  countriesCache.set("countries", countries)
  return countries
}

export const getAllSelections = async (dbClient) => {
  let allCountries = countriesCache.get("selections")
  if(allCountries) {
    while(allCountries.length === 0) {
      await sleep(5000)
      allCountries = countriesCache.get("selections")
    }  
    return allCountries
  }
  
  countriesCache.set("selections", [])

  const countries = await dbClient(({nationalTeams})=> {
    return nationalTeams.find({}).toArray()
  })
  countriesCache.set("selections", countries)
  return countries
}

export const getAllSelectionsFromDbClient = async (nationalTeams) => {
  let allCountries = countriesCache.get("selections")
  if(allCountries) {
    while(allCountries.length === 0) {
      await sleep(1000)
      allCountries = countriesCache.get("selections")
    }  
    return allCountries
  }
  
  countriesCache.set("selections", [])

  const countries = await nationalTeams.find({}).toArray()
  countriesCache.set("selections", countries)
  return countries
}