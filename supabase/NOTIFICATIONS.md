# Prediction reminders

Two opt-in Web Push reminders: 24 hours and 2 hours before a round reveal deadline, only for players with future fixtures missing predictions. The scheduler runs every five minutes.

Setup: log in on each phone, enable automatic reminders, allow browser notifications, then send the remote test. A push-provider acceptance response does not prove that the phone displayed a notification. Only Joe had an older registration, using a signing key whose private half was unavailable; that registration must be renewed.

Signing configuration is generated server-side and stored in Vault as pl_web_push_vapid. It is accessed only through pl_push_config, executable by service_role. No keys belong in source control. Scheduled calls use the existing Vault-backed pl_final_sync_token and verify_final_sync_token authorization.

Tables: pl_push_subscriptions (enabled, vapid_public_key) and RLS-protected pl_push_deliveries. pl_claim_push_delivery grants one delivery claim per phone, round and reminder window, with up to three attempts and a five-minute lease. Provider 404/410 disables expired registrations.

Scheduled job: pl-predict-deadline-reminders, */5 * * * *, calling queue_prediction_reminders().

push-reminders accepts an authorized POST with {"dry_run":true} to evaluate without sending. push-register supports public GET for the public signing key only, and player-PIN-protected POST actions register/status/test/unsubscribe. Remote tests target only that player's supplied registered device. Website Origin and a push-service endpoint allowlist are checked.
