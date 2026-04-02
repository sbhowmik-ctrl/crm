-- CreateTable
CREATE TABLE "_CredentialSectionAccess" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CredentialSectionAccess_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_CredentialSectionAccess_B_index" ON "_CredentialSectionAccess"("B");

-- AddForeignKey
ALTER TABLE "_CredentialSectionAccess" ADD CONSTRAINT "_CredentialSectionAccess_A_fkey" FOREIGN KEY ("A") REFERENCES "CredentialSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_CredentialSectionAccess" ADD CONSTRAINT "_CredentialSectionAccess_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
