# Generated. Include only in the public refinance server alongside lp1-site.inc and lp1-api.inc.
location = / {
  root /site/refi-cro;
  if ($arg_utm_campaign = campaign_bundle_allinone) { return 302 /campaigns/bundle-allinone$is_args$args; }
  if ($arg_utm_campaign = campaign_buyers_south) { return 302 /campaigns/buyers-south$is_args$args; }
  if ($arg_utm_campaign = campaign_sellers_south) { return 302 /campaigns/sellers-south$is_args$args; }
  try_files /index.html =404;
  add_header Cache-Control "no-cache" always;
  add_header X-Robots-Tag "noindex, nofollow" always;
  add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; media-src 'self' https:; script-src 'self' 'sha256-5/HvUkmX2w7EcZKfznpjdo6q2wVrTkf8Q8EeP/JRyrA=' 'sha256-Doq7w+F7VxnfHhKy/KUEzJyxSz9Yv1OX7WTlbjL6ukI=' 'sha256-yLsg9HaQoFBIg5fjoa20EuZ8wbZK6JV31Fr8T+iJ9as=' 'sha256-hifkf8qkPcYNTOmMoNcVab/gJz0LS+DYVm5EEBhJP2s='; style-src 'self' 'sha256-D9goJuz7kesk+wC5zNxSp82jhKDK7SzL4jagkrJP1Eo='; style-src-attr 'unsafe-hashes' 'sha256-8ilcya6PJ2mDcuNFfcZaaOL85o/T7b8cPlsalzaJVOs='; font-src 'self'; connect-src 'self' https://eu.i.posthog.com; upgrade-insecure-requests" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header Strict-Transport-Security "max-age=31536000" always;
}

location = /index.html {
  root /site/refi-cro;
  if ($arg_utm_campaign = campaign_bundle_allinone) { return 302 /campaigns/bundle-allinone$is_args$args; }
  if ($arg_utm_campaign = campaign_buyers_south) { return 302 /campaigns/buyers-south$is_args$args; }
  if ($arg_utm_campaign = campaign_sellers_south) { return 302 /campaigns/sellers-south$is_args$args; }
  try_files /index.html =404;
  add_header Cache-Control "no-cache" always;
  add_header X-Robots-Tag "noindex, nofollow" always;
  add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; media-src 'self' https:; script-src 'self' 'sha256-5/HvUkmX2w7EcZKfznpjdo6q2wVrTkf8Q8EeP/JRyrA=' 'sha256-Doq7w+F7VxnfHhKy/KUEzJyxSz9Yv1OX7WTlbjL6ukI=' 'sha256-yLsg9HaQoFBIg5fjoa20EuZ8wbZK6JV31Fr8T+iJ9as=' 'sha256-hifkf8qkPcYNTOmMoNcVab/gJz0LS+DYVm5EEBhJP2s='; style-src 'self' 'sha256-D9goJuz7kesk+wC5zNxSp82jhKDK7SzL4jagkrJP1Eo='; style-src-attr 'unsafe-hashes' 'sha256-8ilcya6PJ2mDcuNFfcZaaOL85o/T7b8cPlsalzaJVOs='; font-src 'self'; connect-src 'self' https://eu.i.posthog.com; upgrade-insecure-requests" always;
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
  add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; media-src 'self' https:; script-src 'self' 'sha256-5/HvUkmX2w7EcZKfznpjdo6q2wVrTkf8Q8EeP/JRyrA=' 'sha256-Doq7w+F7VxnfHhKy/KUEzJyxSz9Yv1OX7WTlbjL6ukI=' 'sha256-yLsg9HaQoFBIg5fjoa20EuZ8wbZK6JV31Fr8T+iJ9as=' 'sha256-hifkf8qkPcYNTOmMoNcVab/gJz0LS+DYVm5EEBhJP2s='; style-src 'self' 'sha256-D9goJuz7kesk+wC5zNxSp82jhKDK7SzL4jagkrJP1Eo='; style-src-attr 'unsafe-hashes' 'sha256-8ilcya6PJ2mDcuNFfcZaaOL85o/T7b8cPlsalzaJVOs='; font-src 'self'; connect-src 'self' https://eu.i.posthog.com; upgrade-insecure-requests" always;
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
  add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; media-src 'self' https:; script-src 'self' 'sha256-5/HvUkmX2w7EcZKfznpjdo6q2wVrTkf8Q8EeP/JRyrA=' 'sha256-Doq7w+F7VxnfHhKy/KUEzJyxSz9Yv1OX7WTlbjL6ukI=' 'sha256-yLsg9HaQoFBIg5fjoa20EuZ8wbZK6JV31Fr8T+iJ9as=' 'sha256-hifkf8qkPcYNTOmMoNcVab/gJz0LS+DYVm5EEBhJP2s='; style-src 'self' 'sha256-D9goJuz7kesk+wC5zNxSp82jhKDK7SzL4jagkrJP1Eo='; style-src-attr 'unsafe-hashes' 'sha256-8ilcya6PJ2mDcuNFfcZaaOL85o/T7b8cPlsalzaJVOs='; font-src 'self'; connect-src 'self' https://eu.i.posthog.com; upgrade-insecure-requests" always;
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
  add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; media-src 'self' https:; script-src 'self' 'sha256-5/HvUkmX2w7EcZKfznpjdo6q2wVrTkf8Q8EeP/JRyrA=' 'sha256-Doq7w+F7VxnfHhKy/KUEzJyxSz9Yv1OX7WTlbjL6ukI=' 'sha256-yLsg9HaQoFBIg5fjoa20EuZ8wbZK6JV31Fr8T+iJ9as=' 'sha256-hifkf8qkPcYNTOmMoNcVab/gJz0LS+DYVm5EEBhJP2s='; style-src 'self' 'sha256-D9goJuz7kesk+wC5zNxSp82jhKDK7SzL4jagkrJP1Eo='; style-src-attr 'unsafe-hashes' 'sha256-8ilcya6PJ2mDcuNFfcZaaOL85o/T7b8cPlsalzaJVOs='; font-src 'self'; connect-src 'self' https://eu.i.posthog.com; upgrade-insecure-requests" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header Strict-Transport-Security "max-age=31536000" always;
}

