# noise-signal — воркер с LLM для ШУМ

Один файл `src/index.js`, без зависимостей. Деплой кликами в Cloudflare Dashboard,
терминал не нужен.

## Как защищён бюджет ($4.96 на OpenAI)

Приблизительная цена одного вызова (`gpt-4o-mini`, ~1000 токенов на партию из 20 передач):
порядка **$0.0006**. Реальные цены смотри на https://platform.openai.com/docs/pricing.

Четыре слоя, от внутреннего к внешнему:

1. **Пул.** Передачи генерируются партиями по 20 и складываются в KV. Посетители читают из
   пула, на каждый `/feed` LLM не вызывается. Пул пополняется, когда в нём меньше 30
   передач или прошло 3 часа с последней генерации (это ≈ 8 вызовов в сутки).
2. **Потолки вызовов** (счётчики в KV): `DAILY_LLM_CALLS = 120` в сутки и
   `TOTAL_LLM_CALLS = 2000` за всё время жизни проекта. 2000 вызовов ≈ $1.2 по расчёту.
   Дальше воркер просто отдаёт то, что есть в пуле, а сайт переключается на локальный
   генератор: эфир не замолкает, расходы нулевые.
3. **Лимит «внедрений»**: `INJECT_PER_HOUR = 3` с одного IP в час. Отклонённая цензором
   попытка тоже занимает слот. Тема обрезается до 40 символов.
4. **Лимит на стороне OpenAI** (самый надёжный, настрой обязательно, см. блок 1).

Модерация (`omni-moderation-latest`) бесплатна и применяется и к теме посетителя (до вызова
LLM), и к сгенерированным передачам.

Худший случай по счётчикам: 120 вызовов/сутки ≈ $0.07/сутки. Для ~100 посетителей хватает
с большим запасом.

## Блок 1. OpenAI: ключ и лимиты

1. https://platform.openai.com/ → **Settings → Projects** → создай проект `noise`
   (отдельный проект, чтобы ключ и лимиты не смешивались с другими).
2. В проекте создай **API key** (Restricted): разреши только **Chat completions**
   (`/v1/chat/completions`) и **Moderations**. Скопируй ключ, он показывается один раз.
3. **Settings → Billing**: убедись, что **auto recharge выключен**. Тогда потратить больше
   предоплаченных $4.96 физически нельзя.
4. **Settings → Limits** (Usage limits) для проекта `noise`: поставь месячный бюджет
   **$3** и включи уведомление по email. Названия пунктов в интерфейсе могут отличаться.

## Блок 2. Cloudflare: KV и воркер

1. https://dash.cloudflare.com/ → **Storage & Databases → KV → Create** → имя `noise-kv`.
2. **Workers & Pages → Create → Worker** → имя `noise-signal` → Deploy.
3. **Edit code**: сотри заглушку, вставь содержимое `src/index.js` → **Deploy**.
4. **Settings → Bindings → Add → KV namespace**: имя переменной **`NOISE_KV`**, значение —
   `noise-kv`.
5. **Settings → Variables and Secrets**:
   - **Secret** `OPENAI_API_KEY` — ключ из блока 1.
   - Текстовые переменные (можно не задавать, дефолты такие же, как в `wrangler.toml`):
     `ALLOWED_ORIGINS` = `https://noise.vonzvyagin.ru`, `MODEL` = `gpt-4o-mini`,
     `DAILY_LLM_CALLS`, `TOTAL_LLM_CALLS`, `INJECT_PER_HOUR`.
6. **Settings → Domains & Routes → Add → Custom domain** → `api.noise.vonzvyagin.ru`
   (домен `vonzvyagin.ru` уже на Cloudflare DNS, запись создастся сама).

Проверка: открой https://api.noise.vonzvyagin.ru/feed — должен вернуться JSON с `items`.
(Первый запрос идёт дольше: генерируется первая партия.)

## Блок 3. Сайт

Репозиторий `noise` → Settings → Pages → Source: `main` / root, Custom domain:
`noise.vonzvyagin.ru`. DNS (Cloudflare): `CNAME noise → estogeronium.github.io`
(grey cloud / DNS only).

Адрес API лежит в `config.js` (`API_URL`). Пустая строка = только локальный генератор.

## Модель

Рассчитано на `gpt-4o-mini` (или аналогичную дешёвую non-reasoning модель). С reasoning-моделями
расход токенов на «размышления» вырастет в разы, и расчёты выше перестанут быть верны.
