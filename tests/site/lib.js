// Browser helper for the landing page tests. Fonts are served locally so tests run offline.
const {chromium}=require('playwright');
const fs=require('fs');const path=require('path');
const F=path.dirname(require.resolve('@fontsource/assistant/package.json'))+'/files/';
async function open(width,height,bypass){
  const exe=process.env.PW_CHROMIUM||(fs.existsSync('/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell')?'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell':undefined);
  const b=await chromium.launch(exe?{executablePath:exe}:{});
  const c=await b.newContext({viewport:{width,height},deviceScaleFactor:1,locale:'he-IL',bypassCSP:!!bypass});
  await c.route('https://fonts.googleapis.com/**',r=>{let css='';for(const w of [400,600,800])for(const s of ['hebrew','latin'])css+=`@font-face{font-family:Assistant;font-weight:${w};font-display:swap;src:url(https://fonts.gstatic.com/${s}-${w}.woff2) format('woff2');}`;r.fulfill({contentType:'text/css',body:css});});
  await c.route('https://fonts.gstatic.com/**',r=>{const m=r.request().url().match(/(hebrew|latin)-(\d+)/);r.fulfill({contentType:'font/woff2',body:fs.readFileSync(F+`assistant-${m[1]}-${m[2]}-normal.woff2`)});});
  const p=await c.newPage();p.setDefaultTimeout(6000);const errs=[];p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});p.on('pageerror',e=>errs.push(String(e)));
  return {b,c,p,errs};
}
module.exports={open};
