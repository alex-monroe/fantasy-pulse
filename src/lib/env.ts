import { z } from 'zod';

const envSchema = z.object({
  YAHOO_CLIENT_ID: z.string().min(1),
  YAHOO_CLIENT_SECRET: z.string().min(1),
  YAHOO_REDIRECT_URI: z.string().url(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const errors = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid environment variables: ${errors}`);
}

export const env = parsed.data;

