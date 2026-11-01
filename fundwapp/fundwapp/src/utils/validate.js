import { z } from 'zod';
import { AppError } from './errors.js';

export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
  const first = details[0];
  const message = first ? (first.field ? `${first.field}: ${first.message}` : first.message) : 'Invalid input';
  throw new AppError(422, 'VALIDATION_ERROR', message, details);
}
export { z };
