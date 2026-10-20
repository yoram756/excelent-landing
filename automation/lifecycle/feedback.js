// Voluntary feedback is separate from consent and never re-enrolls a contact.
const questions=[
 {id:'reason',label:'מה הסיבה העיקרית שבחרת לא להמשיך איתנו?',options:['תזמון לא מתאים','מחיר או תנאי השירות','לא הבנתי מספיק את הערך','לא קיבלתי מענה בזמן','החוויה או ההתאמה האישית','בחרתי ספק אחר','הנושא כבר אינו רלוונטי','סיבה אחרת','מעדיף לא לציין']},
 {id:'other_provider',label:'האם בחרת לקבל שירות מגורם אחר?',options:['כן','עדיין בודק אפשרויות','לא','מעדיף לא לציין']},
 {id:'missing',label:'מה היה חסר כדי שתוכל להחליט בנוחות?',type:'text'},
 {id:'improve',label:'מה היית מציע לנו לשפר?',type:'text'},
 {id:'experience',label:'איך היית מדרג את החוויה איתנו?',options:['1','2','3','4','5','מעדיף לא לציין']}
];
function validate(answers){
 if(!answers||typeof answers!=='object'||Array.isArray(answers))throw Error('Invalid feedback');
 const cleaned={};
 for(const [id,value]of Object.entries(answers)){
  const q=questions.find(q=>q.id===id);if(!q||typeof value!=='string')throw Error('Unknown feedback answer');
  const text=value.trim();if(!text)continue;
  if(text.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)||q.options&&!q.options.includes(text))throw Error('Invalid feedback answer');
  cleaned[id]=text;
 }
 return {version:'exit-feedback-v1',answers:cleaned,marketingConsentGranted:false,reEnrollmentAllowed:false,stopCommercialFollowup:cleaned.other_provider==='כן'||cleaned.reason==='בחרתי ספק אחר',reasonWasVoluntary:!!cleaned.reason};
}
module.exports={questions,validate};
