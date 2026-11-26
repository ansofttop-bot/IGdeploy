# IGseek AI Infrastructure & Self-Hosted Inference Guide

## 1. Архитектура маршрутизации (`src/lib/ai-router.ts`)

IGseek использует единый маршрутизатор с жёстким разделением тарифов (**Free** и **Pro**) и автоматическим Circuit Breaker:

- **Free Tier (полная автономность от платных ключей):**
  1. `SELF_HOSTED_FREE_LLM_URL` (если развёрнут собственный OpenAI-совместимый узел)
  2. Пользовательские plug-in провайдеры с `"tier": "free"` из `AI_CUSTOM_PROVIDERS_JSON`
  3. Бесплатный каскад (`mistral-free.ts` + Pollinations fallback для текста/изображений)
  - Бесплатный тариф **никогда** не обращается к платным ключам (`DEEPSEEK_API_KEY` / `APIMIRA_API_KEY`).

- **Pro Tier (оптимизация стоимости и отказоустойчивость):**
  1. Direct DeepSeek API (`deepseek-chat` / `deepseek-reasoner`) — минимальная себестоимость на токен при здоровом состоянии.
  2. `SELF_HOSTED_PRO_LLM_URL` и plug-in провайдеры `"tier": "pro"` из `AI_CUSTOM_PROVIDERS_JSON`.
  3. Резервная цепочка APIMIRA с автоматическим пропуском деградировавших узлов.

## 2. Circuit Breaker и идемпотентность

- При ошибках биллинга/авторизации (`401`/`402`/`403`) Circuit Breaker немедленно изолирует провайдер на 5 минут и переключает запрос на резервный узел.
- При сетевых/транзиентных сбоях (2 подряд) провайдер переходит в cooldown (30–180 с).
- Платёжные и критические запросы защищены `Idempotency-Key` (`src/lib/idempotency-server.ts`) с 5-минутным окном дедупликации против двойных списаний.

## 3. Подключение новых провайдеров без переработки кода

Задайте переменную окружения `AI_CUSTOM_PROVIDERS_JSON`:

```json
[
  {
    "id": "groq-fast-free",
    "tier": "free",
    "baseUrl": "https://api.groq.com/openai/v1",
    "apiKey": "gsk_...",
    "model": "llama-3.3-70b-versatile",
    "priority": 20
  }
]
```

## 4. Анализ собственного Inference (vLLM / Ollama / SGLang)

| Сценарий | GPU / VPS | Рекомендуемый движок | Модели | Экономика |
|---|---|---|---|---|
| Малый трафик (< 300k токенов/день) | Внешние API + Free каскад | Serverless API | Текущий маршрутизатор | Выгоднее API (0 ₽ за простой) |
| Средний трафик (1–5M токенов/день) | 1× RTX 4090 / L40S (24–48 GB VRAM) | **vLLM** или **SGLang** | Qwen2.5-14B / 32B AWQ, DeepSeek-R1-Distill-32B | Окупается при > 40% утилизации |
| Высокий трафик (> 10M токенов/день) | 2× A100/H100 80GB | **vLLM** (tensor-parallel) | Qwen2.5-72B, DeepSeek-V3/R1 quantized | Снижение стоимости до 3–5× |

### Быстрое подключение собственного сервера vLLM / Ollama

```bash
# Пример запуска vLLM с OpenAI-совместимым API:
vllm serve Qwen/Qwen2.5-14B-Instruct-AWQ --port 8000 --api-key "$SELF_HOSTED_LLM_API_KEY"
```

Затем добавьте в `.env` (на вашем сервере):
```env
SELF_HOSTED_FREE_LLM_URL=https://llm.your-domain.ru/v1
SELF_HOSTED_FREE_LLM_MODEL=Qwen/Qwen2.5-14B-Instruct-AWQ
SELF_HOSTED_LLM_API_KEY=your-internal-secret
```
