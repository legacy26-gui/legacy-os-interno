/*
  Warnings:

  - You are about to drop the column `openingMonth` on the `cash_settings` table. All the data in the column will be lost.
  - Added the required column `openingDate` to the `cash_settings` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "cash_settings" DROP COLUMN "openingMonth",
ADD COLUMN     "openingDate" DATE NOT NULL;
