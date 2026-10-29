# אימות אוטומציית Meta CAPI, 29.10.2026

תחום האישור: שידור אוטומטי של לידים חדשים ממקור LP1 ב־Monday ל־Meta API. הפרויקט כולו עדיין אינו מוכן להפעלה מלאה.

| דרישה | סטטוס | ראיה |
| --- | --- | --- |
| source_and_durable_deduplication | PASS | docs/evidence/20261029-meta-capi-auto/funnel.log: npm run test:funnel exit 0, 407/407, including process races and deliberate broken-guard negative control. |
| vps_preparation | PASS | docs/evidence/20261029-meta-capi-auto/vps-prepared.json: git pull, disposable nginx test and dedicated image build; existing core unchanged. |
| server_credential_provisioning | PASS | docs/evidence/20261029-meta-capi-auto/vps-credential-provisioning.json: owner-approved secure transfer; directory 0700, three files 0400 UID 1000; no values logged. |
| intake_and_exact_monday_id | PASS | docs/evidence/20261029-meta-capi-auto/intake-response.json and monday-before-delete.json: one public POST HTTP 200, stored event ID TEST-META-AUTO-20261029-001, owner 75075191. |
| controlled_automatic_conversion | PASS | docs/evidence/20261029-meta-capi-auto/automatic-acknowledgement.json: automatic worker ACKED exactly one event; Meta HTTP 200, eventsReceived 1, trace Aq3kTEYpzi0yB5DoTJplZnt; no manual Meta POST. |
| persistent_duplicate_prevention | PASS | docs/evidence/20261029-meta-capi-auto/post-restart-readback.json: real restart 2026-10-29T09:31:28.301538454Z; subsequent ticks acknowledged 0, duplicates 1; ledger ACKED remains 1. |
| test_cleanup | PASS | docs/evidence/20261029-meta-capi-auto/cleanup.json: independent Monday state deleted for 3317059439, original four active IDs preserved. |
| persistent_live_service | PASS | docs/evidence/20261029-meta-capi-auto/live-readback.json and live-readback.txt: live activation, 300000 ms polling, healthy, unless-stopped; first live scan acknowledged 0 and skipped 4 historical items. |
| existing_services_and_no_whatsapp | PASS | docs/evidence/20261029-meta-capi-auto/live-readback.json: core container, nginx configuration and n8n workflow/settings hashes unchanged; dedicated worker has no WhatsApp provider call. |
| new_automatic_event_meta_ui_processing | NOT TESTED | No independent processed row for this new automatic event was obtained from the Meta UI. The older 07:50:33 receipt belongs to a different manual test and is not used as proof here. |
| exact_event_id_meta_ui_readback | NOT TESTED | Meta CRM Test Events does not expose event_id in the observed view. Exact stored and outbound ID verified by Monday and the durable dispatch ledger; Meta acceptance receipt does not echo the ID. |
| full_project_readiness | BLOCKED | completion-readiness-20261028.json: WhatsApp live delivery and provider activation, Calendly live test and approved video assets remain incomplete. |

השירות פועל בנפרד, סורק כל חמש דקות ומשתמש במזהה האירוע השמור ללא שינוי. אין שליחת WhatsApp ואין שינוי בהגדרות n8n. אירועים ישנים ופריטי TEST אינם משודרים במצב הקבוע. רשומת מניעת הכפילויות נשמרת גם לאחר הפעלה מחדש; כשל עמום אינו גורר שידור חוזר אוטומטי.

אישור ה־API אינו הוכחה לייחוס מודעה או לאיכות התאמת האירוע. התראת חוץ לעובד CAPI הנפרד טרם הוטמעה; בדיקת הבריאות הקיימת בשרת מזהה כשל.
