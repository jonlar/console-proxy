import { z } from "zod";

export const RemoteTelnetPortSchema = z.object({
  type: z.literal("remote"),
  uuid: z.string(),
  name: z.string(),
  host: z.string(),
  port: z.number(),
  group: z.string().optional(),
  description: z.string().optional(),
});

export const PortConfigSchema = RemoteTelnetPortSchema;

export const ConfigSchema = z.object({
  ports: z.array(PortConfigSchema),
});

export type RemoteTelnetPort = z.infer<typeof RemoteTelnetPortSchema>;
export type PortConfig = z.infer<typeof PortConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;
