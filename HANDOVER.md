# HANDOVER

עדכון בדיקות עצמאיות, 29.10.2026: PASS ל־516 בדיקות מקומיות וליצירה מקבילה בשלושת הקמפיינים. FAIL לדחיית שינוי קמפיין עם אותו event_id בגרסה הפעילה: שלוש חזרות קיבלו 200 במקום 409, ללא יצירת פריט נוסף. קוד ההגנה קיים במקור; נוסף כלי הכנה מוגן לזוג צמתי הקוד בתהליך בן 41 צמתים, ללא פרסום. פרסום התיקון BLOCKED תחת איסור שינוי n8n. שלושה לידים ושמונה התראות נמחקו ואומתו deleted; הלוח חזר לארבע רשומות הבסיס. שמונת הדפים תקינים, עובד CAPI healthy והניטור active. אין WhatsApp ואין שינוי בתהליך הקליטה המפורסם. Cosend והפעלת המענה, מסירה מאושרת ו־24 שעות יציבות נותרו פתוחים. מוכנות הפרויקט BLOCKED. [הדוח העדכני](docs/runtime/INDEPENDENT_FINAL_ACCEPTANCE_20261029.md); [הגאנט](docs/runtime/FINAL_ACCEPTANCE_GANTT_20261029.md).


עדכון Cosend והכנת מעבר, 29.10.2026: חיבור MCP נשאר BLOCKED. שני שרתי DNS ציבוריים החזירו NXDOMAIN, בעוד דומיין Cosend הראשי נפתר. שער הקריאה אימת בעלים אך נשאר STAGE1_LOCKED עם גישה לספק כבויה; אין בכך אימות זהות או הרשאות של Cosend. זהות והרשאות ספק בקריאה חדשה הן NOT TESTED. לא התקבל עדכון תמיכה חדש.

PASS להכנת חבילת המעבר, ל־84 בדיקות הגנות מקומיות עם ספקים מדומים ולבדיקת התוסף עם שמונה בקרות שליליות. יורם בחר א׳–ה׳ 08:15–20:00 לחבילת הכנת העוזר בלבד; המדיניות הפעילה והאתר לא שונו. אין הפעלה, שינוי n8n, שליחת WhatsApp, חילוץ סודות או תקציב חדש. לאחר הסרת חסם הספק נדרשים OAuth וזהות והרשאות קריאה, שיוך נציג, אישור מעבר ומסירה נפרדת ו־24 שעות יציבות. מוכנות מלאה BLOCKED. [הבדיקה וחבילת המעבר](docs/runtime/COSEND_RECHECK_AND_CUTOVER_20261029.md).

עדכון סגירת חסם הפריסה, 29.10.2026: PASS. גרסה 94456d6 נפרסה ל־VPS לאחר גיבוי ובדיקת nginx. שמונה דפים החזירו HTTP 200 והתאימו לבנייה בשתי בדיקות רצופות. שלוש הפניות UTM ישנות תקינות. שלושת הטפסים החדשים אומתו מקצה לקצה מול Monday: הרצות 71752, 71756 ו־71758; פריטים 3318874956, 3318875248 ו־3318876607; שבעה שדות תואמים, בקשת שירות וללא הסכמה לדיוור. שלושתם נמחקו ואומתו deleted, והלוח חזר לארבע רשומות הבסיס. גם ביומן השרת אומתו שלוש תגובות HTTP 200.

לא נשלח WhatsApp. שני רכיבי השליחה כבויים בתהליך המפורסם 60101067, ותהליכי n8n, השירותים המוגנים והמתזמנים נשמרו לפי השוואה לפני ואחרי. יתרת ההפעלה היא Cosend והרשאותיו, מעבר מאושר למענה יחיד ולחבילות המענה לכל קהל, בדיקת מסירה באישור נפרד ו־24 שעות יציבות. מוכנות הפרויקט BLOCKED. אימות עצמאי של מידרג נשאר NOT TESTED; ציון 9.89 מוצג כנתון העסק. עדכון זה גובר על חסם הגישה המתועד בהמשך. [דוח התוכן והפריסה](docs/runtime/CAMPAIGN_CONTENT_20261029.md); [הגאנט](docs/runtime/FINAL_ACCEPTANCE_GANTT_20261029.md).

עדכון התאמת שלושת הקמפיינים והלוגו, 29.10.2026: PASS למקור ולבדיקות המקומיות. נוספו דף, הצעה, טופס ודף תודה לכל קהל; 30 זוויות פרסום ותשע טיוטות שירות נפרדות, ללא הפעלה. הלוגו המקורי שולב בטופס. BizReviews מציג 5.0 מתוך 5 עם 74 חוות דעת; מידרג 9.89 מוצג ״על פי נתוני אקסלנט״ ואימות ישיר שלו במידרג הוא NOT TESTED. עברו 13 בדיקות מקור ו־31 תרחישי דפדפן עם קליטה מדומה; LCP במעבדה 2.23 עד 2.35 שניות. גרסת המקור 92db797 עלתה ל־Git.

פריסה BLOCKED: חיבור Chrome המאומת נעלם, ובדפדפן הפנימי Hostinger מציג כניסה. פקודת הפריסה טרם הופעלה. בדיקת שלושת הנתיבים החדשים בייצור היא NOT TESTED. ראיית הקליטה החיה הקודמת נשמרת ואינה מוצגת כבדיקה חדשה. יתרת הסיום: חידוש גישה ופריסת הדפים עם קריאה חיה ובדיקת טופס; חיבור והרשאות Cosend; מעבר מאושר למענה יחיד; מסירה מאושרת; 24 שעות יציבות ומסירה סופית. אין WhatsApp ואין שינוי n8n. מוכנות הפרויקט BLOCKED. [דוח התוכן](docs/runtime/CAMPAIGN_CONTENT_20261029.md); [הגאנט](docs/runtime/FINAL_ACCEPTANCE_GANTT_20261029.md).

