import { MongoClient, ServerApiVersion } from "mongodb";

const mongu = encodeURIComponent(process.env.MONGU)
const mongp = encodeURIComponent(process.env.MONGP)
export const uri = `mongodb+srv://${mongu}:${mongp}@psoteams.gmopjmu.mongodb.net/?retryWrites=true&w=majority&ssl=true`;
export const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});