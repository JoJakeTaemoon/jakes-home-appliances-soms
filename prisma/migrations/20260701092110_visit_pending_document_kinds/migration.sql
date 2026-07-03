-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "pendingDocumentKinds" "DocumentKind"[] DEFAULT ARRAY[]::"DocumentKind"[];