עדכון אימות חי של שלושת הקמפיינים, 29.10.2026: PASS לקליטה מהטופס, שבעת שדות Monday ומניעת כפילויות באותו event_id. הרצות היצירה 71236, 71248 ו־71258; שש חזרות מקבילות החזירו HTTP 200 ואת המזהה המקורי. הכפילויות נעצרו ב־Stop And Error ויצרו שש התראות נפרדות בסטטוס ״נעצר / כשל״. שלושת הלידים ושש ההתראות נמחקו ואומתו deleted; ארבע רשומות הבסיס נשמרו. חסם הגישה הקודם נסגר. WhatsApp לא נשלח, והתהליך והגדרות n8n לא שונו.

נותרו Cosend והרשאותיו, מעבר מאושר למענה יחיד, מסירה באישור נפרד, התאמת ההצעה והמסרים לכל קהל ו־24 שעות יציבות. שלושת הקודים משתמשים באותו דף מחזור משכנתא; אין להציג סיווג CRM כהשלמת שלוש חוויות מענה. מוכנות הפרויקט BLOCKED. דוח: [האימות החי](docs/runtime/THREE_CAMPAIGNS_LIVE_20261029.md); [הגאנט](docs/runtime/FINAL_ACCEPTANCE_GANTT_20261029.md).

עדכון שלושת הקמפיינים, 29.10.2026: PASS לבדיקת המקור של שבעה שדות בכל קוד, חזרה על אירוע ודחיית שינוי קמפיין, לצד 27/27 בדיקות נעילה והגנות. PASS לקריאת עמודות היעד ב־Monday החי. BLOCKED לקליטה חיה: חסרה גישה מאומתת לשרת כדי לוודא מראש ששליחת WhatsApp כבויה. ערכי פריטים חדשים ומניעת כפילויות לכל קוד ב־Monday הם NOT TESTED. לא נשלחו לידים, לא נוצרו פריטי TEST ולא שונו הגדרות n8n. אין תלות ב־Cosend לצורך המשך בדיקות הקליטה לאחר החזרת הגישה.

נותרו הקליטה החיה לשלושת הקודים, התאמת מסלול המענה לכל קהל, חיבור Cosend והרשאות, מעבר מאושר למענה יחיד, מסירה באישור נפרד ו־24 שעות יציבות. מוכנות הפרויקט BLOCKED. דוח: [שלושת הקמפיינים](docs/runtime/THREE_CAMPAIGNS_20261029.md); [גאנט מעודכן](docs/runtime/FINAL_ACCEPTANCE_GANTT_20261029.md).

עדכון ניטור מחוץ לשרת, 29.10.2026: PASS. Healthchecks.io בענן עצמאי מקבל אות חיים מה־VPS מדי דקה. היעדר אות אמיתי גרם להתראת DOWN בדוא״ל; חזרת האות גרמה להתראת UP. שתי ההודעות אומתו דרך Gmail העסקי ללא שינוי מצב קריאה. המתזמן פעיל ומופעל באתחול, במסלול חינמי ובסוד מוגן בשרת בלבד. נבדק גם אות אוטומטי מאוחר יותר. אין WhatsApp או שינוי n8n.

BLOCKED למוכנות הפרויקט הכולל: Cosend, מעבר מאושר למענה יחיד, מסירה באישור נפרד, שלושה קמפיינים ו־24 שעות יציבות. כיבוי VPS אמיתי הוא NOT TESTED; בדיקת הקבלה עצרה רק את אות החיים והוכיחה התראת היעדר אות מחוץ לשרת. עדכון זה גובר על מגבלת הניטור החיצוני ההיסטורית בהמשך.

דוח: [ניטור זמינות מחוץ לשרת](docs/runtime/VPS_OFFHOST_MONITORING_20261029.md). תכנון: [גאנט מעודכן](docs/runtime/FINAL_ACCEPTANCE_GANTT_20261029.md).

עדכון ניטור CAPI, 29.10.2026: PASS. בודק נפרד נפרס בגרסה 77b35d1, פעיל מדי דקה. כשל אמיתי של השהיית העובד והתאוששות יצרו התראת כשל אחת והתראת התאוששות אחת, ללא כפילויות. שני מזהי ההתראה 1414737282 ו־1414737034 נקראו בחזרה מ־Monday בחשבון המשרד. ledger ונקודת הפעלה נשמרו; העובד בריא, WhatsApp לא נשלח והגדרות n8n לא שונו.

BLOCKED למוכנות הפרויקט הכולל: Cosend, מעבר מאושר למענה יחיד, בדיקת מסירה נפרדת, שלושת הקמפיינים ו־24 שעות יציבות. מסירת דוא״ל היא PASS: שתי הודעות התקבלו בתיבת המשרד ואומתו דרך Gmail ללא שינוי מצב הקריאה. ניטור נפילת VPS שלם הוא NOT TESTED; הבודק נמצא באותו שרת. אין שינוי בהחלטת השקה ללא וידאו.

דוח: [התראות CAPI וכשל והתאוששות](docs/runtime/CAPI_MONITORING_20261029.md). תכנון: [גאנט מעודכן](docs/runtime/FINAL_ACCEPTANCE_GANTT_20261029.md).

עדכון Meta, 29.10.2026: PASS לחסם אימות האירוע המבוקר בממשק. שורה חדשה בשעה 19:11:13 מציגה Lead שעבר עיבוד עם crm ו־Monday, בעקבות שידור אחד עם HTTP 200. המיפוי תוקן במקור ונפרס בגרסה 5d4b7ef לעובד CAPI בריא במצב live. הרישום העמיד נשמר, פריט TEST נמחק, 416/416 בדיקות מקור עברו. WhatsApp לא נשלח והגדרות n8n לא שונו.

BLOCKED למוכנות הפרויקט הכולל: נותרו Cosend, מעבר מאושר לבעל מענה יחיד, מסירה באישור נפרד, ניטור חיצוני, בדיקת שלושת הקמפיינים ו־24 שעות יציבות. event_id עצמו אינו חשוף בתצוגת Meta שנבדקה; הוכחה מדויקת קיימת ב־Monday ובשידור. אישור ייחוס מודעות בייצור הוא NOT TESTED. אין צורך בסרטוני וידאו כתנאי להשקה לפי החלטת יורם. עדכון זה גובר על תיאורי חסמי Meta ההיסטוריים בהמשך.

דוח: [סגירת אימות Meta](docs/runtime/META_UI_CLOSURE_20261029.md). תכנון: [גאנט מעודכן](docs/runtime/FINAL_ACCEPTANCE_GANTT_20261029.md).

