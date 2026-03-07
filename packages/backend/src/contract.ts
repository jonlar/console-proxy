import { initContract } from "@ts-rest/core";
import { z } from "zod";

const c = initContract();

// Example item schema — replace with your domain model
const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
});

export const contract = c.router({
  // Health check
  health: {
    method: "GET",
    path: "/api/health",
    responses: {
      200: z.object({ ok: z.boolean(), timestamp: z.string() }),
    },
    summary: "Health check",
  },

  // List items
  getItems: {
    method: "GET",
    path: "/api/items",
    responses: {
      200: z.object({ items: z.array(ItemSchema) }),
    },
    summary: "List all items",
  },

  // Create item
  createItem: {
    method: "POST",
    path: "/api/items",
    body: z.object({ name: z.string() }),
    responses: {
      200: z.object({ success: z.boolean(), item: ItemSchema }),
      400: z.object({ success: z.boolean(), message: z.string() }),
      500: z.object({ success: z.boolean(), message: z.string() }),
    },
    summary: "Create a new item",
  },

  // Delete item
  deleteItem: {
    method: "DELETE",
    path: "/api/items/:id",
    pathParams: z.object({ id: z.string() }),
    body: z.object({}),
    responses: {
      200: z.object({ success: z.boolean(), message: z.string() }),
      404: z.object({ success: z.boolean(), message: z.string() }),
      500: z.object({ success: z.boolean(), message: z.string() }),
    },
    summary: "Delete an item",
  },
});
