import type { RequestHandler } from 'express';
import { ErrorCode, HttpError } from '../common/http-errors';

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, ErrorCode.ROUTE_NOT_FOUND, 'Route not found.'));
};
