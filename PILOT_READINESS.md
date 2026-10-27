# PILOT_READINESS

עדכון 27.10.2026: טיפול השגיאות המרכזי הוא PASS, עם קישור מאומת לשלושת תהליכי הליבה, התראות אמיתיות ל־office@kho.org.il וניקוי שמונת פריטי הבדיקה. סוויטת הרגרסיה הנוכחית: `npm test`, exit 0, סך הכול 427 בדיקות. [דוח האימות](docs/runtime/CENTRAL_ERROR_HANDLER.md). מנוע ההודעות נשאר לא פעיל במצב בדיקה; חסמי המוכנות הכללית בהמשך נשארים בתוקף.

תאריך: 27.10.2026. קמפיין: refi. החלטת מוכנות לייצור: BLOCKED. goLiveReady=false.

| שער | סטטוס | ראיה |
|---|---|---|
| יצירת TEST ב־n8n ושבעה שדות ב־Monday | PASS | docs/runtime/monday-dry-run-capi-20261027.json; פריט 3312154790, 7/7 |
| מחיקת ה־TEST שנוצר | PASS | state=deleted ופריט חסר ברשימת הלוח הפעילה |
| כל הבדיקות המקומיות | PASS | npm test exit 0, 354 מנוע וקליטה, 59 אתר, 2 nginx; סך הכול 415 |
| זיהוי קלט שבור בבדיקות | PASS | event_id, retry, ספקים עם PENDING ובידוד staging נכשלו במקרי הבקרה המתועדים ב־HANDOVER.md |
| סריקת סודות בקוד הנמסר | PASS | tests/funnel/secrets.test.js, exit 0, 3/3. אין טענה שנסרקה כל היסטוריית Git |
| תוצרי pilot ו־live | PASS | docs/runtime/pilot-artifacts-20261027.json; תחביר, חיבורי צמתים, שיוך מספר ו־Credential. בנייה אינה הפעלה |
| שלושת נתיבי האתר הציבורי | PASS | בקשות חסרות טלפון ל־/api/lead, /api/club, /api/partner החזירו HTTP 400. זהו אימות דחייה בלבד |
| טופס חי ומניעת כפילות לפי event_id | BLOCKED | תיקון המקורות טרם נפרס; אין Lock ב־Intake הפעיל. נדרשת יצירה חיובית אחת ו־replay ללא כתיבה נוספת |
| Coexistence | BLOCKED | Meta החזיר is_on_biz_app=false עבור Phone Number ID שסופק |
| Delivered ושיוך ל־CRM | NOT TESTED | השליחה נשארה כבויה לאחר בדיקת הקדם |
| אירוע Calendly ועדכון פגישה אמיתי | NOT TESTED | קריאת המיילים החזירה פריט ריק, והצומת אינו מחובר למסלול הפרוס |
| Meta CAPI | BLOCKED | חסרים Dataset או Pixel, חיבור שידור ו־test_event_code. דרושה קבלה עם event_id תואם |
| ניקוי כל רשומת בדיקה היסטורית | BLOCKED | הרשומה הקודמת בדיקה CHG018c נשארה ללא שינוי עד להכרעה לגבי שימורה |

הודעות WhatsApp אינן נשלחות דרך Blueticks או Gambot. בדיקת Meta הידנית saKuHqTDTBepgzcL לא פורסמה להפעלה אוטומטית וצומת השליחה בה כבוי. אין להפעיל את מנוע live על סמך דוח הבנייה בלבד.

לפני שינוי שרת יש להציג את הפקודות, לבצע git pull, לבדוק nginx במכולה זמנית ורק אז להפעיל מחדש. לא שונו האתר הראשי, הגדרות n8n, OpenClaw או Hermes.

המערכת עדיין אינה מוכנה להפעלה. אין בדוח זה הכרזת GO-LIVE READY.
