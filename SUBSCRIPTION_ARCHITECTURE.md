# IGseek Freemium & Pro Subscription Architecture

Reference specification for repository synchronization (Lovable / Vercel / Express).

## 1. Tiers & Routing (No Visible Limits)

| Capability | Free (`plan: "free"`) | Pro (`plan: "pro"`, 149 RUB / 30 days) |
|---|---|---|
| Visible quotas / limits | **None** (unlimited Chat, Engine, Flow & Photos) | **None** (unlimited Chat, Engine, Flow & Photos) |
| Text / Code / Tools (Chat, Engine, Flow, File Translator, Memory) | Mistral AI Free (`src/lib/mistral-free.ts`: `mistral-small-latest` / `pixtral-12b-2409`, with Pollinations Mistral fallback) | Official DeepSeek API + APIMIRA fallback (`src/routes/api/chat.ts`, `src/lib/flow-engine.ts`, `src/lib/file-translator.ts`, `src/lib/memory-server.ts`) |
| Image Generation & Editing | Pollinations (`src/lib/pollinations-image.ts`, flux/turbo). For `edit_image`, Mistral vision describes the reference image and builds an edit prompt for Pollinations. | APIMIRA GPT Image 2 (`src/lib/apimira-image.ts`, native reference editing) |
| Silent Anti-Abuse Image Protection (Pro) | N/A (already free Pollinations) | Rolling **8 images/hour** per user (`src/lib/photo-limits-server.ts`). Starting on the **9th image within 60 minutes**, silently switches to free Pollinations without any error or UI notice. For `edit_image` during silent fallback, vision inspects the reference and **DeepSeek** synthesizes a detailed Pollinations prompt (`buildReferenceAwarePollinationsPrompt`). |

> **UI Copy Rule:** Never expose internal model or AI provider brand names (Mistral, Pollinations, DeepSeek, APIMIRA, GPT Image) inside subscription UI, and never display quota bars or mention the silent Pro hourly anti-abuse threshold. Describe tiers strictly by capability level ("standard models" vs "more advanced models & deep reasoning" / "high-quality image generation & reference photo editing").

## 2. File Map

### Server-side modules & API routes
- `src/lib/subscription-server.ts` — Platega checkout (`POST https://app.platega.io/transaction/process`), live transaction check (`GET https://app.platega.io/transaction/{id}`), constant-time webhook auth (`X-MerchantId` / `X-Secret`), HMAC-SHA256 `subscription_proof` signing/verification, Firestore REST updates, and `resolveEffectiveUserTier(authed)`.
- `src/lib/mistral-free.ts` — Free-tier Mistral streaming (`callMistralFreeChat`), non-streaming helper (`callMistralFreeText`), and `buildReferenceAwarePollinationsPrompt` (reference vision description + DeepSeek/Mistral prompt synthesis for Pollinations edits).
- `src/lib/pollinations-image.ts` — Free-tier image generation via Pollinations with binary magic-byte validation.
- `src/lib/photo-limits-server.ts` — Silent rolling 1-hour Pro image anti-abuse tracker (`PRO_HOURLY_PAID_IMAGE_LIMIT = 8`, `evaluateProHourlyImageRoute`, `recordProHourlyImageGeneration`).
- `src/routes/api/chat.ts` — Calls `resolveEffectiveUserTier(authed)` to route Chat & Engine (`useFreeModels = !isProUser`), passes `useFreeModel` to `translateFileWithDeepSeek` & `analyzeAndUpdateMemory`, and handles silent Pro >8/hr Pollinations fallback in `generate_image` & `edit_image`.
- `src/routes/api/flow.ts` & `src/lib/flow-engine.ts` — Calls `resolveEffectiveUserTier(authed)` and routes Flow planning & all step synthesis (`terminal`, `web_search`, `library`, `github`, `email`) through `callMistralFreeText` on Free plan and DeepSeek on Pro plan.
- `src/lib/file-translator.ts` & `src/lib/memory-server.ts` — Accept `useFreeModel?: boolean` to run file interpretation and background memory updates on Mistral Free for Free accounts.
- `src/routes/api/create-payment.ts` + `api/create-payment.mjs` — `POST /api/create-payment` (authenticated Firebase user -> creates 149 RUB Platega transaction -> stores `PENDING` payment in Firestore).
- `src/routes/api/subscription.ts` + `api/subscription.mjs` — `GET /api/subscription` (status + auto-check pending txn + auto-expire after 30 days) & `POST /api/subscription` (active verification & 30-day Pro activation/extension).
- `src/routes/api/payment-webhook.ts` + `api/payment-webhook.mjs` — `POST /api/payment-webhook` (Platega callback authenticated via `X-MerchantId` & `X-Secret`, cross-checked against Platega API).
- `server.ts` & `src/vercel-entry.ts` — Mounts/exports all payment & subscription endpoints. Run `node scripts/build-vercel-api.mjs` after backend edits to rebuild `api/_handlers.mjs`.

### Client-side modules & UI
- `src/lib/subscription-client.ts` — Client helpers (`fetchSubscriptionStatus`, `startPlategaCheckout`, `verifyPlategaPayment`, pending txn storage, registration-offer seen flags).
- `src/lib/prompt-limits.ts` — All scopes (`engine`, `chat`, `flow`, `image`) set to `Infinity` / `UNLIMITED_SCOPES: true` so no blocking limits appear anywhere on client.
- `src/components/subscription/SubscriptionPanel.tsx` — Settings → Subscription tab (plan status, 30-day countdown, Free vs Pro tier comparison, SBP/Card checkout, automatic 5s polling while pending).
- `src/components/subscription/RegistrationProOfferModal.tsx` — Post-registration Pro offer modal (triggered after email signup in `src/components/auth/AuthCard.tsx` and after Google accent onboarding in `src/routes/app.tsx`).
- `src/routes/app.tsx` — Syncs subscription on login/focus/return URL (`?payment=success`), renders subtle sidebar Pro button, adds `"subscription"` tab to `ProfileModal` (no limits card in Account tab).

## 3. Firestore Schema & Rules
- `firebase-blueprint.json` & `firestore.rules`:
  - `profiles/{userId}` fields: `plan`, `subscription_status`, `subscription_started_at`, `subscription_expires_at`, `subscription_txn_id`, `subscription_pending_txn_id`, `subscription_proof`.
  - `payments/{paymentId}`: owner read/create/update (no delete).
  - **Security invariant:** Server-side `resolveEffectiveUserTier` trusts Pro status ONLY when `subscription_proof` passes HMAC-SHA256 verification for `authed.id` AND `expiresAt > Date.now()`.

## 4. Required Environment Variables (Server-Side Only — Never Hardcode)
- `PLATEGA_MERCHANT_ID`
- `PLATEGA_SECRET_KEY`
- `MISTRAL_API_KEY`
- `DEEPSEEK_API_KEY`
- `APIMIRA_API_KEY`
- `SUBSCRIPTION_SIGNING_SECRET` (optional; defaults to HMAC derived from `PLATEGA_SECRET_KEY`)
