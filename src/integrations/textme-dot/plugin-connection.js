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
module.exports={buildPluginConnection};
