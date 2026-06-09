import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Application, NextFunction, Request, Response } from 'express';
import httpStatus from 'http-status';
import globalErrorHandler from './app/middlewares/globalErrorHandler';
import routes from './app/routes';

import compression from 'compression';

const app: Application = express();

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