עדכון פרסום Calendly, 29.10.2026: PASS לתיקון שאושר. תהליך wEYSZMNU2JqeEoGZ פורסם בגרסה 9a536702 עם 11 צמתים. המתזמן קורא Gmail, ביטול מנקה תאריך ושעה, ואישור עיבוד נשמר לאחר תשובת כתיבה תקינה. הרצות 68218 ו־68225 אימתו קביעה וביטול מול Monday בקלט סינתטי; 68222 ו־68228 עצרו חזרות לפני כתיבה. הרצה 68251 עיבדה מייל ביטול אמיתי באופן אוטומטי עד Monday ואישור תואם. פריטי TEST נמחקו ואומתו בנפרד. הרגרסיה המקומית עברה 415/415; WhatsApp לא נשלח והגדרות n8n הכלליות לא שונו.

BLOCKED למוכנות הפרויקט הכולל: נותרו חיווי האירוע החדש ב־Meta, Cosend, מסירה המאושרת בנפרד, ניטור, שלושת הקמפיינים ויציבות. מניעת הכפילויות של Calendly אומתה בחזרות עוקבות; מרוץ מקביל וכשל מכוון בייצור הם NOT TESTED. דוח: [פרסום Calendly](docs/runtime/CALENDLY_DEPLOYMENT_20261029.md). תכנון: [גאנט מעודכן](docs/runtime/FINAL_ACCEPTANCE_GANTT_20261029.md). עדכון זה גובר על תיאור חסמי Calendly ההיסטוריים בהמשך.


עדכון בדיקת Calendly ו־Meta, 29.10.2026, גובר על תיאורי עבר בהמשך הקובץ:

| דרישה | סטטוס | ראיה והיקף |
| --- | --- | --- |
| פגישת Calendly אמיתית, אישור וביטול | PASS | פגישה אחת נקבעה באישור תנאים ובוטלה; UUID d8abc264-dc25-4559-ac6b-dabfa788561d. מייל אישור 1a1876ce745b4b26 ומייל ביטול 1a1877933d85abda. |
| התאמת הודעות הספק ל־Monday במסלול בדיקה | PASS | העברה ידנית ל־Webhook הבדיקה, הרצות 68037 ו־68089; event_id נשמר. זו אינה קליטה אוטומטית. |
| קליטה אוטומטית ממייל Calendly | BLOCKED | הגרסה המפורסמת כוללת 10 צמתים ללא חיבור Every 5 min אל Calendly mails וללא Acknowledge booking. לא שונתה תחת האיסור הנוכחי. |
| ניקוי מועד פגישה בביטול בגרסה המפורסמת | FAIL | 68089 עדכנה סטטוס אך השאירה תאריך ושעה. תיקון קיים במקור המקומי ונבדק; טרם פורסם. |
| Meta API בבדיקה מבוקרת נוספת | PASS | TEST-META-UI-20261029-002, HTTP 200, אירוע אחד, trace AF1ZMXDP50xXuPNjb_heI7o. אין שידור חוזר. |
| האירוע החדש בממשק Meta | BLOCKED | גם לאחר יותר מ־30 דקות נצפתה רק השורה הישנה 07:50:33. סיבת הפער טרם הוכחה; אין אישור עצמאי ל־event_id בממשק. |
| ניקוי הבדיקות הנוכחיות | PASS | 3317479530 ו־3317580513 נקראו כ־deleted; הפגישה בוטלה וארבעת פריטי הבסיס נשמרו. |
| שימור n8n והימנעות משליחת WhatsApp | PASS | חותמות הגדרה וחיווט זהות לפני ואחרי; אפס קריאות WhatsApp במסלול שנבדק. |
| מוכנות כוללת להפעלה | BLOCKED | נותרו פריסת Calendly, חיווי Meta, Cosend, מסירה מאושרת, ניטור, שלושה קמפיינים ויציבות. |

הדוח העדכני: [בדיקת Calendly ו־Meta](docs/runtime/CALENDLY_META_VERIFICATION_20261029.md). התכנון: [גאנט השלמה](docs/runtime/FINAL_ACCEPTANCE_GANTT_20261029.md). הראיות: docs/evidence/20261029-calendly-meta. אין הכרזת GO-LIVE READY.


עדכון סופי 28.10.2026: הפריסה ללא WhatsApp הושלמה לגרסה 95e430b. לא נשלחה הודעת WhatsApp.

| דרישה | סטטוס | ראיה |
|---|---|---|
| Git Push ופריסת דף הנחיתה | PASS | גרסה 95e430b בשרת; nginx נבדק במכולה זמנית |
| רגרסיה מלאה | PASS | 478 בדיקות מקומיות; בנוסף 8 יחידה ו־22 דפדפן לדף הנחיתה, 84 לשירות Cosend ו־4 לחוזי החיבור |
| ליד חי, שיוך Monday וניקוי | PASS | הפריטים 3315939649 ו־3316011067 נקראו עם מזהי אירוע ואחראי; שניהם במצב deleted |
| עצירת כפילות והתראה מרכזית | PASS | הרצה 60730; התראה 3315998923 נקראה ונמחקה |
| חיבור PostHog והמרה אמיתית | PASS | פרויקט Excelent 302284; quote_submitted עם event_id תואם ל־Monday; אין פרטי קשר במאפייני האירוע |
| איתור Cosend | PASS | חיבור פעיל והרשאת connections:read אומתו; אין בכך אימות שליחה |
| נעילה אטומית בקליטה החיה | BLOCKED | השירות הפרטי עבר מרוץ 20 בקשות; תהליך הקליטה בן 37 צמתים עדיין אינו מחובר. כלי ההטמעה מקבל רק 18 צמתים |
| Meta CAPI | BLOCKED | Dataset 1822147178482498 אותר; אין חיבור שידור וקבלת Test Events מאומתים |
| הפעלת Cosend בייצור | BLOCKED | הרשאות מתאימות, בעלות על המענה, webhooks ואישור שם תצוגה לא הושלמו |
| WhatsApp Delivered | NOT TESTED | אין שליחות לפי ההנחיה המעודכנת |
| פגישת Calendly אמיתית | NOT TESTED | אין אירוע פגישה ושינוי סטטוס מאומתים |
| עדויות וידאו אותנטיות | BLOCKED | אין סרטונים מאושרים בתצורה |
| רשומת בדיקה היסטורית | BLOCKED | בדיקה CHG018c, מספר 3291304369, נשארה ללא שינוי וממתינה להחלטת שימור או מחיקה |

