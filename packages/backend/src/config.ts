import { z } from "zod";

export const ConfigSchema = z.object({
  // Add your app's config fields here
  appName: z.string().default("my-app"),
});

export type Config = z.infer<typeof ConfigSchema>;
