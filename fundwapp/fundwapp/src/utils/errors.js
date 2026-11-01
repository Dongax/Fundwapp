export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const badRequest = (message, code = 'BAD_REQUEST', details) => new AppError(400, code, message, details);
export const unauthorized = (message = 'Please sign in to continue', code = 'UNAUTHORIZED') => new AppError(401, code, message);
export const forbidden = (message = 'You do not have access to this resource', code = 'FORBIDDEN') => new AppError(403, code, message);
export const notFound = (message = 'Not found', code = 'NOT_FOUND') => new AppError(404, code, message);
export const conflict = (message, code = 'CONFLICT') => new AppError(409, code, message);
export const badGateway = (message, code = 'GATEWAY_ERROR') => new AppError(502, code, message);
