// Read-only Monday adapter. No GraphQL mutation or client-supplied URL is accepted.
function mondayReader({token,apiVersion,boardId,columnIds,transport=fetch}){
  if(!token||/[\r\n]/.test(token)||!/^202\d-(01|04|07|10)$/.test(apiVersion)||!/^\d+$/.test(String(boardId))||!columnIds.length)throw Error('Invalid Monday read configuration');
  const fields='id name state created_at board{id} column_values(ids:$columns){id text value}';
  async function query(query,variables){
    let r,b;try{r=await transport('https://api.monday.com/v2',{method:'POST',redirect:'error',headers:{'content-type':'application/json',Authorization:token,'API-Version':apiVersion},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(15000)});b=await r.json();}catch{throw Error('monday_read_unavailable');}
    if(r.status!==200||b?.errors?.length||!b?.data)throw Error('monday_read_rejected');
    return b.data;
  }
  return {
    async list(){
      const items=[],seen=new Set();let cursor=null;
      for(let page=0;page<20;page++){
        const d=await query('query($boards:[ID!],$columns:[String!],$cursor:String){boards(ids:$boards){id items_page(limit:500,cursor:$cursor){cursor items{'+fields+'}}}}',{boards:[String(boardId)],columns:columnIds,cursor});
        if(d.boards?.length!==1||String(d.boards[0].id)!==String(boardId)||!Array.isArray(d.boards[0].items_page?.items))throw Error('monday_incomplete_board');
        const p=d.boards[0].items_page;items.push(...p.items);if(!p.cursor)return items;
        if(typeof p.cursor!=='string'||seen.has(p.cursor))throw Error('monday_invalid_cursor');seen.add(p.cursor);cursor=p.cursor;
      }
      throw Error('monday_page_limit');
    },
    async read(id){
      if(!/^\d+$/.test(String(id)))throw Error('Invalid item identifier');
      const d=await query('query($ids:[ID!],$columns:[String!]){items(ids:$ids,exclude_nonactive:false){'+fields+'}}',{ids:[String(id)],columns:columnIds});
      if(!Array.isArray(d.items)||d.items.length!==1)throw Error('monday_item_missing');return d.items[0];
    }
  };
}
module.exports={mondayReader};
