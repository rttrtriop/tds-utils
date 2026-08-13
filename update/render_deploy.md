# Деплой Бэкенда на Render.com (Free Tier)

Этот гайд поможет вам бесплатно запустить Telegram-бота и WebSocket сервер на облачной платформе Render.com всего за 3 клика.

Благодаря встроенной функции `keep_alive`, ваш бесплатный сервер **не будет засыпать** (отправляется пинг каждые 10 минут).

## Шаг 1: Подключение репозитория
1. Зарегистрируйтесь на [Render.com](https://render.com/) (можно войти через GitHub).
2. Нажмите кнопку **"New +"** в правом верхнем углу и выберите **"Web Service"**.
3. Выберите **"Build and deploy from a Git repository"** и нажмите Next.
4. Подключите свой GitHub-аккаунт и выберите репозиторий с вашим кодом `tds-utils`.

## Шаг 2: Настройка сервиса
Render автоматически обнаружит файл `render.yaml` в корне вашего проекта (Infrastructure as Code) и подтянет нужные настройки. 
Вам нужно лишь убедиться в следующем:
- **Environment:** Python
- **Build Command:** `pip install -r backend/requirements.txt`
- **Start Command:** `python backend/main.py`
- **Instance Type:** Выберите тариф **Free**.

## Шаг 3: Настройка переменных окружения (Environment Variables)
Прокрутите страницу вниз до раздела **Environment Variables** и добавьте обязательные переменные:
- **`BOT_TOKEN`**: вставьте токен вашего бота (полученный у @BotFather в Telegram).
- **`ADMIN_ID`**: (опционально) вставьте ваш цифровой Telegram ID для получения жалоб на пресеты.

Нажмите кнопку **"Create Web Service"**.

## Шаг 4: Настройка Frontend
После того как сервис соберется (статус станет "Live"), скопируйте URL вашего сервиса (например, `https://tds-strategist-backend.onrender.com`).
Перейдите в настройки вашего Frontend (или в файл `.env`, если он есть) и укажите этот URL:
```env
VITE_API_URL=https://tds-strategist-backend.onrender.com
VITE_WS_URL=wss://tds-strategist-backend.onrender.com/ws
```

Ваш бэкенд и Telegram-бот успешно работают 24/7!
