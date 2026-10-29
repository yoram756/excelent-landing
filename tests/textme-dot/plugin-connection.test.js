const {test}=require('node:test'),assert=require('node:assert/strict');
const {buildPluginConnection}=require('../../src/integrations/textme-dot/plugin-connection');
const fixture={endpointUrl:'https://n8n-qhxa.srv1604140.hstgr.cloud/mcp/fixture-not-deployed-0001',verified:true};
test('plugin connection declares separate secure bearer entry without credential values',()=>{const m=buildPluginConnection(fixture),server=m.mcpServers['excellent-textme-read'];assert.equal(server.type,'streamable-http');assert.deepEqual(server.extensions['com.openai'].auth,{type:'api_key',headerScheme:'bearer'});assert.equal(server.headers,undefined);assert.equal(server.env,undefined);});
test('unverified, test, foreign, query and credential-bearing configs fail closed',()=>{for(const input of [{...fixture,verified:false},{...fixture,token:'forbidden'},{...fixture,headers:{}},{...fixture,endpointUrl:fixture.endpointUrl.replace('/mcp/','/mcp-test/')},{...fixture,endpointUrl:fixture.endpointUrl.replace('n8n-qhxa.srv1604140.hstgr.cloud','other.invalid')},{...fixture,endpointUrl:fixture.endpointUrl+'?key=forbidden'},{...fixture,endpointUrl:fixture.endpointUrl+'#fragment'}])assert.throws(()=>buildPluginConnection(input));});
test('hosted Dot OAuth settings require verified narrow resource and owner flow',()=>{
 const {buildOAuthPluginConnection}=require('../../src/integrations/textme-dot/plugin-connection');
 const good={publicBase:'https://n8n-qhxa.srv1604140.hstgr.cloud/textme-dot',clientId:'excelent-textme-dot',readOnlyToolsVerified:true,ownerLoginVerified:true};
 const auth=buildOAuthPluginConnection(good).mcpServers['excellent-textme-read'].extensions['com.openai'].auth;
 assert.equal(auth.type,'oauth');assert.deepEqual(auth.baseScopes,['textme:read']);assert.equal(auth.client.tokenEndpointAuthMethod,'none');assert.equal(auth.resource,good.publicBase+'/mcp');
 for(const bad of [{...good,ownerLoginVerified:false},{...good,readOnlyToolsVerified:false},{...good,publicBase:'https://n8n-qhxa.srv1604140.hstgr.cloud/mcp-server/http'},{...good,publicBase:good.publicBase+'?token=anything'},{...good,token:'forbidden'},{...good,headers:{Authorization:'forbidden'}}])assert.throws(()=>buildOAuthPluginConnection(bad));
});
