-- Rastro do anúncio no lead e registro dos eventos mandados pra Meta.

ALTER TABLE "leads"
  ADD COLUMN "fbclid" TEXT,
  ADD COLUMN "fbc" TEXT,
  ADD COLUMN "fbp" TEXT,
  ADD COLUMN "landingUrl" TEXT,
  ADD COLUMN "clientIp" TEXT,
  ADD COLUMN "clientUserAgent" TEXT,
  ADD COLUMN "pixelEventId" TEXT;

-- Um registro por evento enviado. O par (lead, evento) é único: o mesmo lead
-- não manda "QualifiedLead" duas vezes mesmo que o cartão vá e volte de coluna.
CREATE TABLE "meta_capi_events" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "sucesso" BOOLEAN NOT NULL DEFAULT false,
  "resposta" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "meta_capi_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "meta_capi_events_leadId_eventName_key" ON "meta_capi_events"("leadId", "eventName");
CREATE INDEX "meta_capi_events_createdAt_idx" ON "meta_capi_events"("createdAt");

ALTER TABLE "meta_capi_events" ADD CONSTRAINT "meta_capi_events_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
