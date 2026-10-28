'use strict';

function parseMcpReply(response, expectedId) {
  if(response?.statusCode!==200)throw Error('MCP_HTTP_'+(Number.isInteger(response?.statusCode)?response.statusCode:'UNKNOWN'));
  const body=response.body;
  let messages=[];
  if(body && typeof body==='object')messages=[body];
  else if(typeof body==='string'&&body.length<=1000000){
    const text=body.trim();
    if(text.startsWith('{'))messages=[JSON.parse(text)];
    else for(const frame of text.replace(/\r\n/g,'\n').split('\n\n')){
      const data=frame.split('\n').filter(s=>s.startsWith('data:')).map(s=>s.slice(5).trimStart()).join('\n');
      if(data)messages.push(JSON.parse(data));
    }
  }
  const message=messages.find(m=>m?.id===expectedId);
  if(message?.jsonrpc!=='2.0'||message.error||!message.result||typeof message.result!=='object')throw Error('MCP_INVALID_OR_ERROR_REPLY');
  return message.result;
}

function verifyReadToolList(response) {
  const result=parseMcpReply(response,2);
  if(!Array.isArray(result.tools)||result.tools.length!==1||result.tools[0].name!=='textme_read')throw Error('MCP_UNEXPECTED_TOOL_SURFACE');
  const schema=result.tools[0].inputSchema;
  if(schema?.type!=='object'||schema.properties?.requestJson?.type!=='string'||Object.keys(schema.properties).length!==1)throw Error('MCP_UNEXPECTED_INPUT_SCHEMA');
  return {tools:['textme_read'],readOnlySurfaceVerified:true};
}

function verifyBalanceToolResult(response) {
  const result=parseMcpReply(response,3);
  if(result.isError===true||!Array.isArray(result.content))throw Error('MCP_TOOL_FAILED');
  const texts=result.content.filter(c=>c.type==='text'&&typeof c.text==='string');
  if(texts.length!==1)throw Error('MCP_UNEXPECTED_TOOL_CONTENT');
  let data=JSON.parse(texts[0].text);
  if(Array.isArray(data)&&data.length===1)data=data[0];
  if(data?.json)data=data.json;
  if(data?.provider!=='TextMe'||data.operation!=='balance'||data.httpStatus!==200||data.providerStatus!==0||data.readOnly!==true||!/^\d+(\.\d+)?$/.test(String(data.balance)))throw Error('MCP_BALANCE_PROOF_MISSING');
  return {provider:'TextMe',operation:'balance',httpStatus:200,providerStatus:0,balancePresent:true,readOnly:true,sentMessages:0};
}

function buildMcpReadProbe({endpointUrl,credentialId}) {
  const url=new URL(endpointUrl);
  if(url.origin!=='https://n8n-qhxa.srv1604140.hstgr.cloud'||!/^\/mcp(?:-test)?\/[-A-Za-z0-9]{20,100}$/.test(url.pathname)||url.search||url.hash||url.username||url.password||!/^\w{16}$/.test(credentialId||''))throw Error('VERIFIED_MCP_BINDING_REQUIRED');
  const node=(id,name,type,version,parameters,x,extra={})=>({id,name,type:'n8n-nodes-base.'+type,typeVersion:version,position:[x,0],parameters,...extra});
  const credentials={httpBearerAuth:{id:credentialId,name:'TextMe dot caller READ ONLY'}};
  const sessionHeaders="={{ JSON.stringify({Accept:'application/json, text/event-stream','MCP-Protocol-Version':$('Validate initialize').first().json.protocolVersion,...($('Validate initialize').first().json.sessionId?{'Mcp-Session-Id':$('Validate initialize').first().json.sessionId}:{})}) }}";
  const http=(id,name,payload,x,initial=false)=>node(id,name,'httpRequest',4.2,{method:'POST',url:endpointUrl,authentication:'genericCredentialType',genericAuthType:'httpBearerAuth',sendHeaders:true,specifyHeaders:'json',jsonHeaders:initial?'{"Accept":"application/json, text/event-stream"}':sessionHeaders,sendBody:true,specifyBody:'json',jsonBody:JSON.stringify(payload),options:{timeout:15000,redirect:{redirect:{followRedirects:false}},response:{response:{fullResponse:true,responseFormat:'text'}}}},x,{credentials,retryOnFail:false});
  const code=(id,name,jsCode,x)=>node(id,name,'code',2,{jsCode},x);
  const nodes=[node('manual','Manual MCP read verification','manualTrigger',1,{},0),
    http('init','MCP initialize',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'excelent-read-verification',version:'1.0.0'}}},220,true),
    code('check-init','Validate initialize',`${parseMcpReply.toString()}\nconst r=$input.first().json,result=parseMcpReply(r,1);if(typeof result.protocolVersion!=='string'||!/^\\d{4}-\\d{2}-\\d{2}$/.test(result.protocolVersion))throw Error('MCP_PROTOCOL_MISSING');const sessionId=r.headers?.['mcp-session-id']||'';if(typeof sessionId!=='string'||sessionId.length>200||/[\\r\\n]/.test(sessionId))throw Error('MCP_SESSION_INVALID');return [{json:{protocolVersion:result.protocolVersion,sessionId}}];`,440),
    http('ready','MCP initialized notification',{jsonrpc:'2.0',method:'notifications/initialized'},660),
    http('list','MCP list tools',{jsonrpc:'2.0',id:2,method:'tools/list',params:{}},880),
    code('check-list','Verify restricted tool surface',`${parseMcpReply.toString()}\n${verifyReadToolList.toString()}\nreturn [{json:verifyReadToolList($input.first().json)}];`,1100),
    http('call','MCP call balance only',{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'textme_read',arguments:{requestJson:'{"operation":"balance"}'}}},1320),
    code('proof','Minimize MCP proof',`${parseMcpReply.toString()}\n${verifyBalanceToolResult.toString()}\nreturn [{json:{executionId:String($execution.id),...verifyBalanceToolResult($input.first().json),authenticatedMcp:true,toolSurface:$('Verify restricted tool surface').first().json.tools}}];`,1540)];
  const connections={};for(let i=0;i<nodes.length-1;i++)connections[nodes[i].name]={main:[[{node:nodes[i+1].name,type:'main',index:0}]]};
  return {name:'TEST TextMe authenticated MCP READ ONLY NO SEND 20261029',active:false,nodes,connections,settings:{executionOrder:'v1',availableInMCP:false,saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false},pinData:{},tags:[]};
}
module.exports={parseMcpReply,verifyReadToolList,verifyBalanceToolResult,buildMcpReadProbe};
