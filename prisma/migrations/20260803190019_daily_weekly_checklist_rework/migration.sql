/*
  Warnings:

  - You are about to drop the column `checkedBudget` on the `daily_reviews` table. All the data in the column will be lost.
  - You are about to drop the column `checkedComments` on the `daily_reviews` table. All the data in the column will be lost.
  - You are about to drop the column `checkedCpl` on the `daily_reviews` table. All the data in the column will be lost.
  - You are about to drop the column `checkedFrequency` on the `daily_reviews` table. All the data in the column will be lost.
  - You are about to drop the column `checkedLeadDelivery` on the `daily_reviews` table. All the data in the column will be lost.
  - You are about to drop the column `checkedLeads` on the `daily_reviews` table. All the data in the column will be lost.
  - You are about to drop the column `checkedRejected` on the `daily_reviews` table. All the data in the column will be lost.
  - You are about to drop the column `checkedScheduling` on the `daily_reviews` table. All the data in the column will be lost.
  - You are about to drop the column `checkedService` on the `daily_reviews` table. All the data in the column will be lost.
  - You are about to drop the column `adjustmentsDone` on the `weekly_reviews` table. All the data in the column will be lost.
  - You are about to drop the column `clientReplied` on the `weekly_reviews` table. All the data in the column will be lost.
  - You are about to drop the column `createdAd` on the `weekly_reviews` table. All the data in the column will be lost.
  - You are about to drop the column `createdCreative` on the `weekly_reviews` table. All the data in the column will be lost.
  - You are about to drop the column `reportSent` on the `weekly_reviews` table. All the data in the column will be lost.
  - You are about to drop the column `testedAudience` on the `weekly_reviews` table. All the data in the column will be lost.
  - You are about to drop the column `updatedOffers` on the `weekly_reviews` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "daily_reviews" DROP COLUMN "checkedBudget",
DROP COLUMN "checkedComments",
DROP COLUMN "checkedCpl",
DROP COLUMN "checkedFrequency",
DROP COLUMN "checkedLeadDelivery",
DROP COLUMN "checkedLeads",
DROP COLUMN "checkedRejected",
DROP COLUMN "checkedScheduling",
DROP COLUMN "checkedService",
ADD COLUMN     "checkedBalance" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "checkedBillingLimit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "checkedDailyBudget" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "checkedPendingPayments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "checkedTodaySpend" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "checkedWhatsappResolved" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "weekly_reviews" DROP COLUMN "adjustmentsDone",
DROP COLUMN "clientReplied",
DROP COLUMN "createdAd",
DROP COLUMN "createdCreative",
DROP COLUMN "reportSent",
DROP COLUMN "testedAudience",
DROP COLUMN "updatedOffers",
ADD COLUMN     "checkedBestCampaigns" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "checkedWeeklyCost" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "definedNewCampaigns" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "definedNewCreatives" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentCleared" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reportGenerated" BOOLEAN NOT NULL DEFAULT false;
