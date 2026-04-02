-- AlterTable
ALTER TABLE "CredentialSection" ADD COLUMN     "status" "VaultEntityStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "CredentialSection_status_idx" ON "CredentialSection"("status");
