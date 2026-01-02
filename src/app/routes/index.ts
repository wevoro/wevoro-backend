import express from 'express';
import { AuthRoutes } from '../modules/auth/auth.route';

import { FeedbackRoutes } from '../modules/user/feedback.route';
import { UserRoutes } from '../modules/user/user.route';
import { DocumentRoutes } from '../modules/document/document.route';

const router = express.Router();

const moduleRoutes = [
  {
    path: '/user',
    route: UserRoutes,
  },
  {
    path: '/document',
    route: DocumentRoutes,
  },
  {
    path: '/auth',
    route: AuthRoutes,
  },
  {
    path: '/feedback',
    route: FeedbackRoutes,
  },
];

moduleRoutes.forEach(route => router.use(route.path, route.route));
export default router;