location = /campaigns/bundle-allinone {
  root /site/refi-cro;
  try_files /campaigns/bundle-allinone/index.html =404;
  add_header Cache-Control "no-cache" always;
  add_header X-Robots-Tag "noindex, nofollow" always;
  add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; media-src 'self' https:; script-src 'self' 'sha256-5/HvUkmX2w7EcZKfznpjdo6q2wVrTkf8Q8EeP/JRyrA=' 'sha256-Doq7w+F7VxnfHhKy/KUEzJyxSz9Yv1OX7WTlbjL6ukI=' 'sha256-yLsg9HaQoFBIg5fjoa20EuZ8wbZK6JV31Fr8T+iJ9as=' 'sha256-hifkf8qkPcYNTOmMoNcVab/gJz0LS+DYVm5EEBhJP2s='; style-src 'self' 'sha256-D9goJuz7kesk+wC5zNxSp82jhKDK7SzL4jagkrJP1Eo='; style-src-attr 'unsafe-hashes' 'sha256-8ilcya6PJ2mDcuNFfcZaaOL85o/T7b8cPlsalzaJVOs='; font-src 'self'; connect-src 'self' https://eu.i.posthog.com; upgrade-insecure-requests" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header Strict-Transport-Security "max-age=31536000" always;
}

location = /campaigns/bundle-allinone/ {
  root /site/refi-cro;
  try_files /campaigns/bundle-allinone/index.html =404;
  add_header Cache-Control "no-cache" always;
  add_header X-Robots-Tag "noindex, nofollow" always;
  add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; media-src 'self' https:; script-src 'self' 'sha256-5/HvUkmX2w7EcZKfznpjdo6q2wVrTkf8Q8EeP/JRyrA=' 'sha256-Doq7w+F7VxnfHhKy/KUEzJyxSz9Yv1OX7WTlbjL6ukI=' 'sha256-yLsg9HaQoFBIg5fjoa20EuZ8wbZK6JV31Fr8T+iJ9as=' 'sha256-hifkf8qkPcYNTOmMoNcVab/gJz0LS+DYVm5EEBhJP2s='; style-src 'self' 'sha256-D9goJuz7kesk+wC5zNxSp82jhKDK7SzL4jagkrJP1Eo='; style-src-attr 'unsafe-hashes' 'sha256-8ilcya6PJ2mDcuNFfcZaaOL85o/T7b8cPlsalzaJVOs='; font-src 'self'; connect-src 'self' https://eu.i.posthog.com; upgrade-insecure-requests" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header Strict-Transport-Security "max-age=31536000" always;
}