החלטת המוכנות הכוללת: BLOCKED. [הדוח העדכני](docs/runtime/completion-readiness-20261028.json), [אימות PostHog](docs/runtime/completion-posthog-20261028.json), [פריסה וניקוי](docs/runtime/completion-postdeploy-20261028.json). בדיקות מקומיות אינן הוכחה לספק חיצוני. סעיפים קודמים בהמשך הקובץ הם היסטוריים; בפרט החסם הישן של PostHog הוסר.


תוצאת פריסה 28.10.2026: PASS לגרסה 19ae97c באתר refi.excelentfinance.com ולשירות הנעילה הפרטי. nginx נבדק במכולה זמנית לפני חידוש השירות. ארבעה נתיבים ציבוריים החזירו HTTP 200 והתאמה לקובצי השרת.

בדיקה חיה: הטופס יצר פריט 3315939649 עם UTM, מזהה אירוע ואחראי 75075191. חזרה עם אותו מזהה החזירה HTTP 200 ואותו פריט תוך 833 מילישניות, ללא ליד נוסף. Stop And Error עצר את הכפילות בהרצה 60730 ונוצרה התראה מרכזית 3315998923. שני הפריטים נמחקו ומצב deleted נקרא בנפרד. לא נשלחה הודעת WhatsApp.

שירות הנעילה עבר מרוץ של 20 בקשות, אחת התקבלה ו־19 נחסמו; אין בכך הוכחה לנעילה ב־Intake, שעדיין אינו מחובר אליו. patch-export.js תומך כיום רק במבנה 18 צמתים, לעומת 37 בתהליך החי, ונדרשת התאמה בדוקה השומרת את טיפול השגיאות. הרשומה ההיסטורית בדיקה CHG018c נשארה ללא שינוי.

[ראיות הפריסה והניקוי](docs/runtime/completion-postdeploy-20261028.json). החלטת המוכנות הכוללת נשארת BLOCKED.


עדכון מאומת 28.10.2026: החלטת המוכנות היא BLOCKED. לא נשלחה הודעת WhatsApp.

נמצאו חיבור Cosend לקריאה בלבד ו־Dataset של Meta. PostHog אינו מוגדר באתר החי. עברו 477 בדיקות ברגרסיה, 84 בדיקות שירות Cosend, 4 בדיקות חוזה נוספות, 7 בדיקות יחידה ו־22 בדיקות דפדפן של דף הנחיתה. שלוש מדידות Lighthouse נפרדות עברו מתחת ל־2.5 שניות; הריצה הקודמת שנכשלה נשמרה. אלה בדיקות מעבדה וחלקן משתמשות בספקים מדומים.

חסמי הסיום: CAPI ללא חיבור שידור וקבלה מאומתים; PostHog ללא פרויקט ומפתח; Intake חי ללא Lock אטומי; Calendly ללא פגישה אמיתית מאומתת; אין סרטוני עדות מאושרים; הפעלת Cosend מוגנת ונשארת חסומה. Build חדש ל־live ול־pilot חסום במכוון; תוצרי עבר אינם היתר להפעיל שליחה.

הראיות והסטטוס המדויק לכל דרישה: [דוח המוכנות המעודכן](docs/runtime/completion-readiness-20261028.json), [מיפוי חיבורים](docs/runtime/completion-connections-20261028.json), [מדידות ביצועים](docs/runtime/completion-performance-20261028.json). סעיפים קודמים בהמשך הם היסטוריים, ובפרט זיהוי ספק או אישור Build ישנים אינם גוברים על עדכון זה.


## מערכת תפעול מתוכן שיחות, 27.10.2026

מצב המערכת המלאה: BLOCKED. נבנתה ליבת ניסיון נפרדת תחת `src/services/business-ops`: שיוך תיק לפי מזהים, משימות ותלויות, ראיות השלמה, היסטוריה, API לפי תפקידים, טיוטות וסיכומים. מסע סינתטי של שיחה, מייל ו־WhatsApp עודכן באותה רשומת Monday ונקרא בחזרה בשלוש גרסאות. אין חיבור רציף למקורות, מודל פעיל או כתיבת משימות ייצור. WhatsApp נשאר קריאה וטיוטות בלבד. לא שונו תהליכי n8n הקיימים.

מפה, אחריות, סמכויות, פערי חיבור, תחזוקה והמשך: [docs/business-ops/README.md](docs/business-ops/README.md). ראיות חיות מצומצמות: [docs/runtime/business-ops-monday-20261027.json](docs/runtime/business-ops-monday-20261027.json). בדיקה: `npm run test:business-ops`; הדגמה מקומית: `npm run demo:business-ops`.

## עדכון טיפול מרכזי בשגיאות, 27.10.2026

PASS: Central Error Handler פורסם וחובר לשלושת תהליכי הליבה. אומתו מיילים, עדכון ויצירת רשומות Monday, חריגות אבטחה, כפילות ו־HTTP 429 בבקשות בדיקה. שמונת פריטי הבדיקה נמחקו. `npm test` עבר עם 427 בדיקות. הדוח המפורט: [CENTRAL_ERROR_HANDLER.md](docs/runtime/CENTRAL_ERROR_HANDLER.md).

קליטת הלידים כוללת כעת 37 צמתים ועדיין חסרה Lock. ההרשמה כוללת 29 צמתים, וביטוי חיפוש הטלפון הישן תוקן. מנוע ההודעות כולל 52 צמתים ונשאר במצב הבדיקה הלא פעיל. שינויי הגדרות Error Workflow בוצעו לפי ההוראה המפורשת למשימה זו. חסמי Go Live המפורטים בהמשך נשארים בתוקף.

## מצב נוכחי, 27.10.2026

החלטת מוכנות: BLOCKED. המערכת אינה מוכנה להפעלה. הסעיפים בהמשך הקובץ הם היסטוריים; אישור Build או שדה liveReady בבדיקת תצורה אינם אישור לתפעול בייצור.

