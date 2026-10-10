-- Metadata-only incumbent schema passports. Does not store provider record values.
-- A submitted schema observation is NEVER evidence of live provider connection.
CREATE TABLE "incumbent_schema_observations" (
  "id" TEXT NOT NULL,
  "observationKey" TEXT NOT NULL,
  "clientKey" TEXT NOT NULL,
  "providerKey" TEXT NOT NULL,
  "facilityKey" TEXT NOT NULL,
  "apiVersion" TEXT,
  "adapterVersion" TEXT NOT NULL,
  "schemaHash" TEXT NOT NULL,
  "fieldCount" INTEGER NOT NULL,
  "fieldDescriptors" JSONB NOT NULL,
  "sourceVerified" BOOLEAN NOT NULL DEFAULT false,
  "connectionVerifiedAt" TIMESTAMP(3),
  "firstObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "incumbent_schema_observations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "incumbent_schema_observations_observationKey_key"
  ON "incumbent_schema_observations"("observationKey");
CREATE INDEX "incumbent_schema_observations_clientKey_providerKey_facilityKey_lastObservedAt_idx"
  ON "incumbent_schema_observations"("clientKey", "providerKey", "facilityKey", "lastObservedAt");
CREATE INDEX "incumbent_schema_observations_providerKey_schemaHash_idx"
  ON "incumbent_schema_observations"("providerKey", "schemaHash");
