(function(){
'use strict';
var f=document.getElementById('partnerForm');if(!f)return;
function track(n){window.dataLayer=window.dataLayer||[];window.dataLayer.push({event:n,lp:'refi_lp1'});}
function mobile(v){v=String(v||'').trim().replace(/[\s()\-]/g,'');if(/^05\d{8}$/.test(v))return '972'+v.slice(1);if(/^\+?9725\d{8}$/.test(v))return v.replace(/^\+/,'');return null;}
function key(){return window.crypto&&crypto.randomUUID?crypto.randomUUID():'k'+Date.now().toString(36)+Math.random().toString(36).slice(2,10);}
function err(id,input,msg){var el=document.getElementById(id);el.textContent=msg||'';if(input){if(msg)input.setAttribute('aria-invalid','true');else input.removeAttribute('aria-invalid');}return !msg;}
var k=key(),done=false,retry=false;
var $=function(id){return document.getElementById(id);};
var nm=$('pName'),ph=$('pPhone'),fd=$('pField'),ar=$('pArea'),tp=$('pType'),em=$('pEmail'),cs=$('pConsent'),hp=$('pWeb'),bt=$('pSubmit'),ss=$('pStatus');
f.addEventListener('input',function(){if(retry&&!done){k=key();retry=false;}});
f.addEventListener('submit',async function(ev){ev.preventDefault();if(done||bt.disabled)return;
  var name=nm.value.trim().replace(/\s+/g,' '),len=Array.from(name).length,m=mobile(ph.value),mail=em.value.trim(),ok=true;
  ok=err('pNameErr',nm,len<2||len>60?'יש להזין שם, 2 עד 60 תווים.':'')&&ok;
  ok=err('pPhoneErr',ph,m?'':'יש להזין מספר נייד ישראלי.')&&ok;
  ok=err('pFieldErr',fd,fd.value?'':'יש לבחור תחום.')&&ok;
  ok=err('pEmailErr',em,mail&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)?'כתובת הדוא״ל לא תקינה.':'')&&ok;
  ok=err('pConsentErr',null,cs.checked?'':'כדי שנחזור אליכם, סמנו את הבקשה.')&&ok;
  if(!ok){ss.dataset.state='error';ss.textContent='יש לתקן את השדות שסומנו.';return;}
  bt.disabled=true;ss.removeAttribute('data-state');ss.textContent='שולחים…';
  try{
    var r=await fetch('/api/partner',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'partner',idempotency_key:k,full_name:name,phone:m,field:fd.value,area:ar.value,coop:tp.value,email:mail,consent:true,consent_at:new Date().toISOString(),website:hp.value})});
    var j=null;try{j=await r.json();}catch(e){}
    if(!r.ok||!j||!(j.request_id||j.id))throw new Error('fail');
    done=true;ss.dataset.state='success';ss.textContent='הבקשה נקלטה. יורם יחזור אליכם לשיחת היכרות.';bt.textContent='הבקשה נשלחה';f.querySelectorAll('input,select').forEach(function(i){i.disabled=true;});track('partner_submit_ok');
  }catch(e){retry=true;ss.dataset.state='error';ss.textContent='הבקשה לא נשמרה. נסו שוב בעוד רגע, או התקשרו ל 055-2783459.';bt.disabled=false;track('partner_submit_fail');}
});
})();
