# Operational API routes. Include only in the public LP1 server.
location = /api/lead {
  limit_except POST { deny all; }
  limit_req zone=leads burst=3 nodelay;
  limit_req_status 429;
  client_max_body_size 16k;
  proxy_set_header Authorization "";
  proxy_set_header Host n8n-qhxa.srv1604140.hstgr.cloud;
  proxy_set_header X-LP-Host $host;
  proxy_set_header X-LP-Client-IP $remote_addr;
  proxy_ssl_server_name on;
  proxy_pass https://n8n-qhxa.srv1604140.hstgr.cloud/webhook/lead-intake;
  proxy_read_timeout 20s;
}

location = /api/club {
  limit_except POST { deny all; }
  limit_req zone=leads burst=3 nodelay;
  limit_req_status 429;
  client_max_body_size 4k;
  proxy_set_header Authorization "";
  proxy_set_header Host n8n-qhxa.srv1604140.hstgr.cloud;
  proxy_set_header X-LP-Kind club;
  proxy_set_header X-LP-Host $host;
  proxy_set_header X-LP-Client-IP $remote_addr;
  proxy_ssl_server_name on;
  proxy_pass https://n8n-qhxa.srv1604140.hstgr.cloud/webhook/lp-signup;
  proxy_read_timeout 20s;
}

location = /api/partner {
  limit_except POST { deny all; }
  limit_req zone=leads burst=3 nodelay;
  limit_req_status 429;
  client_max_body_size 4k;
  proxy_set_header Authorization "";
  proxy_set_header Host n8n-qhxa.srv1604140.hstgr.cloud;
  proxy_set_header X-LP-Kind partner;
  proxy_set_header X-LP-Host $host;
  proxy_set_header X-LP-Client-IP $remote_addr;
  proxy_ssl_server_name on;
  proxy_pass https://n8n-qhxa.srv1604140.hstgr.cloud/webhook/lp-signup;
  proxy_read_timeout 20s;
}
