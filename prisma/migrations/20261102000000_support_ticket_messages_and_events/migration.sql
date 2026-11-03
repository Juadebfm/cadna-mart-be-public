ALTER TABLE "support_tickets"
    ADD COLUMN "accountType" TEXT NOT NULL DEFAULT 'buyer',
    ADD COLUMN "withdrawnAt" TIMESTAMP(3);
ALTER TABLE "users"
    ALTER COLUMN "notificationPreferences" SET DEFAULT '{"orderUpdates":true,"promotions":false,"newsletter":false,"securityAlerts":true,"supportUpdates":true}'::jsonb;
UPDATE "users"
SET "notificationPreferences" = COALESCE("notificationPreferences", '{}'::jsonb) || '{"supportUpdates":true}'::jsonb;
ALTER TABLE "notifications" ADD COLUMN "sourceEventId" TEXT;

UPDATE "support_tickets"
SET "accountType" = 'legacy_guest'
WHERE "userId" IS NULL;

CREATE TABLE "support_ticket_messages" (
    "id" VARCHAR(24) NOT NULL,
    "ticketId" VARCHAR(24) NOT NULL,
    "authorUserId" VARCHAR(24),
    "authorRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "clientMessageId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id")
);

WITH ticket_messages AS (
    SELECT
        t."id" AS ticket_id,
        expanded.ordinality AS ordinal,
        expanded.message,
        t."createdAt" AS ticket_created_at,
        t."body" AS ticket_body
    FROM "support_tickets" AS t
    CROSS JOIN LATERAL (
        SELECT message, ordinality
        FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(t."messages") = 'array' THEN t."messages" ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS items(message, ordinality)
        UNION ALL
        SELECT jsonb_build_object(
            'authorId', COALESCE(t."userId", 'system'),
            'authorRole', CASE WHEN t."userId" IS NULL THEN 'system' ELSE 'user' END,
            'body', t."body",
            'sentAt', t."createdAt"
        ), 1::bigint
        WHERE jsonb_array_length(
            CASE WHEN jsonb_typeof(t."messages") = 'array' THEN t."messages" ELSE '[]'::jsonb END
        ) = 0
    ) AS expanded
), numbered_messages AS (
    SELECT
        ticket_id,
        ordinal,
        message,
        ticket_created_at,
        ticket_body,
        ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY ordinal)::INTEGER AS message_sequence,
        CASE
            WHEN NULLIF(message->>'sentAt', '') IS NULL THEN ticket_created_at
            ELSE (message->>'sentAt')::timestamp
        END AS message_sent_at
    FROM ticket_messages
)
INSERT INTO "support_ticket_messages" (
    "id", "ticketId", "authorUserId", "authorRole", "body", "sequence",
    "clientMessageId", "sentAt", "createdAt", "updatedAt"
)
SELECT
    SUBSTRING(MD5(ticket_id || ':' || ordinal::text) FROM 1 FOR 24),
    ticket_id,
    author."id",
    COALESCE(NULLIF(message->>'authorRole', ''), 'system'),
    COALESCE(NULLIF(message->>'body', ''), ticket_body),
    message_sequence,
    NULL,
    message_sent_at,
    message_sent_at,
    message_sent_at
FROM numbered_messages
LEFT JOIN "users" AS author
    ON author."id" = NULLIF(message->>'authorId', 'guest');

ALTER TABLE "support_tickets" DROP COLUMN "messages";

CREATE TABLE "support_ticket_event_outbox" (
    "id" VARCHAR(24) NOT NULL,
    "ticketId" VARCHAR(24) NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "support_ticket_event_outbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_ticket_attachments" (
    "id" VARCHAR(24) NOT NULL,
    "ticketId" VARCHAR(24) NOT NULL,
    "uploadedById" VARCHAR(24),
    "storageKey" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "support_ticket_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "support_ticket_messages_ticketId_sequence_key"
    ON "support_ticket_messages"("ticketId", "sequence");
CREATE UNIQUE INDEX "support_ticket_messages_ticketId_clientMessageId_key"
    ON "support_ticket_messages"("ticketId", "clientMessageId");
CREATE INDEX "support_ticket_messages_ticketId_sentAt_idx"
    ON "support_ticket_messages"("ticketId", "sentAt");
CREATE INDEX "support_ticket_event_outbox_publishedAt_availableAt_createdAt_idx"
    ON "support_ticket_event_outbox"("publishedAt", "availableAt", "createdAt");
CREATE UNIQUE INDEX "support_ticket_attachments_storageKey_key"
    ON "support_ticket_attachments"("storageKey");
CREATE INDEX "support_ticket_attachments_ticketId_createdAt_idx"
    ON "support_ticket_attachments"("ticketId", "createdAt");
CREATE INDEX "support_ticket_attachments_uploadedById_createdAt_idx"
    ON "support_ticket_attachments"("uploadedById", "createdAt");
CREATE INDEX "support_tickets_userId_accountType_createdAt_idx"
    ON "support_tickets"("userId", "accountType", "createdAt");
CREATE UNIQUE INDEX "notifications_sourceEventId_key"
    ON "notifications"("sourceEventId");
DROP INDEX "support_tickets_userId_createdAt_idx";

ALTER TABLE "support_ticket_messages"
    ADD CONSTRAINT "support_ticket_messages_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_ticket_messages"
    ADD CONSTRAINT "support_ticket_messages_authorUserId_fkey"
    FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_ticket_event_outbox"
    ADD CONSTRAINT "support_ticket_event_outbox_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_ticket_attachments"
    ADD CONSTRAINT "support_ticket_attachments_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_ticket_attachments"
    ADD CONSTRAINT "support_ticket_attachments_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
