# Shared settings for the LP1 refinance page. Included by every LP1 host.
# Each server block sets its own root (public: /site/lp1, staging: /site/lp1v2).
index index.html;
server_tokens off;
charset utf-8;

gzip on;
gzip_comp_level 6;
gzip_min_length 512;
gzip_types text/css application/javascript application/json image/svg+xml text/plain;

location = /robots.txt { return 200 "User-agent: *\nDisallow: /\n"; }

location / {
  try_files $uri $uri.html $uri/ =404;
  add_header Cache-Control "no-cache" always;
  add_header X-Robots-Tag "noindex, nofollow" always;
  add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; script-src 'self' 'sha256-SSsJIt/xYR9R6SDV6PV91QazVnI8wfnMBKTicov2jX8=' 'sha256-ivdP+3yVlGdO6qYoG2VIK8RVnhzwcrwKeVcrHUpi9tA='; style-src 'self' https://fonts.googleapis.com 'sha256-JyGYajSTs1xUIzLjIHTxlyZubfNUwyk8p4hyXqlytsc=' 'sha256-uKf9HzdNrPSQ2pkOXiRxreJRgZdzRBhzxOexLn0DBfk='; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; upgrade-insecure-requests" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header Strict-Transport-Security "max-age=31536000" always;
}

location /assets/ {
  add_header Cache-Control "public, max-age=604800" always;
  add_header X-Content-Type-Options "nosniff" always;
}

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