היקף הבדיקה הנוכחית הוא קמפיין refi, לוח 5106246268 והענף codex/lock-service-20261025. לא הופעל מנוע live ולא נשלחה הודעת WhatsApp. מספר השליחה לא שונה ולא נותק.

| דרישה | סטטוס | ראיה וגבול האימות |
|---|---|---|
| 1.1 שני המפתחות ב־Payload של n8n | PASS | הצומת הפרוס נקרא Save to Monday. תוספת text_mm8c3r4v ו־multiple_person_mm8c8hfp פורסמה ואומתה בבדיקה המתועדת ב־docs/runtime/monday-dry-run-capi-20261027.json |
| 1.2 יצירה וקריאה חוזרת של שבעה שדות | PASS | n8n יצר TEST מספר 3312154790. Monday החזיר התאמה של 7/7 שדות, כולל TEST_CAPI_EVENT_12345 ואחראי 75075191. קלט סינתטי, כתיבה אמיתית ל־CRM |
| 1.3 מחיקת הפריט | PASS | delete_item הצליח; קריאה חוזרת החזירה state=deleted והפריט אינו ברשימת הלוח הפעילה |
| 2.1 טפסים ו־Payload מלא דרך האתר הפרוס | NOT TESTED | מקומית עברו שלושת נתיבי nginx ושמירת גוף הבקשה. בייצור שלוש בקשות ללא טלפון נדחו ב־HTTP 400. לא בוצעה יצירה חיובית דרך האתר הפרוס, ותיקון event_id המקומי טרם נפרס |
| 2.2 מניעת כפילות לפי event_id בייצור | BLOCKED | התיקון המקומי עבר בדיקות replay ובדיקות שליליות. ב־Workflow הפרוס 8W7MymUCLpPnilJs יש 18 צמתים ואין צומת Lock. לא הוכחה מניעה אטומית בייצור |
| 3.1 הודעת WhatsApp במסלול Coexistence | BLOCKED | קריאת Meta אמיתית דרך Credential 2392gTlqAQR49WRY החזירה id=1350440204809114, display_phone_number=+972 55-988-1245, is_on_biz_app=false. צומת השליחה נשאר כבוי |
| 3.2 Delivered ושיוך ההודעה לליד | NOT TESTED | לא נשלחה הודעה ולא התקבל callback. אישור קבלת בקשה אינו הוכחת מסירה |
| 4.1 Calendly ועדכון פגישה אמיתית ב־Monday | NOT TESTED | Workflow wEYSZMNU2JqeEoGZ נקרא מצב בדיקה בלי סריקת מייל. הצומת Calendly mails אינו מחובר למסלול. Get Many מול notifications@calendly.com ביומיים האחרונים החזיר פריט ריק; אין אירוע אמיתי שניתן לאמת |
| 4.2 שידור Conversion Event ל־Meta CAPI | BLOCKED | לא סופקו Dataset או Pixel, חיבור שידור מתאים ו־test_event_code. שמירת CAPI Event ID ב־CRM אינה הוכחת שידור |
| 5.1 Build של pilot ושל live | PASS | שישה קבצים לכל מצב, מהם חמישה Workflows ומילון מוצרים. docs/runtime/pilot-artifacts-20261027.json מכיל SHA256 ובדיקת תחביר, קישורים ושיוך Meta |
| 5.2 כל הסוויטה המקומית | PASS | npm test, exit 0: מנוע וקליטה 354/354, אתר 59/59, nginx אמיתי 2/2. סך הכול 415/415. שירותים חיצוניים בבדיקות המקומיות מדומים |
| 5.3א בדיקות מקומיות וסודות | PASS | סוויטה מלאה וסריקת secrets עברו. לא נכתבו access tokens לקוד. Credential ID אינו מפתח API |
| 5.3ב ניקוי פריטי הבדיקה הנוכחית | PASS | הפריטים 3312144932 ו־3312154790 נמחקו. ברשימה המלאה של הלוח, cursor=null, אין שמות המתחילים ב־TEST |
| 5.3ג היעדר כל רשומת בדיקה היסטורית | BLOCKED | קיימת רשומה קודמת 3291304369 בשם בדיקה CHG018c. היא קדמה להרצה ולא נמחקה כהשערה. דרושה הכרעה אם זו רשומה לשימור או למחיקה |
| 5.4 commit ו־push לענף המבוקש | PASS | c5bae8d ומיזוג b1eac9f נדחפו ל־origin/codex/lock-service-20261025, exit 0. התיקון האחרון והדוחות נמסרים ב־commit ההשלמה; יש להשוות HEAD ל־ls-remote אחרי ה־push |
| 5.5 דוח מוכנות והכרזת Go Live | BLOCKED | הדוחות נוצרו. החוסמים לעיל אינם מאפשרים הכרזת GO-LIVE READY |

### שינויים בקוד

1. הטפסים שולחים event_id יציב השווה למפתח הבקשה. retry ללא שינוי תוכן שומר על אותו מזהה.
2. Validate משתמש ב־event_id או eventId כמפתח replay, דוחה מזהים לא תקינים או סותרים, ושומר תאימות לבקשות ישנות. שימוש חוזר במזהה עבור נמען או תוכן שונים נדחה.
3. Build mutation מעביר את מזהה האירוע אל ביטוי ה־Payload. מיפויי העמודות והאחראי נשארים בתצורת הקמפיין.
4. מצב test אינו יורש את חיבור Meta החי מהסביבה. Credentials שמתחילים ב־PENDING משאירים את צומת הספק כבוי, בהתאם לדחיית SMS ומייל.
5. הבנאי כותב גם לתיקיות pilot ו־live, ובדיקת nginx הותאמה לנתיבי Windows בלי לשנות את בדיקות הבידוד.

### בדיקה עצמית חוזרת

```powershell
$env:META_WA_PHONE_NUMBER_ID="1350440204809114"
$env:META_WA_CREDENTIAL_ID="2392gTlqAQR49WRY"
# יש להגדיר NGINX_BINARY לקובץ nginx מותקן לפני npm test
npm test
node src/deploy/package.js
node src/services/funnel/build-workflows.js pilot 2026-10-26T16:08:56.417Z 972502234052
node src/services/funnel/build-workflows.js live 2026-10-26T16:08:56.417Z
node src/services/funnel/build-workflows.js test
node --test tests/funnel/secrets.test.js
git diff --check
```

