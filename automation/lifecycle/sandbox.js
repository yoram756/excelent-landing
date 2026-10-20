// Developer preview with synthetic contacts only; no remote provider credentials.
const {mkdirSync}=require('node:fs'),{join}=require('node:path'),{createServer}=require('node:http');
const {Store}=require('./store'),{handler}=require('./feedback-http'),campaign=require('../../config/lifecycle/refi.json');
if(process.argv[2]!=='--sandbox')throw Error('Explicit --sandbox required; this is not a production service');
const runtime=join(__dirname,'runtime');mkdirSync(runtime,{recursive:true});
const store=new Store(join(runtime,'preview.sqlite'),{sandbox:true}),now=new Date().toISOString();
const e=store.ingest({eventId:'preview-intake',campaign,now,receipt:{version:'lifecycle-consent-v1',campaignId:campaign.id,receivedAt:'2026-10-01T09:00:00.000Z',recipients:{phone:'0500000040',email:'preview@example.invalid'},grants:{whatsapp:false,email:false,sms:false}},attribution:{source:'synthetic-preview'}});
const link=store.issueFeedbackLink({enrollmentId:e.enrollmentId,now});
const server=createServer(handler(store));server.listen(0,'127.0.0.1',()=>console.log(`Synthetic local feedback preview: http://127.0.0.1:${server.address().port}/feedback/${link.token}`));
const stop=()=>server.close(()=>{store.close();process.exit(0);});process.on('SIGINT',stop);process.on('SIGTERM',stop);