location = /campaigns/bundle-allinone/thank-you {
  root /site/refi-cro;
  try_files /campaigns/bundle-allinone/thank-you/index.html =404;
  add_header Cache-Control "no-cache" always;
  add_header X-Robots-Tag "noindex, nofollow" always;
  add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; media-src 'self' https:; script-src 'self' 'sha256-5/HvUkmX2w7EcZKfznpjdo6q2wVrTkf8Q8EeP/JRyrA=' 'sha256-Doq7w+F7VxnfHhKy/KUEzJyxSz9Yv1OX7WTlbjL6ukI=' 'sha256-yLsg9HaQoFBIg5fjoa20EuZ8wbZK6JV31Fr8T+iJ9as=' 'sha256-hifkf8qkPcYNTOmMoNcVab/gJz0LS+DYVm5EEBhJP2s='; style-src 'self' 'sha256-D9goJuz7kesk+wC5zNxSp82jhKDK7SzL4jagkrJP1Eo='; style-src-attr 'unsafe-hashes' 'sha256-8ilcya6PJ2mDcuNFfcZaaOL85o/T7b8cPlsalzaJVOs='; font-src 'self'; connect-src 'self' https://eu.i.posthog.com; upgrade-insecure-requests" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header Strict-Transport-Security "max-age=31536000" always;
}

location = /campaigns/bundle-allinone/thank-you/ {
  root /site/refi-cro;
  try_files /campaigns/bundle-allinone/thank-you/index.html =404;
  add_header Cache-Control "no-cache" always;
  add_header X-Robots-Tag "noindex, nofollow" always;
  add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; media-src 'self' https:; script-src 'self' 'sha256-5/HvUkmX2w7EcZKfznpjdo6q2wVrTkf8Q8EeP/JRyrA=' 'sha256-Doq7w+F7VxnfHhKy/KUEzJyxSz9Yv1OX7WTlbjL6ukI=' 'sha256-yLsg9HaQoFBIg5fjoa20EuZ8wbZK6JV31Fr8T+iJ9as=' 'sha256-hifkf8qkPcYNTOmMoNcVab/gJz0LS+DYVm5EEBhJP2s='; style-src 'self' 'sha256-D9goJuz7kesk+wC5zNxSp82jhKDK7SzL4jagkrJP1Eo='; style-src-attr 'unsafe-hashes' 'sha256-8ilcya6PJ2mDcuNFfcZaaOL85o/T7b8cPlsalzaJVOs='; font-src 'self'; connect-src 'self' https://eu.i.posthog.com; upgrade-insecure-requests" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header Strict-Transport-Security "max-age=31536000" always;
}

location = /campaigns/buyers-south {
  root /site/refi-cro;
  try_files /campaigns/buyers-south/index.html =404;
  add_header Cache-Control "no-cache" always;
  add_header X-Robots-Tag "noindex, nofollow" always;
  add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; media-src 'self' https:; script-src 'self' 'sha256-5/HvUkmX2w7EcZKfznpjdo6q2wVrTkf8Q8EeP/JRyrA=' 'sha256-Doq7w+F7VxnfHhKy/KUEzJyxSz9Yv1OX7WTlbjL6ukI=' 'sha256-yLsg9HaQoFBIg5fjoa20EuZ8wbZK6JV31Fr8T+iJ9as=' 'sha256-hifkf8qkPcYNTOmMoNcVab/gJz0LS+DYVm5EEBhJP2s='; style-src 'self' 'sha256-D9goJuz7kesk+wC5zNxSp82jhKDK7SzL4jagkrJP1Eo='; style-src-attr 'unsafe-hashes' 'sha256-8ilcya6PJ2mDcuNFfcZaaOL85o/T7b8cPlsalzaJVOs='; font-src 'self'; connect-src 'self' https://eu.i.posthog.com; upgrade-insecure-requests" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header Strict-Transport-Security "max-age=31536000" always;
}