תאריך החיתוך בבנייה נשמר מה־release הקודם; הוא אינו אישור להפעלה. המענה המיידי נשאר כבוי בתצורת הקמפיין. consolidation נשאר טיוטה ואינו נכלל באישור כלשהו.

בדיקות שליליות: שני מבחני event_id נכשלו מול הקוד הישן; הסרת event_id מהטפסים הכשילה ארבע בדיקות דפדפן; צומת fallback פעיל עם Credential מסוג PENDING הכשיל את המבחן החדש; בדיקת nginx מזהה את נתיב ה־staging השגוי. לא הוסרו assertions כדי להשיג הצלחה.

להשלמה נדרשים אימות Coexistence וקבלת Delivered אמיתי, חיבור Lock והמקורות המעודכנים ל־Intake, פריסת האתר לאחר בדיקת nginx במכולה זמנית, אירוע Calendly אמיתי ושידור CAPI עם קבלה תואמת. נדרשים כינוי SSH ונתיב המאגר לפריסה, וכן פרטי חיבור CAPI שאינם סודיים. אין לשלוח מפתח סודי בצ'אט.

הקובץ PILOT_READINESS.md והראיה docs/runtime/pilot-readiness-20261027.json מרכזים את ההחלטה. שינויי Cosend וה־hook שהיו בתיקייה לפני המשימה אינם כלולים ב־commit של המשפך.

## תיעוד היסטורי

History on main: TASK-01 282f73a, TASK-02 1e5143a, TASK-03 9d3cab7, TASK-04 b7fc051, TASK-05 5f50816, TASK-06 bba0efb, TASK-07 caaf845. Full overview: FINAL_HANDOVER.md. The deploy steps below replace section 4 of FINAL_HANDOVER.md.

## TASK-08 Production readiness and deployment package (2026-10-24)

| Requirement | Status | Evidence |
|---|---|---|
| src/deploy/package.js validates every campaign file | PASS | Checks per file: id equals file name, numeric board, all engine columns, template ids (numeric or PENDING), sequences and meeting codes point at existing templates, cascade and providers (WhatsApp = gambot), opt-out label, instant reply (1 to 60 seconds, category, enabled only with an approved id), temperature bands, Meta ids, identity profile and contact phone against config/business.json. Across files: one Meta campaign id per campaign. Any error stops the package (exit 1) |
| Builds the n8n workflow files | PASS (build only) | Test mode for every campaign: dist/ (refi) and dist/consolidation/, each engine-test, go, calendly, instant-reply-test. Every file parses, has nodes and connections, and keeps no placeholder except the secret `__TEST_PATH__` paths. Rebuild is byte-identical. No live build: that needs approval from יורם |
| .env.production.example | PASS | Generated from the list in package.js: LOCK_SERVER_HOST, LOCK_SERVER_PORT, LOCK_SERVER_TOKEN, LOCK_DB_PATH, LOCK_SERVER_URL, LOCK_CREDENTIAL_ID, INSTANT_REPLY_WORKFLOW_ID, CAMPAIGN, GAMBOT_API_KEY, META_VERIFY_TOKEN, META_APP_SECRET, META_ACCESS_TOKEN. All secrets empty. A test fails if src reads an env var missing from the file or if the file drifts from the list. .env.production is gitignored |
| Import into the real n8n and production run | BLOCKED | No n8n or VPS access here, and every live step needs approval from יורם |

Current output of `node src/deploy/package.js`: refi has 0 errors and is live ready (approved identity, all templates approved; instant reply off). consolidation has 0 errors and is not live ready: identity not approved, all 8 templates PENDING, no Meta campaign ids, no intake block, status draft.

GAMBOT_API_KEY is listed because the task asked for it, but no repo code reads it: n8n sends it from the Header Auth credential "Header Auth account" (id 6hr28GsvQQrGzjwx in the built files). Set it there, not in an env file.

### Test output
- Linux container (node v22.23.4, nginx 1.22.1): `npm run test:funnel` exit 0, 327/327; `npm run test:deploy` exit 0, 2/2. Windows: `npm run test:site` 55/55. Total 384/384, 0 failures.
- New: tests/funnel/deploy-package.test.js (4 tests). Mutation checks: turning off the id check, dropping an env var from the list, and allowing an enabled instant reply without an id each make tests fail.

### Step by step to go live (each step that touches n8n, Monday, Gambot or Meta needs approval from יורם)

A. Before anything
1. Export every current n8n workflow (intake, reminder, engine, go, Calendly) and keep the files outside git. They are the rollback.
2. On a clean checkout of main: `npm ci`, `npm test` (expect 0 failures), then `node src/deploy/package.js` (expect "ok": true).

B. Lock service on the n8n server (show the commands before running them, per AGENTS.md)
3. `cp .env.production.example .env.production` on the server only. Fill LOCK_SERVER_TOKEN (for example `openssl rand -hex 32`), LOCK_DB_PATH=/data/locks.sqlite, LOCK_SERVER_HOST=0.0.0.0 (inside a container that publishes no port), LOCK_SERVER_PORT=8787.
4. Run it on the n8n Docker network without publishing a port:
   `docker run -d --name lock-server --restart unless-stopped --network <n8n network> --env-file .env.production -v lock-data:/data -v "$PWD":/app:ro -w /app node:22-bookworm node src/services/lifecycle/lock-server.js`
5. Check from inside the n8n container: `wget -qO- http://lock-server:8787/health` returns {"ok":true}.

C. n8n credentials
6. Create a Header Auth credential "Lock server": name Authorization, value `Bearer <LOCK_SERVER_TOKEN>`. Note its id (LOCK_CREDENTIAL_ID).
7. Check that "Header Auth account" (Gambot API key), "Monday.com account" and "Gmail account" exist with the ids used in dist/.

