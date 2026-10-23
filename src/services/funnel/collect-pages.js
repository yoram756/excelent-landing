// n8n Code node "Items": validate every page before any attribution or write.
const pages = $input.all();
if (!pages.length) throw new Error('Monday returned no pages');
const items = [], ids = new Set(), cursors = new Set();
let me;
for (let i = 0; i < pages.length; i++) {
  const body = pages[i].json;
  if (body.errors?.length) throw new Error('Monday GraphQL errors: refusing partial results');
  const data = body.data;
  const page = data?.boards?.[0]?.items_page;
  if (!data?.me?.id || !Array.isArray(page?.items) || !Object.hasOwn(page, 'cursor') ||
      (page.cursor !== null && (typeof page.cursor !== 'string' || !page.cursor))) {
    throw new Error('Invalid Monday page');
  }
  if (me && me.id !== data.me.id) throw new Error('Monday identity changed between pages');
  me = data.me;
  if (i < pages.length - 1 && !page.cursor) throw new Error('Unexpected page after terminal cursor');
  if (page.cursor && cursors.has(page.cursor)) throw new Error('Repeated Monday cursor');
  if (page.cursor) cursors.add(page.cursor);
  if (i === pages.length - 1 && page.cursor) throw new Error('Monday result truncated at pagination limit');
  for (const item of page.items) {
    if (!item.id || !Array.isArray(item.column_values) || ids.has(String(item.id))) {
      throw new Error('Invalid or duplicate Monday item across pages');
    }
    ids.add(String(item.id)); items.push(item);
  }
}
return [{json:{data:{me,boards:[{items_page:{items,cursor:null}}]}}}];
