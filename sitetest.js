import express from 'express';
import http from 'http'
import { getSite } from './site.js';

function start() {
  // Create an express app
  const app = express();

  
  // Get port, or default
  const PORT = 8080;
  app.use('/site', getSite(true))
  var httpServer = http.createServer(app);
  httpServer.listen(PORT, async ()=> {
    console.log('Listening http on port', PORT);
  });
}

start();