location = /campaigns/buyers-south/ {
  root /site/refi-cro;
  try_files /campaigns/buyers-south/index.html =404;
  add_header Cache-Control "no-cache" always;
  add_header X-Robots-Tag "noindex, nofollow" always;
  add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; media-src 'self' https:; script-src 'self' 'sha256-5/HvUkmX2w7EcZKfznpjdo6q2wVrTkf8Q8EeP/JRyrA=' 'sha256-Doq7w+F7VxnfHhKy/KUEzJyxSz9Yv1OX7WTlbjL6ukI=' 'sha256-yLsg9HaQoFBIg5fjoa20EuZ8wbZK6JV31Fr8T+iJ9as=' 'sha256-hifkf8qkPcYNTOmMoNcVab/gJz0LS+DYVm5EEBhJP2s='; style-src 'self' 'sha256-D9goJuz7kesk+wC5zNxSp82jhKDK7SzL4jagkrJP1Eo='; style-src-attr 'unsafe-hashes' 'sha256-8ilcya6PJ2mDcuNFfcZaaOL85o/T7b8cPlsalzaJVOs='; font-src 'self'; connect-src 'self' https://eu.i.posthog.com; upgrade-insecure-requests" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header Strict-Transport-Security "max-age=31536000" always;
}

location = /campaigns/buyers-south/thank-you {
  root /site/refi-cro;
  try_files /campaigns/buyers-south/thank-you/index.html =404;
  add_header Cache-Control "no-cache" always;
  add_header X-Robots-Tag "noindex, nofollow" always;
  add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; media-src 'self' https:; script-src 'self' 'sha256-5/HvUkmX2w7EcZKfznpjdo6q2wVrTkf8Q8EeP/JRyrA=' 'sha256-Doq7w+F7VxnfHhKy/KUEzJyxSz9Yv1OX7WTlbjL6ukI=' 'sha256-yLsg9HaQoFBIg5fjoa20EuZ8wbZK6JV31Fr8T+iJ9as=' 'sha256-hifkf8qkPcYNTOmMoNcVab/gJz0LS+DYVm5EEBhJP2s='; style-src 'self' 'sha256-D9goJuz7kesk+wC5zNxSp82jhKDK7SzL4jagkrJP1Eo='; style-src-attr 'unsafe-hashes' 'sha256-8ilcya6PJ2mDcuNFfcZaaOL85o/T7b8cPlsalzaJVOs='; font-src 'self'; connect-src 'self' https://eu.i.posthog.com; upgrade-insecure-requests" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header Strict-Transport-Security "max-age=31536000" always;
}

location = /campaigns/buyers-south/thank-you/ {
  root /site/refi-cro;
  try_files /campaigns/buyers-south/thank-you/index.html =404;
  add_header Cache-Control "no-cache" always;
  add_header X-Robots-Tag "noindex, nofollow" always;
  add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; media-src 'self' https:; script-src 'self' 'sha256-5/HvUkmX2w7EcZKfznpjdo6q2wVrTkf8Q8EeP/JRyrA=' 'sha256-Doq7w+F7VxnfHhKy/KUEzJyxSz9Yv1OX7WTlbjL6ukI=' 'sha256-yLsg9HaQoFBIg5fjoa20EuZ8wbZK6JV31Fr8T+iJ9as=' 'sha256-hifkf8qkPcYNTOmMoNcVab/gJz0LS+DYVm5EEBhJP2s='; style-src 'self' 'sha256-D9goJuz7kesk+wC5zNxSp82jhKDK7SzL4jagkrJP1Eo='; style-src-attr 'unsafe-hashes' 'sha256-8ilcya6PJ2mDcuNFfcZaaOL85o/T7b8cPlsalzaJVOs='; font-src 'self'; connect-src 'self' https://eu.i.posthog.com; upgrade-insecure-requests" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header Strict-Transport-Security "max-age=31536000" always;
}

location = /campaigns/sellers-south {
  root /site/refi-cro;
  try_files /campaigns/sellers-south/index.html =404;
  add_header Cache-Control "no-cache" always;
  add_header X-Robots-Tag "noindex, nofollow" always;
  add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; media-src 'self' https:; script-src 'self' 'sha256-5/HvUkmX2w7EcZKfznpjdo6q2wVrTkf8Q8EeP/JRyrA=' 'sha256-Doq7w+F7VxnfHhKy/KUEzJyxSz9Yv1OX7WTlbjL6ukI=' 'sha256-yLsg9HaQoFBIg5fjoa20EuZ8wbZK6JV31Fr8T+iJ9as=' 'sha256-hifkf8qkPcYNTOmMoNcVab/gJz0LS+DYVm5EEBhJP2s='; style-src 'self' 'sha256-D9goJuz7kesk+wC5zNxSp82jhKDK7SzL4jagkrJP1Eo='; style-src-attr 'unsafe-hashes' 'sha256-8ilcya6PJ2mDcuNFfcZaaOL85o/T7b8cPlsalzaJVOs='; font-src 'self'; connect-src 'self' https://eu.i.posthog.com; upgrade-insecure-requests" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header Strict-Transport-Security "max-age=31536000" always;
}

