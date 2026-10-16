import type { RequestHandler } from 'express';
import { dataResponse } from '../../utils/api-response';
import { confirmationMessageBodySchema } from './ai.schemas';
import type { AiService } from './ai.service';

/** Thin HTTP layer: validate (ZodError -> 400), call the service, shape the response. */
export function createAiController(service: AiService) {
  const confirmation: RequestHandler = async (req, res) => {
    const { token } = confirmationMessageBodySchema.parse(req.body);
    const message = await service.getConfirmationMessage(token);
    // Personal and token-bound: keep it out of caches, like GET /api/bookings/:token.
    res.set('Cache-Control', 'no-store').status(200).json(dataResponse(message));
  };

  return { confirmation };
}
