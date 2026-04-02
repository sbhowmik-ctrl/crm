-- CreateTable
CREATE TABLE "PendingCredentialKeySubmission" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PendingSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "submitterId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionNote" TEXT,

    CONSTRAINT "PendingCredentialKeySubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingCredentialKeySubmission_status_idx" ON "PendingCredentialKeySubmission"("status");

-- CreateIndex
CREATE INDEX "PendingCredentialKeySubmission_submitterId_idx" ON "PendingCredentialKeySubmission"("submitterId");

-- CreateIndex
CREATE INDEX "PendingCredentialKeySubmission_sectionId_idx" ON "PendingCredentialKeySubmission"("sectionId");

-- AddForeignKey
ALTER TABLE "PendingCredentialKeySubmission" ADD CONSTRAINT "PendingCredentialKeySubmission_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingCredentialKeySubmission" ADD CONSTRAINT "PendingCredentialKeySubmission_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CredentialSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingCredentialKeySubmission" ADD CONSTRAINT "PendingCredentialKeySubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
