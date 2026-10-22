# Shared settings for the LP1 refinance page. Included by every LP1 host.
# Static resources only. API routes are selected separately by each host.
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
