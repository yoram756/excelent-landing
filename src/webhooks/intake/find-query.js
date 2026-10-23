const K=__INTAKE__;
const v=$input.first().json;
// Phone lookup accepts one number without formatting, not alternate representations.
return [{json:{query:'query($v:[String]!){ items_page_by_column_values(limit: 10, board_id: '+K.board+', columns: [{column_id: "'+K.columns.phone+'", column_values: $v}]){ cursor items { id name created_at column_values(ids:["'+K.columns.phone+'"]){id text} } } }', variables:{v:[v.phone]}}}];
