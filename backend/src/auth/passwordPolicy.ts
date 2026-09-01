import { z } from 'zod';

export const passwordSchema = z.string()
  .min(10, 'Password must be at least 10 characters')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/[0-9]/, 'Password needs a number');
