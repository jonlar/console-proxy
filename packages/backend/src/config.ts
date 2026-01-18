import { z } from "zod";

export const LocalSerialPortSchema = z.object({
  type: z.literal("local"),
  name: z.string(),
  device: z.string(),
  speed: z.number(),
  group: z.string().optional(),
  description: z.string().optional(),
});

export const RemoteTelnetPortSchema = z.object({
  type: z.literal("remote"),
  name: z.string(),
  host: z.string(),
  port: z.number(),
  group: z.string().optional(),
  description: z.string().optional(),
});

export const PortConfigSchema = z.discriminatedUnion("type", [
  LocalSerialPortSchema,
  RemoteTelnetPortSchema,
]);

export const ConfigSchema = z.object({
  ports: z.array(PortConfigSchema),
});

export type LocalSerialPort = z.infer<typeof LocalSerialPortSchema>;
export type RemoteTelnetPort = z.infer<typeof RemoteTelnetPortSchema>;
export type PortConfig = z.infer<typeof PortConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;
