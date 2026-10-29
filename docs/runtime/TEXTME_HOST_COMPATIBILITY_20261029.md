# TextMe: אבחון החיבור הנתמך ל־Dot, 29.10.2026

## תוצאה

BLOCKED: השער הייעודי של TextMe משתמש ב־Bearer קבוע. בטופס ChatGPT Add custom MCP server שנבדק אין מסלול API key או שדה Bearer. הצהרת api_key בחבילה היא תקינה מבחינת סכימה, אך לא משלימה חיבור בממשק הזה. ההנחיה הקודמת לבקש הזנת הסוד בטופס Connect של אותו ממשק לא הייתה נכונה.

גילוי OAuth מהשרת אכן עבד, אך החזיר את השרת הכללי של n8n ולא את שער TextMe: resource הוא https://n8n-qhxa.srv1604140.hstgr.cloud/mcp-server/http. כתובות authorize, token ו־register נמצאות תחת mcp-oauth. ברירות המחדל כללו workflow:read, workflow:write, workflow:execute, execution:read, credential:read, dataTable:read, dataTable:write, project:read, project:write ו־tag:read. אין זו הרשאה מצומצמת לקריאת TextMe.

| דרישה | מצב | ראיה |
|---|---|---|
| בדיקת מסלול חיבור נתמך | PASS | Plugins > Add > Add custom MCP server נפתח בחשבון המחובר; Authentication הציע OAuth, No authentication, OAuth or no authentication |
| גילוי OAuth חי | PASS | Advanced OAuth settings הציג DCR, את mcp-oauth/authorize, mcp-oauth/token, mcp-oauth/register ואת המשאב הכללי mcp-server/http |
| התאמת OAuth לשער TextMe | FAIL | המשאב וההרשאות שהתגלו הם של ניהול n8n, בעוד MCP Server Trigger הייעודי מוגדר לאימות Bearer קבוע |
| מניעת הענקת גישה רחבה | PASS | לא נלחץ Create as a plugin ולא אושר מסך הסכמה. עשר הבחירות סומנו כלא נבחרות בטופס שלא נשמר; הטופס נסגר. לא נוצר App או חיבור כפול |
| תיקון הוראות התוסף | PASS | התוסף הקיים נשאר פרטי ובאותו מזהה; עודכן ל־0.2.1, release pluginrel_6ae2e87624fc8191a4cb265b08206eec. קריאה חוזרת אימתה את תיקון ההוראות, שמירת defaultPrompt ושמירת תצורת MCP ואימות ללא שינוי |
| הכנת רכיב OAuth ייעודי | PASS | לאחר האבחון יורם אישר הכנה בתשתית הקיימת ללא חיוב נוסף. מימוש מקומי ובדיקות הושלמו; ראו TEXTME_OAUTH_PREP_20261029.md. אין בכך ראיה לפריסה או לחיבור הדוט |
| מסך הזדהות מצומצם | BLOCKED | טופס תצורת OAuth נפתח ונבדק; מסך הזדהות תקף לשער TextMe אינו קיים עדיין. לא נפתח למשתמש מסך הענקת הרשאות ניהול n8n כאילו היה חיבור TextMe |
| בדיקת יתרה מתוך הדוט לאחר חיבור | BLOCKED | טרם קיים חיבור נתמך מצומצם ולכן לא נשלחה בקשת בדיקה נוספת ולא בוצעה קריאת יתרה חדשה. הרצה 65692 נשארת ראיית שרת קודמת בלבד |
| שליחה וקמפיינים | NOT TESTED | לא נקראו ולא הופעלו; אין שינוי בספק, ב־Credentials, במסלול n8n, ב־Cosend או ב־Blueticks |

## הכנה קונקרטית למסלול המצומצם

היעד המוצע הוא שכבת OAuth לפני שער ה־MCP הקיים, בתשתית אקסלנט הקיימת. היא תחשוף רק textme_read, תאפשר את שש פעולות הקריאה הקיימות ותשמור את מגבלות הטווח, המספרים והחשבון. אין מעבר לשרת ניהול n8n, אין כלי execute_workflow גנרי ואין קריאה ישירה ל־TextMe עם טוקן ספק חדש.

הרכיב שהוכן משתמש ב־issuer ו־resource ייעודיים, scope יחיד textme:read, Authorization Code עם PKCE S256, התאמת redirect_uri, מגבלות זמן, ביטול גישה, מניעת replay ואחסון עמיד ומוצפן. מסלול הפיילוט מאמת החזקה במפתח המתקשר הייעודי הקיים ואישור קריאה מפורש ל־15 דקות. הוא אינו טוען לאימות זהות אישי או SSO. המפתח יוזן בידי יורם בטופס HTTPS אמיתי לאחר פריסה, ולא יחולץ מתוך n8n. אין ספק זהות או חשבון בתשלום חדש.

ההכנה אושרה ובוצעה ללא רכישה, מנוי או קריאת מודל. קיבולת השרת וניתוב TLS טרם נבדקו עבור רכיב זה. האישור שניתן הוא להכנה; פרסום והזנת סודות ייעשו רק במנגנון מאובטח. אין לאשר OAuth כללי של n8n לצורך עקיפת החסם.

בדיקות הקבלה הנדרשות אחרי ההכנה: סריקת כלי יחיד וסכימה, דחיית פעולה/חשבון/URL לא מורשים, PKCE ו־CSRF, audience/resource/scope שגויים, קוד משומש או פג תוקף, ביטול טוקן, אתחול ואחסון עמיד. אימות המפתח מול שער n8n יתבצע ללא קריאת ספק. רק לאחר חיבור הדוט תבוצע קריאת יתרה אחת ותישמר ראיית כלי ומזהה הרצה, ללא סכום יתרה בדוח ציבורי.

שחזור: הסרה או השבתה רק של שכבת האימות והחיבור החדש, בלי שינוי בשער Bearer הקיים, בתת תהליך הקריאה או בתהליכי שליחה קיימים. תצורת התוסף הקודמת והיצואים הפרטיים נשמרו. אין לאשר את OAuth הכללי לצורך עקיפת החסם.

## מקורות וראיות

ראיית הממשק: docs/evidence/20261029-textme-host-compatibility/oauth-discovery.txt ותמונת oauth-resource-mismatch.png. הנתיב הפרטי של שער TextMe הושמט. לא נשמרו סודות.

תיעוד רשמי שנקרא:
https://developers.openai.com/plugins/deploy/connect-chatgpt
https://developers.openai.com/plugins/build/plugins
https://developers.openai.com/plugins/deploy/submission#authentication-limitations
https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcptrigger
https://docs.n8n.io/connect/connect-to-n8n-mcp-server.md

שלב האבחון ותיקון התוסף לא שינו קוד ריצה בשרת. שלב ההכנה המאושר שבא אחריהם הוסיף קוד מקומי ובדיקות; הדוח הבא מתעד אותם בנפרד. קובצי הראיות המקוריים של האבחון נשמרים כהיסטוריה ואינם נכתבים מחדש. תצורת MCP של התוסף נשארת כפי שנקראה חזרה; אין עדיין חיבור OAuth פעיל לדוט.
