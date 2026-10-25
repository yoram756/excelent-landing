// n8n Code node "Mark opt-out" (mode: run once for all items). Source of truth: this file.
// Input: the Monday items found for the replying phone. Output: one update per item, status = the global opt-out label.
const CFG = __CONFIG__;
const items = $input.first().json?.data?.items_page_by_column_values?.items || [];
return items.map(it => ({ json: { itemId: it.id, colsJson: JSON.stringify({ [CFG.columns.status]: { label: CFG.channels.optOut.label } }) } }));
