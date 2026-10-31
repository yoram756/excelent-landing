import {readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import binding from '../config/provider.json' with {type: 'json'};
import business from '../../../../config/business.json' with {type: 'json'};

const guards = readFileSync(new URL('../src/read-one.mjs', import.meta.url), 'utf8').replaceAll('export ', '');
const expectedPhone = business.phones[business.whatsapp.senderPhone].e164;
const prefix = guards + '\nconst binding=' + JSON.stringify(binding) + ';\n';

export function makeReadOneWorker(existing, credential) {
  if (!existing?.id || existing.active !== false || existing.activeVersionId)
    throw Error('existing_inactive_unpublished_worker_required');
  const manual = existing.nodes.filter(node => node.type === 'n8n-nodes-base.manualTrigger');
  if (manual.length !== 1 || !/^[A-Za-z0-9_-]{8,80}$/.test(credential?.id || '') || !credential.name)
    throw Error('existing_manual_worker_and_credential_reference_required');
  const trigger = {...manual[0], name: 'Manual read one only', position: [0, 0]};
  const http = (id, name, url, x) => ({id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    position: [x, 0], parameters: {method: 'GET', url, authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth', options: {timeout: 15000,
        redirect: {redirect: {followRedirects: false}},
        response: {response: {fullResponse: true, neverError: true, responseFormat: 'json'}}}},
    credentials: {httpHeaderAuth: {...credential}}});
  const code = (id, name, tail, x) => ({id, name, type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [x, 0], parameters: {jsCode: prefix + tail}});
  const nodes = [trigger,
    http('read-identity', 'Read fixed identity', binding.apiBaseUrl + '/v1/me', 220),
    code('guard-identity', 'Guard read identity', 'return [{json:verifyReadIdentity($json,binding)}];', 440),
    http('read-number', 'Read fixed number', binding.apiBaseUrl + '/v1/connections/' + binding.connectionId, 660),
    code('guard-number', 'Guard read number', 'return [{json:verifyReadNumber($json,binding,' + JSON.stringify(expectedPhone) + ')}];', 880),
    http('peek-unread', 'Peek one unread conversation', binding.apiBaseUrl + '/v1/conversations?connection_id=' + binding.connectionId + '&limit=1&unread=true&order=recent', 1100),
    code('capture-one', 'Capture one message metadata', 'return [{json:captureOneUnread($json,binding)}];', 1320),
    http('read-state-after', 'Read same conversation state', '={{ ' + JSON.stringify(binding.apiBaseUrl + '/v1/conversations/') + ' + $json.conversationId }}', 1540),
    code('confirm-unread', 'Confirm read without marking', "return [{json:{...confirmReadUnchanged($json,$('Capture one message metadata').first().json,binding),verifiedAt:new Date().toISOString()}}];", 1760),
  ];
  // Keep the old simulation node as disabled historical context, disconnected.
  const retained = existing.nodes.filter(node => node.id !== trigger.id).map(node =>
    node.type === 'n8n-nodes-base.stickyNote' ? {...node, position: [0, -320], parameters: {...node.parameters,
      content: '## MANUAL READ ONLY\nOne message body in memory; no read marker, reply, model, lock, CRM or provider write.\nNo schedule or webhook. Keep unpublished. Raw execution storage is disabled.'}} :
      {...node, disabled: true, position: [220, 380]});
  const connections = {};
  for (let i = 0; i < nodes.length - 1; i++) connections[nodes[i].name] = {main: [[{node: nodes[i+1].name, type: 'main', index: 0}]]};
  return {...existing, active: false, activeVersionId: null, nodes: [...nodes, ...retained], connections,
    settings: {...existing.settings, executionOrder: 'v1', timezone: 'Asia/Jerusalem', availableInMCP: false,
      saveDataSuccessExecution: 'none', saveDataErrorExecution: 'none', saveManualExecutions: false,
      saveExecutionProgress: false}};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output, credentialId, credentialName] = process.argv.slice(2);
  if (!input || !output) throw Error('existing_export_and_output_paths_required');
  const parsed = JSON.parse(readFileSync(input, 'utf8'));
  if (Array.isArray(parsed) && parsed.length !== 1) throw Error('one_existing_worker_required');
  const existing = Array.isArray(parsed) ? parsed[0] : parsed;
  const candidate = makeReadOneWorker(existing, {id: credentialId, name: credentialName});
  writeFileSync(output, JSON.stringify([candidate], null, 2));
  console.log(JSON.stringify({id: candidate.id, active: candidate.active, nodes: candidate.nodes.length,
    providerRequests: candidate.nodes.filter(node => !node.disabled && node.type.endsWith('httpRequest')).length,
    mode: 'MANUAL_READ_ONLY_NO_SEND', rawExecutionStorage: false}));
}
