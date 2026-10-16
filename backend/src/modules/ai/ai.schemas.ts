import { z } from 'zod';

/**
 * Body of `POST /api/ai/confirmation`. Only the confirmation token: the message
 * is always built from the booking stored in the database, never from client text.
 * A well-formed but unknown token, or a malformed one, gives 404 (see the service).
 */
export const confirmationMessageBodySchema = z.strictObject(
  {
    token: z
      .string({ error: 'token is required' })
      .min(1, { error: 'token is required' })
      .max(100, { error: 'token is too long' }),
  },
  { error: 'Request body must be a JSON object with a token' },
);
export type ConfirmationMessageBody = z.infer<typeof confirmationMessageBodySchema>;