D. Import (all workflows inactive)
8. Import src/services/funnel/dist/instant-reply-test.json. Note its workflow id (INSTANT_REPLY_WORKFLOW_ID).
9. Intake: `CAMPAIGN=refi LOCK_SERVER_URL=http://lock-server:8787 LOCK_CREDENTIAL_ID=<id> INSTANT_REPLY_WORKFLOW_ID=<id> node src/webhooks/intake/patch-export.js <intake-export.json> <intake-out.json>`, then import intake-out.json over the current intake. Keep both files out of git.
10. Reminder: `node src/webhooks/intake/patch-reminder-export.js <reminder-export.json> <reminder-out.json>`, then import.
11. Import dist/engine-test.json, go.json and calendly.json. Fill the `__TEST_PATH__` webhook paths in n8n only; never commit them.

E. Test with TEST leads (names start with TEST, phones 0500000040 and up)
12. One form lead: Monday item with heat and label, exactly one opener (simulated in test mode), callback reminder after 30 or 60 business minutes.
13. The same phone twice within 60 seconds: the second answers duplicate and pending, and no second Monday write happens. Stop lock-server and send a lead: the intake must fail, not save.
14. A "הסר" reply stops every item with that phone. Then delete all TEST items.

F. Go live (only after explicit approval from יורם)
15. Pilot: `node src/services/funnel/build-workflows.js pilot <go-live ISO> <phones>`. The phones must be in the campaign's identity.testPhones: for refi that is excelent_contact (972552783459), backup (972548180280) and yoram_050 (972502234052, added on request after TASK-08, see FINAL_EXECUTION_REPORT.md).
16. Live: `node src/services/funnel/build-workflows.js live <go-live ISO>`, import engine-live.json (gitignored) and activate the intake, reminder, engine, go and Calendly workflows.
17. Instant reply: after Gambot approves the template, set `instantReply.template.id` and `enabled: true` in src/config/campaigns/refi.json, run `npm test` and the package, build live, import instant-reply-live.json and activate it.
18. First 48 hours: watch Monday notifications and Gambot. Rollback: deactivate the workflows, re-import the exports from step 1, `docker stop lock-server`.

### Still open
- Meta Lead Ads: an HTTPS endpoint for the webhook is not built. The adapter is ready (TASK-06).
- consolidation: owner identity, templates, Meta campaign ids and an intake block are missing; only test builds are possible.
- SMS and email providers: BLOCKED by owner decision. Niche_Segment has no Monday column.

## TASK-07 Gambot HSM payload, consolidation config and intake wiring (2026-10-24)

| Requirement | Status | Evidence |
|---|---|---|
| src/config/campaigns/consolidation.json | PASS | The file already existed (draft, identity not approved). Added `meta: {campaignIds: [], adAccount: null}`: no Meta id was invented, so Meta leads still never map to consolidation. Test checks nothing is inherited from refi |
| src/services/funnel/gambot-hsm.js | PASS (Gambot SIMULATED) | `templatePayload` (recipient 9725XXXXXXXX, sender from config/business.json gambot_sender, numeric approved template id) and `instantPayload` (enabled, approved id, WhatsApp consent, UTILITY or marketing consent, receivedAt within 60 seconds, TEST names only in test mode). instant-reply.js now uses it, injected by build-workflows.js; behavior unchanged (existing tests pass) |
| HSM send node in dist | PASS (build) | dist/instant-reply-test.json and dist/consolidation/instant-reply-test.json rebuilt with the module; "Send WhatsApp" posts to send-template and stays disabled in test builds |
| Lock call before the Monday lookup | PASS (synthetic export) | The real intake workflow is a private n8n export, not in dist (it holds the webhook path), so the wiring lives in src/webhooks/intake/patch-export.js: Lock (POST LOCK_SERVER_URL/lock, Header Auth credential) then Locked? then Restore intake then Find query; a lost lock answers "Reply locked" (200, duplicate, pending) with no write. No continue on fail: if the service is down the request fails instead of saving without the lock |
| Instant reply call from the intake | PASS (synthetic export) | After "Reply saved", in parallel with the alert: "Instant reply input" (src/webhooks/intake/instant-reply-input.js, new items only, receivedAt = server receipt time) then Execute Workflow "Instant reply" (no wait, continue on error) |
| Real n8n import and run | BLOCKED | No n8n access; needs approval from יורם |

### Test output
- Linux container (node v22.23.4, nginx 1.22.1): `npm run test:funnel` exit 0, 323/323; `npm run test:deploy` exit 0, 2/2. Windows: `npm run test:site` 55/55. Total 380/380, 0 failures.
- New: tests/funnel/gambot-hsm.test.js (7 tests).
- Mutation checks: routing a lost lock to Find query, adding continue on fail to the Lock node, and removing the 60 second window each make tests fail.

### Deploy steps (need approval from יורם)
1. Run lock-server.js where n8n can reach it (LOCK_SERVER_HOST on the internal Docker network, not 127.0.0.1 of the host). In n8n create a Header Auth credential "Lock server": Authorization = Bearer <LOCK_SERVER_TOKEN>.
2. Import dist/instant-reply-<mode>.json and note its workflow id.
3. Export the intake workflow, then: `LOCK_SERVER_URL=http://<host>:8787 LOCK_CREDENTIAL_ID=<id> INSTANT_REPLY_WORKFLOW_ID=<id> node src/webhooks/intake/patch-export.js in.json out.json`. Keep both files out of git.
4. The instant reply sends nothing until a Gambot template is approved and `instantReply.template.id` and `enabled` are set.

## TASK-06 HTTP lock service and Meta Lead Ads adapter (2026-10-23)

