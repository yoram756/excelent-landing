'use strict';
// Deployment helper only. The generated endpoint config stays in the private
// plugin upload, not in Git. Credentials are entered through the host auth UI.
function buildPluginConnection(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['endpointUrl','verified'].includes(k)))throw Error('UNEXPECTED_CONNECTION_FIELD');
  if(input.verified!==true)throw Error('AUTHENTICATED_MCP_VERIFICATION_REQUIRED');
  const u=new URL(input.endpointUrl);
  if(u.origin!=='https://n8n-qhxa.srv1604140.hstgr.cloud'||!/^\/mcp\/[-A-Za-z0-9]{20,100}$/.test(u.pathname)||u.username||u.password||u.search||u.hash)throw Error('VERIFIED_PRODUCTION_ENDPOINT_REQUIRED');
  return {$schema:'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',mcpServers:{'excellent-textme-read':{type:'streamable-http',url:u.href,extensions:{'com.openai':{auth:{type:'api_key',headerScheme:'bearer'}}}}}};
}
// Publish only after the narrow OAuth deployment and its owner interaction pass.
// The old API-key declaration is valid packaging, but is not a hosted Dot flow.
function buildOAuthPluginConnection(input){
  const allowed=['publicBase','clientId','readOnlyToolsVerified','ownerLoginVerified'];
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k)))throw Error('UNEXPECTED_CONNECTION_FIELD');
  if(input.readOnlyToolsVerified!==true||input.ownerLoginVerified!==true)throw Error('OAUTH_DEPLOYMENT_VERIFICATION_REQUIRED');
  const u=new URL(input.publicBase);
  if(u.origin!=='https://n8n-qhxa.srv1604140.hstgr.cloud'||u.pathname!=='/textme-dot'||u.username||u.password||u.search||u.hash||!/^[A-Za-z0-9_-]{10,80}$/.test(input.clientId||''))throw Error('DEDICATED_OAUTH_BINDING_REQUIRED');
  const issuer=u.href+'/oauth';
  const auth={type:'oauth',client:{mode:'provided',clientId:input.clientId,tokenEndpointAuthMethod:'none'},authorizationUrl:issuer+'/authorize',tokenUrl:issuer+'/token',authorizationServerBase:issuer,resource:u.href+'/mcp',baseScopes:['textme:read'],defaultScopes:['textme:read']};
  return {$schema:'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',mcpServers:{'excellent-textme-read':{type:'streamable-http',url:u.href+'/mcp',extensions:{'com.openai':{auth}}}}};
}
module.exports={buildPluginConnection,buildOAuthPluginConnection};
