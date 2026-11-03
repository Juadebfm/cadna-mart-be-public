import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Keep code generation and schema validation usable before a local DB is
    // configured. Every real database command should use the DATABASE_URL
    // supplied by local development or Render.
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/cadna',
  },
});
