// One independent Crypto-node token per candidate. Keep the downstream planner
// running for existing leads even when no new lead needs a token.
const CFG=__CONFIG__;
const items=$('Items').first().json.data.boards[0].items_page.items;
const candidates=items.filter(it=>!(it.column_values.find(c=>c.id===CFG.columns.status)||{}).text);
return candidates.length?candidates.map(it=>({json:{itemId:String(it.id)}})):[{json:{itemId:''}}];
