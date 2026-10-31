// Pure guards for an operator-triggered provider peek. No network or state writes.
// Provider text is untrusted input and never becomes code, a URL, or an instruction.
export function readObject(response) {
  if (response?.statusCode !== 200 || !response.body || typeof response.body !== 'object')
    throw Error('cosend_read_failed');
  return response.body;
}

export function safeReadId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{2,159}$/.test(value))
    throw Error('invalid_read_resource_id');
  return value;
}

export function verifyReadIdentity(response, binding) {
  const body = readObject(response), credential = body.credential;
  const allowed = new Set(['connections:read', 'messages:read', 'messages:write', 'contacts:read']);
  if (body.organization?.id !== binding.organizationId || credential?.kind !== 'connection' ||
      credential.is_live !== true || credential.connection_id !== binding.connectionId ||
      credential.connection_ids?.length !== 1 || credential.connection_ids[0] !== binding.connectionId ||
      !Array.isArray(credential.scopes) || !credential.scopes.includes('messages:read') ||
      !credential.scopes.includes('connections:read') || credential.scopes.some(scope => !allowed.has(scope)))
    throw Error('read_identity_or_scope_mismatch');
  return {organizationId: binding.organizationId, connectionId: binding.connectionId,
    grantedScopes: [...credential.scopes], identityVerified: true};
}

export function verifyReadNumber(response, binding, expectedPhone) {
  const body = readObject(response);
  const phone = String(body.phone_e164 || '').replace(/\D/g, '');
  if (body.id !== binding.connectionId || phone !== expectedPhone.replace(/\D/g, '') ||
      body.phone_number_id !== binding.phoneNumberId || body.meta_waba_id !== binding.wabaId ||
      body.status !== 'active' || body.mode !== 'coexistence' || body.delivery_mode !== 'stored')
    throw Error('read_number_binding_mismatch');
  return {connectionId: body.id, numberVerified: true};
}

export function captureUnreadState(response, binding) {
  const body = readObject(response);
  if (!Array.isArray(body.data) || body.data.length !== 1) throw Error('one_unread_conversation_required');
  const conversation = body.data[0];
  if (conversation.connection_id !== binding.connectionId || !Number.isInteger(conversation.unread_count) ||
      conversation.unread_count <= 0 || !Number.isInteger(conversation.message_count) ||
      !Object.hasOwn(conversation, 'last_read_at') ||
      !(conversation.last_read_at === null || typeof conversation.last_read_at === 'string') ||
      !['bot', 'pending_human', 'human', 'app'].includes(conversation.control) ||
      !['open', 'pending', 'snoozed', 'resolved'].includes(conversation.state) ||
      !Object.hasOwn(conversation, 'assignee_id') ||
      !(conversation.assignee_id === null || typeof conversation.assignee_id === 'string') ||
      typeof conversation.last_message_at !== 'string')
    throw Error('unread_state_unverifiable');
  safeReadId(conversation.id);
  safeReadId(conversation.contact_id);
  return {conversationId: conversation.id, contactId: conversation.contact_id, connectionId: binding.connectionId,
    unreadBefore: conversation.unread_count, lastReadAtBefore: conversation.last_read_at,
    lastMessageAtBefore: conversation.last_message_at, messageCountBefore: conversation.message_count,
    controlBefore: conversation.control, stateBefore: conversation.state, assigneeBefore: conversation.assignee_id};
}

export function captureReadMessage(response, before, binding) {
  const body = readObject(response);
  if (!Array.isArray(body.data) || body.data.length !== 1) throw Error('one_inbound_message_required');
  const message = body.data[0];
  if (!message || before.connectionId !== binding.connectionId || message.connection_id !== binding.connectionId ||
      message.conversation_id !== before.conversationId || message.contact_id !== before.contactId ||
      message.type !== 'text' || message.direction !== 'inbound') throw Error('message_binding_or_type_mismatch');
  safeReadId(message.id);
  // Inspect one body in memory, then discard it. Never return names, phones or text.
  const content = message.content;
  const text = typeof content?.text === 'string' ? content.text :
    typeof content?.text?.body === 'string' ? content.text.body : content?.body;
  if (typeof text !== 'string' || !text.trim()) throw Error('text_body_unavailable');
  return {...before, messageId: message.id,
    bodyRead: true, contentCharacters: [...text].length, direction: message.direction};
}

export function captureOneUnread(response, binding) {
  const before = captureUnreadState(response, binding);
  // Also supports an explicitly expanded provider response; never requires it.
  return captureReadMessage({statusCode: 200, body: {data: [response.body.data[0].last_message]}}, before, binding);
}

export function confirmReadUnchanged(response, before, binding) {
  const after = readObject(response);
  if (after.connection_id !== binding.connectionId || after.id !== before.conversationId ||
      !Object.hasOwn(after, 'last_read_at') || after.unread_count !== before.unreadBefore ||
      after.last_read_at !== before.lastReadAtBefore || after.message_count !== before.messageCountBefore ||
      after.last_message_at !== before.lastMessageAtBefore ||
      (after.last_message != null && after.last_message.id !== before.messageId) || after.control !== before.controlBefore ||
      after.state !== before.stateBefore || after.assignee_id !== before.assigneeBefore)
    throw Error('read_state_changed_or_concurrent_activity');
  return {mode: 'MANUAL_READ_ONLY_NO_SEND', status: 'PASS', connectionId: binding.connectionId,
    conversationId: before.conversationId, messageId: before.messageId, uniqueMessagesRead: 1,
    bodyRead: true, contentCharacters: before.contentCharacters, direction: before.direction,
    unreadBefore: before.unreadBefore, unreadAfter: after.unread_count,
    lastReadAtBefore: before.lastReadAtBefore, lastReadAtAfter: after.last_read_at,
    readMarkerUnchanged: true, conversationControlUnchanged: true,
    providerMethods: ['GET'], whatsappSends: 0, replyGenerated: false, activated: false};
}