location = /campaigns/sellers-south/ {
  root /site/refi-cro;
  try_files /campaigns/sellers-south/index.html =404;
  add_header Cache-Control "no-cache" always;
  add_header X-Robots-Tag "noindex, nofollow" always;
  add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; media-src 'self' https:; script-src 'self' 'sha256-5/HvUkmX2w7EcZKfznpjdo6q2wVrTkf8Q8EeP/JRyrA=' 'sha256-Doq7w+F7VxnfHhKy/KUEzJyxSz9Yv1OX7WTlbjL6ukI=' 'sha256-yLsg9HaQoFBIg5fjoa20EuZ8wbZK6JV31Fr8T+iJ9as=' 'sha256-hifkf8qkPcYNTOmMoNcVab/gJz0LS+DYVm5EEBhJP2s='; style-src 'self' 'sha256-D9goJuz7kesk+wC5zNxSp82jhKDK7SzL4jagkrJP1Eo='; style-src-attr 'unsafe-hashes' 'sha256-8ilcya6PJ2mDcuNFfcZaaOL85o/T7b8cPlsalzaJVOs='; font-src 'self'; connect-src 'self' https://eu.i.posthog.com; upgrade-insecure-requests" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header Strict-Transport-Security "max-age=31536000" always;
}

location = /campaigns/sellers-south/thank-you {
  root /site/refi-cro;
  try_files /campaigns/sellers-south/thank-you/index.html =404;
  add_header Cache-Control "no-cache" always;
  add_header X-Robots-Tag "noindex, nofollow" always;
  add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; media-src 'self' https:; script-src 'self' 'sha256-5/HvUkmX2w7EcZKfznpjdo6q2wVrTkf8Q8EeP/JRyrA=' 'sha256-Doq7w+F7VxnfHhKy/KUEzJyxSz9Yv1OX7WTlbjL6ukI=' 'sha256-yLsg9HaQoFBIg5fjoa20EuZ8wbZK6JV31Fr8T+iJ9as=' 'sha256-hifkf8qkPcYNTOmMoNcVab/gJz0LS+DYVm5EEBhJP2s='; style-src 'self' 'sha256-D9goJuz7kesk+wC5zNxSp82jhKDK7SzL4jagkrJP1Eo='; style-src-attr 'unsafe-hashes' 'sha256-8ilcya6PJ2mDcuNFfcZaaOL85o/T7b8cPlsalzaJVOs='; font-src 'self'; connect-src 'self' https://eu.i.posthog.com; upgrade-insecure-requests" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header Strict-Transport-Security "max-age=31536000" always;
}

location = /campaigns/sellers-south/thank-you/ {
  root /site/refi-cro;
  try_files /campaigns/sellers-south/thank-you/index.html =404;
  add_header Cache-Control "no-cache" always;
  add_header X-Robots-Tag "noindex, nofollow" always;
  add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; media-src 'self' https:; script-src 'self' 'sha256-5/HvUkmX2w7EcZKfznpjdo6q2wVrTkf8Q8EeP/JRyrA=' 'sha256-Doq7w+F7VxnfHhKy/KUEzJyxSz9Yv1OX7WTlbjL6ukI=' 'sha256-yLsg9HaQoFBIg5fjoa20EuZ8wbZK6JV31Fr8T+iJ9as=' 'sha256-hifkf8qkPcYNTOmMoNcVab/gJz0LS+DYVm5EEBhJP2s='; style-src 'self' 'sha256-D9goJuz7kesk+wC5zNxSp82jhKDK7SzL4jagkrJP1Eo='; style-src-attr 'unsafe-hashes' 'sha256-8ilcya6PJ2mDcuNFfcZaaOL85o/T7b8cPlsalzaJVOs='; font-src 'self'; connect-src 'self' https://eu.i.posthog.com; upgrade-insecure-requests" always;
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
