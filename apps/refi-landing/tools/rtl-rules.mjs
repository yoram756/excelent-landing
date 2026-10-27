export const forbiddenClasses = /(?:^|\s|:)(?:-?(?:m[rl]|p[rl]|left|right)-|text-(?:left|right)\b|border-[lr](?:-|\b)|rounded-[lr](?:-|\b)|(?:mx|px|inset-x)-|tracking-(?:wide|wider|widest)|tracking-\[(?!0\])[^\]]+\])/;

export const logicalClasses = {
  meta: { type: 'problem', schema: [], messages: { physical: 'Use logical horizontal classes and avoid positive Hebrew tracking.' } },
  create(context) {
    return {
      Literal(node) { if (typeof node.value === 'string' && forbiddenClasses.test(node.value)) context.report({ node, messageId: 'physical' }); },
      TemplateElement(node) { if (forbiddenClasses.test(node.value.cooked || '')) context.report({ node, messageId: 'physical' }); },
    };
  },
};

export const isolateText = {
  meta: { type: 'problem', schema: [], messages: { isolate: 'Wrap visible numbers, prices and English text in Bidi, bdi or span dir="ltr".' } },
  create(context) {
    return { JSXText(node) {
      if (!/[A-Za-z\d₪]/.test(node.value)) return;
      for (let p = node.parent; p; p = p.parent) {
        if (p.type !== 'JSXElement') continue;
        const opening = p.openingElement;
        if (['Bidi', 'bdi', 'script', 'style'].includes(opening.name.name)) return;
        if (opening.attributes.some(a => a.type === 'JSXAttribute' && a.name.name === 'dir' && a.value?.value === 'ltr')) return;
      }
      context.report({ node, messageId: 'isolate' });
    } };
  },
};
