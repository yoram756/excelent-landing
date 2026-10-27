# Generated. Include only in the public refinance server alongside lp1-site.inc and lp1-api.inc.
location = / {
  root /site/refi-cro;
  try_files /index.html =404;
  add_header Cache-Control "no-cache" always;
  add_header X-Robots-Tag "noindex, nofollow" always;
  add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; media-src 'self' https:; script-src 'self' 'sha256-5/HvUkmX2w7EcZKfznpjdo6q2wVrTkf8Q8EeP/JRyrA='; style-src 'self' 'sha256-aO1RxsUVvvjNCrsxGsBF+/rOWZtbb9LrGmCvtVCTs7w='; style-src-attr 'unsafe-hashes' 'sha256-8ilcya6PJ2mDcuNFfcZaaOL85o/T7b8cPlsalzaJVOs='; font-src 'self'; connect-src 'self'; upgrade-insecure-requests" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header Strict-Transport-Security "max-age=31536000" always;
}

location = /index.html {
  root /site/refi-cro;
  try_files /index.html =404;
  add_header Cache-Control "no-cache" always;
  add_header X-Robots-Tag "noindex, nofollow" always;
  add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; media-src 'self' https:; script-src 'self' 'sha256-5/HvUkmX2w7EcZKfznpjdo6q2wVrTkf8Q8EeP/JRyrA='; style-src 'self' 'sha256-aO1RxsUVvvjNCrsxGsBF+/rOWZtbb9LrGmCvtVCTs7w='; style-src-attr 'unsafe-hashes' 'sha256-8ilcya6PJ2mDcuNFfcZaaOL85o/T7b8cPlsalzaJVOs='; font-src 'self'; connect-src 'self'; upgrade-insecure-requests" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header Strict-Transport-Security "max-age=31536000" always;
}

location = /thank-you {
  root /site/refi-cro;
  try_files /thank-you/index.html =404;
  add_header Cache-Control "no-cache" always;
  add_header X-Robots-Tag "noindex, nofollow" always;
  add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; media-src 'self' https:; script-src 'self' 'sha256-5/HvUkmX2w7EcZKfznpjdo6q2wVrTkf8Q8EeP/JRyrA='; style-src 'self' 'sha256-aO1RxsUVvvjNCrsxGsBF+/rOWZtbb9LrGmCvtVCTs7w='; style-src-attr 'unsafe-hashes' 'sha256-8ilcya6PJ2mDcuNFfcZaaOL85o/T7b8cPlsalzaJVOs='; font-src 'self'; connect-src 'self'; upgrade-insecure-requests" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header Strict-Transport-Security "max-age=31536000" always;
}

location = /thank-you/ {
  root /site/refi-cro;
  try_files /thank-you/index.html =404;
  add_header Cache-Control "no-cache" always;
  add_header X-Robots-Tag "noindex, nofollow" always;
  add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; media-src 'self' https:; script-src 'self' 'sha256-5/HvUkmX2w7EcZKfznpjdo6q2wVrTkf8Q8EeP/JRyrA='; style-src 'self' 'sha256-aO1RxsUVvvjNCrsxGsBF+/rOWZtbb9LrGmCvtVCTs7w='; style-src-attr 'unsafe-hashes' 'sha256-8ilcya6PJ2mDcuNFfcZaaOL85o/T7b8cPlsalzaJVOs='; font-src 'self'; connect-src 'self'; upgrade-insecure-requests" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header Strict-Transport-Security "max-age=31536000" always;
}

location = /analytics-config.json {
  root /site/refi-cro;
  try_files /analytics-config.json =404;
  add_header Cache-Control "no-cache" always;
  add_header X-Robots-Tag "noindex, nofollow" always;
  add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; media-src 'self' https:; script-src 'self' 'sha256-5/HvUkmX2w7EcZKfznpjdo6q2wVrTkf8Q8EeP/JRyrA='; style-src 'self' 'sha256-aO1RxsUVvvjNCrsxGsBF+/rOWZtbb9LrGmCvtVCTs7w='; style-src-attr 'unsafe-hashes' 'sha256-8ilcya6PJ2mDcuNFfcZaaOL85o/T7b8cPlsalzaJVOs='; font-src 'self'; connect-src 'self'; upgrade-insecure-requests" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header Strict-Transport-Security "max-age=31536000" always;
}

location /cro-assets/ {
  root /site/refi-cro;
  try_files $uri =404;
  add_header Cache-Control "public, max-age=604800" always;
  add_header X-Content-Type-Options "nosniff" always;
}
