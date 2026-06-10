import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Application, NextFunction, Request, Response } from 'express';
import httpStatus from 'http-status';
import globalErrorHandler from './app/middlewares/globalErrorHandler';
import routes from './app/routes';

import compression from 'compression';
import mongoose from 'mongoose';
import dns from 'dns';

// Use public DNS for SRV lookups on Vercel
dns.setServers(['8.8.8.8', '1.1.1.1']);

const app: Application = express();

// Serverless MongoDB connection middleware — ensures DB is connected before handling requests
let isConnected = false;
app.use(async (req: Request, res: Response, next: NextFunction) => {
  if (!isConnected && mongoose.connection.readyState !== 1) {
    try {
      const dbUrl = process.env.DATABASE_URL || '';
      await mongoose.connect(dbUrl, {
        serverSelectionTimeoutMS: 8000,
        socketTimeoutMS: 10000,
      });
      isConnected = true;
      console.log('🛢  Database connected (serverless)');
    } catch (err) {
      console.error('⚠️  DB connection failed:', err);
      return res.status(500).json({ success: false, message: 'Database connection failed' });
    }
  }
  next();
});

app.use(compression());
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3003',
    'https://wevoro-frontend.vercel.app',
    'https://wevoro-frontend-riad009s-projects.vercel.app',
    process.env.FRONTEND_URL_PROD || '',
  ].filter(Boolean),
  credentials: true,
}));
app.use(cookieParser());

//parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.urlencoded({ extended: false }));

app.use('/api/v1', routes);

//global error handler
app.use(globalErrorHandler);

app.get('/', (req: Request, res: Response) => {
  res.send('Welcome to Wevoro API');
});

app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(httpStatus.NOT_FOUND).json({
    success: false,
    message: 'Not Found',
    errorMessages: [
      {
        method: req.method,
        path: req.originalUrl,
        message: 'API Not Found',
      },
    ],
  });
  next();
});

export default app;