| Requirement | Status | Evidence |
|---|---|---|
| src/services/lifecycle/lock-server.js over db.js | PASS (local) | `POST /lock` {phone, source} returns {locked, phone, lockedUntil}; locked=true means this caller won the 60 second lock. `GET /health` returns {ok:true}. Every call is stored raw in incoming_webhooks and logged in lifecycle_events |
| Lock service security | PASS | Bearer token required (LOCK_SERVER_TOKEN, at least 32 characters, compared in constant time); the service refuses to start without it or without an absolute .sqlite path. Binds to 127.0.0.1 by default. Body capped at 16 KB (413), 10 second request timeout. Unauthorized calls leave no record |
| src/webhooks/intake/meta-adapter.js signature | PASS | X-Hub-Signature-256 (HMAC-SHA256 of the exact raw body with META_APP_SECRET), constant-time compare; rejects a tampered body, wrong secret, missing or malformed header. Also handles the GET subscription challenge (META_VERIFY_TOKEN) |
| Graph API fetch and normalization | PASS (Graph SIMULATED) | GET /v21.0/{leadgen_id}?fields=field_data,created_time,ad_id,adset_id,campaign_id,form_id with the token in the Authorization header, never in the URL; fails closed on Graph errors or a mismatched id. Normalizes the name, phone (same rule as intake), email and Meta ids (leadgen, form, ad, adset, campaign) to the intake shape. The campaign is resolved by `meta.campaignIds` in the campaign config; an unknown campaign is rejected. A lead form is a service request; marketing consent is never assumed |
| No secret in code | PASS | Secrets only from env (.env.example lists them empty). tests/funnel/secrets.test.js scans every text file for Meta, AWS, Google, Slack and private key shapes, and for tokens in URLs. Proven: a planted fake Meta token made it fail |

### Test output
- Linux container (node v22.23.4, nginx 1.22.1), the same as CI: `npm run test:funnel` exit 0, 316/316 pass, 0 fail, 0 skipped; `npm run test:deploy` exit 0, 2/2.
- Windows: `npm run test:site` exit 0, 55/55. Total: 373/373, 0 failures.
- New: lock-server.test.js (6 tests, including 12 parallel HTTP requests where exactly 1 gets the lock), meta-adapter.test.js (7 tests, including the chain signed webhook, Graph lead, normalized intake, HTTP lock, where a redelivery is blocked), secrets.test.js (3 tests).
- Mutation checks: a signature check that always passes fails the adapter test; an auth check that always passes fails the lock test.

## Still open (deploy, needs approval from יורם)
1. Run lock-server.js on the n8n host (env LOCK_SERVER_TOKEN and LOCK_DB_PATH, port 8787 on 127.0.0.1 or the internal Docker network). In the intake workflow, call `POST /lock` before "Find query"; on locked=false, answer as a duplicate without writing.
2. Meta: an HTTPS endpoint that receives the webhook with the raw body, calls verifySignature, then leadgenEvents, fetchLead and normalizeLead, then the lock and the intake. Register it in the Meta app (leadgen field) with META_VERIFY_TOKEN, and grant the page access token leads_retrieval. The hosting endpoint itself is not built.
3. Meta leads currently map only to refi (meta.campaignIds); consolidation has no Meta campaign ids, so its leads are rejected until they are added.

## Atomic lock closure, 2026-10-28

PASS: atomic-intake-20261028.json: published version 60101067-81e0-4daa-b9b2-d4cfa7b9d736, 41 nodes, original 37 nodes/settings preserved; executions 61968 succeeded and 61969/61970 controlled duplicates; real HTTP [200,409,409], exactly one matching Monday item 3316200363 with event ID and person 75075191; TEST lead and both owned central-error alerts independently confirmed deleted; baseline four records preserved. No WhatsApp sends. Source e494d25; local funnel 386/386, exit 0.

Whole-project go-live readiness remains false; unrelated blockers stay open. Details: [atomic intake report](docs/runtime/ATOMIC_INTAKE_20261028.md).


## בדיקת Meta CAPI, 29.10.2026

BLOCKED: נמצא Dataset 1822147178482498, אך לא נמצא חיבור CAPI מורשה לשידור. מיפוי event_id עבר מקומית ו־41 בדיקות ממוקדות עברו; לא נשלח אירוע ל־Meta. נדרש אסימון שרת לנכס, קוד Test Events וקבלה עצמאית לפני אישור המרה. לא נשלחה הודעת WhatsApp ולא שונו הגדרות n8n. [הדוח המעודכן](docs/runtime/META_CAPI_20261029.md). מוכנות כללית נשארת false.


## השלמת בדיקת Meta CAPI, 29.10.2026

PASS לבדיקה המבוקרת בלבד: אסימון נוצר באישור ונשמר מקומית עם NTFS מוגבל וחריגת Git. קליטה 65721 החזירה HTTP 200, Monday 3316551990 שמרה event_id ואחראי, ו־Meta החזירה HTTP 200 ואירוע אחד והציגה CRM Lead שעבר עיבוד ב־07:50:33. הפריט נמחק וארבע רשומות הבסיס נשמרו. אין WhatsApp ואין שינוי הגדרות n8n. קריאה חוזרת של event_id עצמו ממסך Meta היא NOT TESTED כי המזהה אינו מוצג. משדר אוטומטי בייצור נשאר לא מאומת, והמוכנות הכללית false. [דוח וראיות](docs/runtime/META_CAPI_20261029.md).


עדכון CAPI ליום 29.10.2026: PASS לשידור האוטומטי ל־Meta API בלבד. אירוע TEST-META-AUTO-20261029-001 התקבל פעם אחת, HTTP 200, events_received=1. מניעת כפילות אומתה לאחר הפעלה מחדש; פריט 3317059439 נמחק ואומת. עובד CAPI פועל במצב קבוע, בדיקת בריאות תקינה וסריקה כל חמש דקות. הגדרות n8n ושירותי הליבה לא השתנו; לא נשלח WhatsApp. NOT TESTED להופעת האירוע החדש בממשק Meta. BLOCKED למוכנות הפרויקט הכולל. ראיות: docs/runtime/META_CAPI_AUTOMATION_20261029.md.


החלטות יורם מ־29.10.2026: עוזר אקסלנט נבחר לבעל המענה העתידי, עם העברה ליורם; הותרה הכנת בדיקת WhatsApp אחת בלבד לאישור נפרד; גרסת ההשקה אושרה ללא עדויות וידאו. PASS לתוכן ההשקה: HTTP 200, אפס נגני וידאו וסדר שבעת הרכיבים אומתו בקריאה בלבד. BLOCKED לחיבור Cosend: הכתובת הרשמית mcp.cosend.app אינה נפתרת בבדיקת DNS ציבורית. לא נשלחו הודעות ולא שונו הגדרות n8n או המשיב הקיים. פרטים: docs/runtime/COSEND_ACCEPTANCE_PREPARATION_20261029.md. הפרויקט כולו אינו מוכן עדיין להפעלה מלאה.
