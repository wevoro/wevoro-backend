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
app.use(cors());
app.use(cors());
app.use(cookieParser());

// SCRUM-115: the Stripe webhook must be mounted BEFORE the JSON parser below.
// Signature verification hashes the exact bytes Stripe sent, and once
// express.json() has parsed and discarded the raw body there is nothing left to
// verify against. This is scoped to the single webhook path, so every other
// route still gets the parsed body it expects.
app.post(
  '/api/v1/payment/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    // Imported lazily so this file does not pull the Stripe SDK into every
    // route's cold start.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { webhook } = require('./app/modules/payment/payment.controller');
    return webhook(req, res);
  }
);

//parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.urlencoded({ extended: false }));

app.use('/api/v1', routes);

//global error handler
app.use(globalErrorHandler);

app.get('/', (req: Request, res: Response) => {
  res.send('Welcome to Wevoro API v3');
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