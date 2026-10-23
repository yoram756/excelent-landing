// Omni-channel decision for one lead. Pure: no transport. Order, providers and the opt-out label come from CFG.channels.
// 1. A global opt-out stops every channel. 2. A failed channel is never retried here.
// 3. A channel is used only with explicit consent (grants[channel] === true) and a configured provider.
const nextChannel = ({ status, failed = [], grants = {} }, cfg) => {
  const ch = cfg.channels;
  if (status === ch.optOut.label) return { action: 'STOP', reason: 'global_optout' };
  const noProvider = [];
  for (const c of ch.cascade) {
    if (failed.includes(c) || grants[c] !== true) continue;
    if (!ch.providers[c]) { noProvider.push(c); continue; }
    return { action: 'SEND', channel: c };
  }
  if (noProvider.length) return { action: 'BLOCKED', reason: 'no_provider', channels: noProvider };
  return { action: 'STOP', reason: 'no_channel_left' };
};

// This file as an expression the build injects into plan.js; n8n Code nodes cannot require repo files.
const inlineSource = () => '(()=>{const module={exports:{}};\n' + require('fs').readFileSync(__filename, 'utf8').replace(/\r\n/g, '\n') + '\nreturn module.exports;})()';

module.exports = { nextChannel, inlineSource };
