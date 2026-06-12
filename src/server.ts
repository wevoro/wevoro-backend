/* eslint-disable no-console */

import { Server } from 'http';
import mongoose from 'mongoose';
import app from './app';
import config from './config/index';


import { startCredentialNotificationCron } from './app/modules/notification/credential-notification.service';

process.on('uncaughtException', error => {
  console.error(error);
  process.exit(1);
});

let server: Server;

// MongoDB connection options for stability
const mongoOptions: mongoose.ConnectOptions = {
  serverSelectionTimeoutMS: 30000,   // 30s to find a server
  socketTimeoutMS: 45000,            // 45s socket timeout
  maxPoolSize: 10,                   // connection pool
  minPoolSize: 2,                    // keep minimum connections alive
  maxIdleTimeMS: 60000,              // close idle connections after 60s
  heartbeatFrequencyMS: 10000,       // check server health every 10s
  retryWrites: true,
  retryReads: true,
  bufferCommands: true,              // buffer commands when disconnected
};

async function connectWithRetry(maxRetries = 5, delay = 5000): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await mongoose.connect(config.database_url as string, mongoOptions);
      console.log(`🛢   Database is connected successfully`);
      return;
    } catch (err) {
      console.error(`⚠️  DB connection attempt ${attempt}/${maxRetries} failed:`, (err as Error).message);
      if (attempt < maxRetries) {
        console.log(`   Retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error('❌  All DB connection attempts failed. Server running without DB.');
}

async function bootstrap() {
  // Start the server first so it's accessible even if DB is down
  server = app.listen(config.port, () => {
    console.log(`Application  listening on port ${config.port}`);
  });

  // MongoDB connection event handlers
  mongoose.connection.on('connected', () => {
    console.log('✅  MongoDB connected');
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️  MongoDB disconnected — mongoose will auto-reconnect');
  });

  mongoose.connection.on('error', (err) => {
    console.error('❌  MongoDB connection error:', err.message);
  });

  // Connect with retry
  await connectWithRetry();

  // SCRUM-65: Start credential expiration notification cron
  if (mongoose.connection.readyState === 1) {
    startCredentialNotificationCron();
  }

  process.on('unhandledRejection', error => {
    if (server) {
      server.close(() => {
        console.error(error);
        process.exit(1);
      });
    } else {
      process.exit(1);
    }
  });
}

bootstrap();

