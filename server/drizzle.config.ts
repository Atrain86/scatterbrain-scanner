import type { Config } from 'drizzle-kit';
import { config } from 'dotenv';

config({ path: '../.env' });

export default {
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || '../data/scatterbrain.db',
  },
} satisfies Config;
