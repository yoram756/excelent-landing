# Hebrew CRO landing implementation

Project rules and identity come from AGENTS.md. This document records the requested landing implementation, not a replacement for those rules.

The React application lives in apps/refi-landing and builds into site/refi-cro. The existing LP1 v2 stays in its own directory. Public page content is selected from config/landing/refi.json and the approved campaign/business configuration. Never ship the full business configuration, provider credentials, or private contact data to the browser.

Use React, Tailwind CSS v4 and shadcn/ui with RTL enabled. The document root is Hebrew and RTL. The seven homepage sections are Hero, trust/metrics, three benefits, authentic testimonials, lead form, FAQ with matching FAQPage JSON-LD, and the mobile sticky CTA. Missing authenticated video sources must be reported; never invent footage, clients, ratings or savings statistics.

Use logical horizontal utilities only and isolate numbers, prices, phone numbers and English fragments. Assistant is served locally with font-display swap; body line height is 1.7 and headings 1.4. Respect reduced motion, keyboard access and safe areas on mobile.

Submit to the existing /api/lead contract with a stable event_id/idempotency_key. Do not claim success without a valid request_id and an HTTP success response. A retry of the same payload keeps its event identifier; edited data gets a new one. Marketing consent remains false. Analytics is optional, and PostHog receives no contact fields or questionnaire answers. quote_submitted runs on /thank-you only with a confirmed receipt and analytics consent.

Commands are in apps/refi-landing/package.json: build, lint, test, test:e2e and audit. Save real Lighthouse reports and distinguish local performance/mock API evidence from production measurements. A lower response time cannot be claimed from client timing alone. Never deploy or change the existing intake workflows as part of the frontend build.
