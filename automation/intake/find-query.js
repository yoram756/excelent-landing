const v=$input.first().json;
// Phone lookup accepts one number without formatting, not alternate representations.
return [{json:{query:'query($v:[String]!){ items_page_by_column_values(limit: 10, board_id: 5106246268, columns: [{column_id: "refi_phone", column_values: $v}]){ cursor items { id name created_at column_values(ids:["refi_phone"]){id text} } } }', variables:{v:[v.phone]}}}];
