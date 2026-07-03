-- Drop Visit.scheduledWindow — visits now carry only the exact
-- `scheduledFor` DateTime. The imprecise "morning/afternoon/HH:mm-HH:mm"
-- window is retired in favor of a single 24h VST time.
ALTER TABLE "Visit" DROP COLUMN "scheduledWindow";
