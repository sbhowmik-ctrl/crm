-- CreateTable
CREATE TABLE "CredentialSection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CredentialSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialKey" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CredentialKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CredentialSection_ownerId_idx" ON "CredentialSection"("ownerId");

-- CreateIndex
CREATE INDEX "CredentialSection_updatedById_idx" ON "CredentialSection"("updatedById");

-- CreateIndex
CREATE INDEX "CredentialKey_sectionId_idx" ON "CredentialKey"("sectionId");

-- CreateIndex
CREATE INDEX "CredentialKey_ownerId_idx" ON "CredentialKey"("ownerId");

-- CreateIndex
CREATE INDEX "CredentialKey_updatedById_idx" ON "CredentialKey"("updatedById");

-- AddForeignKey
ALTER TABLE "CredentialSection" ADD CONSTRAINT "CredentialSection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialSection" ADD CONSTRAINT "CredentialSection_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialKey" ADD CONSTRAINT "CredentialKey_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CredentialSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialKey" ADD CONSTRAINT "CredentialKey_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialKey" ADD CONSTRAINT "CredentialKey_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
