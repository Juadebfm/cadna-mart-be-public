ALTER TABLE "reviews"
  ADD COLUMN "imageUrl" TEXT,
  ADD COLUMN "imagePublicId" TEXT,
  ADD COLUMN "sellerReply" TEXT,
  ADD COLUMN "sellerReplyAt" TIMESTAMP(3),
  ADD COLUMN "sellerReplyById" VARCHAR(24);

CREATE TABLE "review_helpful_votes" (
  "id" VARCHAR(24) NOT NULL,
  "reviewId" VARCHAR(24) NOT NULL,
  "userId" VARCHAR(24) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_helpful_votes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "review_reports" (
  "id" VARCHAR(24) NOT NULL,
  "reviewId" VARCHAR(24) NOT NULL,
  "reportedById" VARCHAR(24) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reason" TEXT,
  "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "withdrawnAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" VARCHAR(24),
  "resolution" TEXT,
  CONSTRAINT "review_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "review_helpful_votes_reviewId_userId_key"
  ON "review_helpful_votes"("reviewId", "userId");
CREATE INDEX "review_helpful_votes_userId_createdAt_idx"
  ON "review_helpful_votes"("userId", "createdAt");
CREATE INDEX "review_reports_status_reportedAt_idx"
  ON "review_reports"("status", "reportedAt");
CREATE INDEX "review_reports_reviewId_reportedAt_idx"
  ON "review_reports"("reviewId", "reportedAt");
CREATE UNIQUE INDEX "review_reports_one_pending_per_review_key"
  ON "review_reports"("reviewId") WHERE "status" = 'pending';
CREATE UNIQUE INDEX "reviews_active_product_user_key"
  ON "reviews"("productId", "userId") WHERE "deletedAt" IS NULL;

ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_sellerReplyById_fkey"
  FOREIGN KEY ("sellerReplyById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "review_helpful_votes"
  ADD CONSTRAINT "review_helpful_votes_reviewId_fkey"
  FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "review_helpful_votes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_reports"
  ADD CONSTRAINT "review_reports_reviewId_fkey"
  FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "review_reports_reportedById_fkey"
  FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "review_reports_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
