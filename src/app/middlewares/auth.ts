import { NextFunction, Request, Response } from 'express';
import httpStatus from 'http-status';
import { Secret } from 'jsonwebtoken';
import config from '../../config';
import { ENUM_USER_ROLE } from '../../enums/user';
import ApiError from '../../errors/ApiError';
import { jwtHelpers } from '../../helpers/jwtHelpers';

const auth =
  (...requiredRoles: string[]) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      //get authorization token
      const token = req.headers.authorization;
      // req.cookies.refreshToken ||
      // req.cookies.accessToken;
      // console.log({ token });
      if (!token) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'You are not authorized');
      }
      // verify token
      let verifiedUser = null;

      verifiedUser = jwtHelpers.verifyToken(token, config.jwt.secret as Secret);

      req.user = verifiedUser; // role  , userid

      // console.log({ verifiedUser });

      // Super Admin is implicitly privileged everywhere — so existing
      // auth(ADMIN) routes admit a super_admin without listing the role.
      if (verifiedUser.role === ENUM_USER_ROLE.SUPER_ADMIN) {
        return next();
      }

      // role diye guard korar jnno
      if (requiredRoles.length && !requiredRoles.includes(verifiedUser.role)) {
        throw new ApiError(httpStatus.FORBIDDEN, 'Forbidden');
      }
      next();
    } catch (error) {
      next(error);
    }
  };

/**
 * Granular permission guard. Run AFTER `auth(...)` (which sets req.user).
 * Allows the request when:
 *  - the user is a super_admin (implicit all-access), OR
 *  - the user is an admin with an empty/missing `permissions` array
 *    (legacy full admin — backward compatible), OR
 *  - every required permission key is present in req.user.permissions.
 */
export const requirePermission =
  (...requiredPermissions: string[]) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user as any;
      if (!user) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'You are not authorized');
      }

      if (user.role === ENUM_USER_ROLE.SUPER_ADMIN) {
        return next();
      }

      const perms: string[] = Array.isArray(user.permissions)
        ? user.permissions
        : [];

      // Legacy admins (no permissions set) keep full access.
      const isLegacyFullAdmin =
        user.role === ENUM_USER_ROLE.ADMIN && perms.length === 0;

      const hasAll = requiredPermissions.every((p) => perms.includes(p));

      if (isLegacyFullAdmin || hasAll) {
        return next();
      }

      throw new ApiError(
        httpStatus.FORBIDDEN,
        'You do not have permission to perform this action'
      );
    } catch (error) {
      next(error);
    }
  };

export default auth;
