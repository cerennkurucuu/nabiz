CREATE TABLE "ScanArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scanId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "viewport" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "selector" TEXT,
    "label" TEXT,
    "fileName" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScanArtifact_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "ScanJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ScanArtifact_scanId_idx" ON "ScanArtifact"("scanId");

CREATE INDEX "ScanArtifact_userId_createdAt_idx" ON "ScanArtifact"("userId", "createdAt");
