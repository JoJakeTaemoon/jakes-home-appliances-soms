-- Office team's "last read" marker on the customer SR message thread.
-- Compared against the max AuditLog.at (action='SR_MESSAGE',
-- actorType='CUSTOMER') for the same SR to decide whether to show
-- the unread badge on lists / sidebar and the "읽음" button on detail.

ALTER TABLE "ServiceRequest"
ADD COLUMN "lastOfficeReadAt" TIMESTAMP(3);
