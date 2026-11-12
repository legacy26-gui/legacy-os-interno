-- CreateTable
CREATE TABLE "meta_ad_creatives" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "adName" TEXT NOT NULL,
    "status" TEXT,
    "thumbnailUrl" TEXT,
    "previewUrl" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_ad_creatives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meta_ad_creatives_adAccountId_adId_key" ON "meta_ad_creatives"("adAccountId", "adId");

-- AddForeignKey
ALTER TABLE "meta_ad_creatives" ADD CONSTRAINT "meta_ad_creatives_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "meta_ad_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
