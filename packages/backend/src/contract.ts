import { initContract } from "@ts-rest/core";
import { z } from "zod";

const c = initContract();

const RemotePortSchema = z.object({
  type: z.literal("remote"),
  id: z.string(),
  uuid: z.string(),
  name: z.string(),
  host: z.string(),
  port: z.number(),
  group: z.string().optional(),
  description: z.string().optional(),
});

const PortSchema = RemotePortSchema;

const AddRemotePortSchema = z.object({
  type: z.literal("remote"),
  name: z.string(),
  host: z.string(),
  port: z.number(),
  group: z.string().optional(),
  description: z.string().optional(),
});

const AddPortSchema = AddRemotePortSchema;

export const contract = c.router({
  getPorts: {
    method: "GET",
    path: "/api/ports",
    responses: {
      200: z.object({
        ports: z.array(PortSchema),
        timestamp: z.string(),
      }),
    },
    summary: "Get all configured serial ports",
  },
  addPort: {
    method: "POST",
    path: "/api/ports",
    body: AddPortSchema,
    responses: {
      200: z.object({
        success: z.boolean(),
        message: z.string(),
        port: PortSchema,
      }),
      400: z.object({
        success: z.boolean(),
        message: z.string(),
      }),
      500: z.object({
        success: z.boolean(),
        message: z.string(),
      }),
    },
    summary: "Add a new port to configuration",
  },
  updatePort: {
    method: "PUT",
    path: "/api/ports/:id",
    pathParams: z.object({
      id: z.string(),
    }),
    body: AddPortSchema,
    responses: {
      200: z.object({
        success: z.boolean(),
        message: z.string(),
        port: PortSchema,
      }),
      400: z.object({
        success: z.boolean(),
        message: z.string(),
      }),
      404: z.object({
        success: z.boolean(),
        message: z.string(),
      }),
      500: z.object({
        success: z.boolean(),
        message: z.string(),
      }),
    },
    summary: "Update an existing port configuration",
  },
  deletePort: {
    method: "DELETE",
    path: "/api/ports/:id",
    pathParams: z.object({
      id: z.string(),
    }),
    body: z.object({
      confirmation: z.string(),
    }),
    responses: {
      200: z.object({
        success: z.boolean(),
        message: z.string(),
      }),
      400: z.object({
        success: z.boolean(),
        message: z.string(),
      }),
      404: z.object({
        success: z.boolean(),
        message: z.string(),
      }),
      500: z.object({
        success: z.boolean(),
        message: z.string(),
      }),
    },
    summary: "Delete a port from configuration",
  },
  reloadConfig: {
    method: "POST",
    path: "/api/config/reload",
    body: z.object({}),
    responses: {
      200: z.object({
        success: z.boolean(),
        message: z.string(),
        portsCount: z.number(),
      }),
      500: z.object({
        success: z.boolean(),
        message: z.string(),
      }),
    },
    summary: "Reload configuration from file",
  },
});
