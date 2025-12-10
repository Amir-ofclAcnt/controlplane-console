import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },

  // Use DIRECT_URL (non-pooler) for migrations
  datasource: {
    url: env("DIRECT_URL"),
  },
});
