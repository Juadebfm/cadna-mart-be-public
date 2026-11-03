-- A request's completion must reflect completed erasure, never just an admin decision.
ALTER TABLE "data_requests"
  ALTER COLUMN "userId" DROP NOT NULL,
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "processingStartedAt" TIMESTAMP(3),
  ADD COLUMN "responseDueAt" TIMESTAMP(3),
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "responseSentAt" TIMESTAMP(3),
  ADD COLUMN "requesterEmail" TEXT,
  ADD COLUMN "requesterPhone" TEXT,
  ADD COLUMN "decisionNotes" TEXT,
  ADD COLUMN "externalIdentityDeletedAt" TIMESTAMP(3),
  ADD COLUMN "avatarMediaDeletedAt" TIMESTAMP(3);

-- Historical "processed" requests did not execute deletion; keep them open for review.
UPDATE "data_requests" SET "status" = 'in_progress' WHERE "status" = 'processed';

ALTER TABLE "data_requests" DROP CONSTRAINT "data_requests_userId_fkey";
ALTER TABLE "data_requests"
  ADD CONSTRAINT "data_requests_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "data_request_retentions" (
  "id" VARCHAR(24) NOT NULL,
  "requestId" VARCHAR(24) NOT NULL,
  "category" TEXT NOT NULL,
  "lawfulBasis" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "retainUntil" TIMESTAMP(3) NOT NULL,
  "purgedAt" TIMESTAMP(3),
  "purgedById" VARCHAR(24),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "data_request_retentions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "data_request_retentions_requestId_category_key"
  ON "data_request_retentions"("requestId", "category");
CREATE INDEX "data_request_retentions_retainUntil_purgedAt_idx"
  ON "data_request_retentions"("retainUntil", "purgedAt");

ALTER TABLE "data_request_retentions"
  ADD CONSTRAINT "data_request_retentions_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "data_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_request_retentions"
  ADD CONSTRAINT "data_request_retentions_purgedById_fkey"
  FOREIGN KEY ("purgedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "data_request_retentions_purgedById_idx"
  ON "data_request_retentions"("purgedById");
