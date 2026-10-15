import type { RequestHandler } from 'express';
import { dataResponse } from '../../utils/api-response';
import { createSlotBodySchema, listSlotsQuerySchema, slotIdParamsSchema } from './slots.schemas';
import type { SlotsService } from './slots.service';

/**
 * Thin HTTP layer: validate input with Zod (a ZodError becomes 400 in the error
 * handler), call the service, shape the response. Express 5 forwards rejected
 * promises to the error handler.
 */
export function createSlotsController(service: SlotsService) {
  const create: RequestHandler = async (req, res) => {
    const input = createSlotBodySchema.parse(req.body);
    const slot = await service.createSlot(input);
    res.status(201).location(`/api/slots/${slot.id}`).json(dataResponse(slot));
  };

  const list: RequestHandler = async (req, res) => {
    const query = listSlotsQuerySchema.parse(req.query);
    res.status(200).json(dataResponse(await service.listSlots(query)));
  };

  const getById: RequestHandler = async (req, res) => {
    const { id } = slotIdParamsSchema.parse(req.params);
    res.status(200).json(dataResponse(await service.getSlot(id)));
  };

  const remove: RequestHandler = async (req, res) => {
    const { id } = slotIdParamsSchema.parse(req.params);
    await service.deleteSlot(id);
    res.status(204).end();
  };

  return { create, list, getById, remove };
}
