/**
 * pnpm railway:cors — sets the bucket CORS rules for browser presigned PUT/GET (stack note 06).
 * Needed once per environment (each Railway environment has its own bucket).
 *   Git Bash:   CORS_ORIGINS='https://waqaya.example,http://localhost:3000' railway run --service web pnpm railway:cors
 * Runs with --conditions=react-server so lib/storage.ts ("server-only") can be imported.
 */
import { existsSync } from "node:fs";
import { GetBucketCorsCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const { getStorage, isStorageConfigured } = await import("../lib/storage");

const origins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (origins.length === 0) {
  console.error("set-bucket-cors: set CORS_ORIGINS=https://a,https://b");
  process.exit(1);
}
if (!isStorageConfigured()) {
  console.error("set-bucket-cors: storage not configured (S3_* variables missing)");
  process.exit(1);
}

const { s3, bucket } = getStorage();
await s3.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: origins,
          AllowedMethods: ["PUT", "GET", "HEAD"],
          AllowedHeaders: ["content-type"],
          ExposeHeaders: ["ETag"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
);
const current = await s3.send(new GetBucketCorsCommand({ Bucket: bucket }));
console.log(JSON.stringify(current.CORSRules, null, 2));
