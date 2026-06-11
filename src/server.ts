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

async function bootstrap() {
  // Start the server first so it's accessible even if DB is down
  server = app.listen(config.port, () => {
    console.log(`Application  listening on port ${config.port}`);
  });

  try {
    await mongoose.connect(config.database_url as string);
    console.log(`🛢   Database is connected successfully`);

    // SCRUM-65: Start credential expiration notification cron
    startCredentialNotificationCron();
  } catch (err) {
    console.error('⚠️  Failed to connect to database (server still running):', err);
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

