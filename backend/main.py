import asyncio
import json
import logging
import aiosqlite
import os
from typing import Dict, Any

from aiohttp import web
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.utils.keyboard import InlineKeyboardBuilder
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    raise ValueError("No BOT_TOKEN provided in environment variables")

ADMIN_ID_STR = os.getenv("ADMIN_ID", "5506291448")
ADMIN_ID = int(ADMIN_ID_STR)

logging.basicConfig(level=logging.INFO)

# --- SQLite Database Setup ---
DB_FILE = 'presets.db'

async def init_db():
    async with aiosqlite.connect(DB_FILE) as db:
        await db.execute('''
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT,
            presets_created INTEGER DEFAULT 0,
            presets_approved INTEGER DEFAULT 0
        )
        ''')

        await db.execute('''
        CREATE TABLE IF NOT EXISTS presets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT,
            mode TEXT,
            players TEXT,
            data TEXT,
            status TEXT DEFAULT 'pending',
            likes INTEGER DEFAULT 0
        )
        ''')

        await db.execute('''
        CREATE TABLE IF NOT EXISTS user_interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            preset_id INTEGER,
            interaction_type TEXT -- 'like', 'dislike', 'favorite'
        )
        ''')

        await db.execute('''
        CREATE TABLE IF NOT EXISTS auth_sessions (
            auth_key TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        await db.commit()

# --- Shared State ---
# Websockets: sessionId -> WebSocketResponse
active_websockets: Dict[str, web.WebSocketResponse] = {}
# Bot state: user_id -> dict with session context
user_sessions: Dict[int, Dict[str, Any]] = {}

# --- Telegram Bot ---
bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

async def update_user_stats(user_id: int, username: str, created: int = 0, approved: int = 0):
    async with aiosqlite.connect(DB_FILE) as db:
        async with db.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)) as cursor:
            row = await cursor.fetchone()
            if not row:
                await db.execute("INSERT INTO users (user_id, username, presets_created, presets_approved) VALUES (?, ?, ?, ?)",
                               (user_id, username, created, approved))
            else:
                if created:
                    await db.execute("UPDATE users SET presets_created = presets_created + ? WHERE user_id = ?", (created, user_id))
                if approved:
                    await db.execute("UPDATE users SET presets_approved = presets_approved + ? WHERE user_id = ?", (approved, user_id))
        await db.commit()

@dp.message(Command("start"))
async def start_handler(message: types.Message):
    args = message.text.split(maxsplit=1)
    await upsert_user(message.from_user.id, message.from_user.username)
    if len(args) > 1:
        auth_key = args[1]
        user_id = message.from_user.id

        async with aiosqlite.connect(DB_FILE) as db:
            async with db.execute("SELECT session_id FROM auth_sessions WHERE auth_key = ?", (auth_key,)) as cursor:
                row = await cursor.fetchone()

            if row:
                session_id = row[0]
                if user_id not in user_sessions:
                    user_sessions[user_id] = {}
                user_sessions[user_id]['session_id'] = session_id

                # Update user in DB
                await db.execute("UPDATE users SET username = ? WHERE user_id = ?", (message.from_user.username, user_id))
                await db.commit()

                # Notify web client of auth success
                if session_id in active_websockets:
                    try:
                        await active_websockets[session_id].send_json({
                            "type": "auth_success",
                            "user_id": user_id,
                            "username": message.from_user.username,
                            "photo_url": "" # Handled client side fallback
                        })
                    except:
                        pass

                await db.execute("DELETE FROM auth_sessions WHERE auth_key = ?", (auth_key,))
                await db.commit()
                await message.answer(f"✅ Аккаунт успешно привязан к TDS Strategist!")
            else:
                await message.answer("❌ Недействительный или устаревший ключ авторизации.")
    else:
        await message.answer("Добро пожаловать в TDS STRATEGIST Бот!\nОткрывайте мини-апп или привязывайте сессию с сайта.")

@dp.message(Command("profile"))
async def profile_handler(message: types.Message):
    user_id = message.from_user.id
    async with aiosqlite.connect(DB_FILE) as db:
        async with db.execute("SELECT presets_created, presets_approved FROM users WHERE user_id = ?", (user_id,)) as cursor:
            row = await cursor.fetchone()

    if row:
        created, approved = row
        await message.answer(f"👤 **Author Profile: @{message.from_user.username or 'Unknown'}**\n\n"
                             f"📝 Presets Submitted: {created}\n"
                             f"✅ Presets Approved: {approved}", parse_mode="Markdown")
    else:
        await message.answer("You haven't submitted any presets yet! Go to the website to create one.")

@dp.message(Command("top"))
async def top_handler(message: types.Message):
    async with aiosqlite.connect(DB_FILE) as db:
        async with db.execute("SELECT username, presets_approved FROM users ORDER BY presets_approved DESC LIMIT 10") as cursor:
            top_users = await cursor.fetchall()

    if not top_users:
        await message.answer("No top strategists yet!")
        return

    text = "🏆 **Top Strategists** 🏆\n\n"
    for i, (username, approved) in enumerate(top_users, 1):
        if approved > 0:
            text += f"{i}. @{username or 'Unknown'} - {approved} approved presets\n"

    await message.answer(text, parse_mode="Markdown")

@dp.message(Command("catalog"))
async def catalog_handler(message: types.Message):
    builder = InlineKeyboardBuilder()

    # Modes
    modes = ["Easy", "Molten", "Fallen", "Hardcore", "Pizza Party", "Badlands II", "Polluted Wasteland II"]
    for mode in modes:
        builder.button(text=mode, callback_data=f"filter_mode_{mode}")
    builder.adjust(3)

    # Players
    players = ["1", "2", "3", "4"]
    for p in players:
        builder.button(text=f"{p}P", callback_data=f"filter_p_{p}")

    builder.adjust(3, 3, 1, 4)

    await message.answer("🔍 **Catalog Filters**\n\nSelect a mode or player count, or type a preset name to search.", reply_markup=builder.as_markup(), parse_mode="Markdown")

@dp.callback_query(F.data.startswith("filter_"))
async def filter_callback(callback: types.CallbackQuery):
    parts = callback.data.split("_")
    filter_type = parts[1]
    filter_val = parts[2]

    query = "SELECT id, title, mode, players FROM presets WHERE status = 'approved' AND "
    params = []

    if filter_type == "mode":
        query += "mode = ?"
        params.append(filter_val)
    elif filter_type == "p":
        query += "players = ?"
        params.append(filter_val)

    query += " LIMIT 10"

    async with aiosqlite.connect(DB_FILE) as db:
        async with db.execute(query, tuple(params)) as cursor:
            presets = await cursor.fetchall()

    if not presets:
        await callback.answer(f"No presets found for {filter_val}.", show_alert=True)
        return

    text = f"📚 **Results for {filter_val}:**\n\n"
    builder = InlineKeyboardBuilder()

    for pid, title, mode, players in presets:
        text += f"🔹 **{title}** ({mode} | {players}P)\n"
        # primary button style mapping - aiogram uses text for styling usually, or just emojis
        builder.button(text=f"🎮 Загрузить в калькулятор: {title}", callback_data=f"load_{pid}")

    builder.adjust(1)
    await callback.message.edit_text(text, reply_markup=builder.as_markup(), parse_mode="Markdown")
    await callback.answer()

@dp.message(F.text & ~F.text.startswith("/"))
async def search_presets(message: types.Message):
    # If it's a 6 digit code, it's a session ID registration
    if message.text.isdigit() and len(message.text) == 6:
        user_id = message.from_user.id
        if user_id not in user_sessions:
            user_sessions[user_id] = {}
        user_sessions[user_id]['session_id'] = message.text
        await message.answer(f"✅ Web Session ID `{message.text}` connected!", parse_mode="Markdown")
        return

    # Otherwise, Search by name
    search_term = f"%{message.text}%"
    async with aiosqlite.connect(DB_FILE) as db:
        async with db.execute("SELECT id, title, mode, players FROM presets WHERE status = 'approved' AND title LIKE ? LIMIT 5", (search_term,)) as cursor:
            presets = await cursor.fetchall()

    if not presets:
        await message.answer("No presets found matching your search.")
        return

    text = f"🔍 **Search results for '{message.text}':**\n\n"
    builder = InlineKeyboardBuilder()

    for pid, title, mode, players in presets:
        text += f"🔹 **{title}** ({mode} | {players}P)\n"
        builder.button(text=f"🎮 Загрузить в калькулятор", callback_data=f"load_{pid}")

    builder.adjust(1)
    await message.answer(text, reply_markup=builder.as_markup(), parse_mode="Markdown")

@dp.callback_query(F.data.startswith("load_"))
async def load_preset_callback(callback: types.CallbackQuery):
    pid_str = callback.data.split("_")[1]
    user_id = callback.from_user.id

    if user_id not in user_sessions or 'session_id' not in user_sessions[user_id]:
        await callback.message.answer("⚠️ You haven't connected a Web Session yet! Please type the 6-digit Session ID from the website, or use the link on the site.")
        await callback.answer()
        return

    session_id = user_sessions[user_id]['session_id']

    async with aiosqlite.connect(DB_FILE) as db:
        async with db.execute("SELECT data FROM presets WHERE id = ?", (int(pid_str),)) as cursor:
            row = await cursor.fetchone()

    if not row:
        await callback.answer("Preset not found!")
        return

    preset_data = json.loads(row[0])

    if session_id in active_websockets:
        ws = active_websockets[session_id]
        try:
            await ws.send_json({"type": "load_preset", "preset": preset_data})
            await callback.message.answer(f"✅ Preset successfully loaded to calculator (Session `{session_id}`)!", parse_mode="Markdown")
        except Exception as e:
            await callback.message.answer(f"❌ Failed to send data: {e}")
    else:
        await callback.message.answer(f"❌ Session `{session_id}` is not currently connected to the website. Is the tab open?")

    await callback.answer()

# Moderation features
@dp.callback_query(F.data.startswith("approve_") | F.data.startswith("reject_") | F.data.startswith("replace_"))
async def mod_callback(callback: types.CallbackQuery):
    if callback.from_user.id != ADMIN_ID:
        await callback.answer("You are not an admin.", show_alert=True)
        return

    parts = callback.data.split("_")
    action = parts[0]
    pid = int(parts[1])

    async with aiosqlite.connect(DB_FILE) as db:
        # Get author_id to notify
        async with db.execute("SELECT user_id FROM presets WHERE id = ?", (pid,)) as cursor:
            row = await cursor.fetchone()
            author_id = row[0] if row else None

        if action == "approve":
            await db.execute("UPDATE presets SET status = 'approved' WHERE id = ?", (pid,))
            if author_id: await update_user_stats(author_id, "", approved=1)
            await callback.message.edit_text(callback.message.text + "\n\n✅ **ОДОБРЕНО**", parse_mode="Markdown")
            try:
                if author_id: await bot.send_message(author_id, "🎉 Ваш пресет был одобрен!")
            except: pass
        elif action == "replace":
            mode = parts[2]
            # Delete old active preset for this mode
            await db.execute("DELETE FROM presets WHERE mode = ? AND status = 'approved'", (mode,))
            # Approve new preset
            await db.execute("UPDATE presets SET status = 'approved' WHERE id = ?", (pid,))
            if author_id: await update_user_stats(author_id, "", approved=1)
            await callback.message.edit_text(callback.message.text + "\n\n✅ **ЗАМЕНА ОДОБРЕНА**", parse_mode="Markdown")
            try:
                if author_id: await bot.send_message(author_id, "🎉 Ваша апелляция одобрена, пресет заменен!")
            except: pass
        elif action == "reject":
            await db.execute("UPDATE presets SET status = 'rejected' WHERE id = ?", (pid,))
            await callback.message.edit_text(callback.message.text + "\n\n❌ **ОТКЛОНЕНО**", parse_mode="Markdown")
            try:
                if author_id: await bot.send_message(author_id, "К сожалению, ваш пресет был отклонен модератором.")
            except: pass
        await db.commit()

    await callback.answer()

# --- API Endpoints ---

import uuid
async def generate_auth_key_api(request):
    try:
        data = await request.json()
        session_id = data.get('session_id')
        if not session_id:
            return web.json_response({"error": "session_id required"}, status=400)

        auth_key = str(uuid.uuid4())
        async with aiosqlite.connect(DB_FILE) as db:
            await db.execute("INSERT INTO auth_sessions (auth_key, session_id) VALUES (?, ?)", (auth_key, session_id))
            await db.commit()

        return web.json_response({"auth_key": auth_key})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def check_mode_availability_api(request):
    try:
        mode = request.query.get('mode')
        async with aiosqlite.connect(DB_FILE) as db:
            async with db.execute("SELECT id FROM presets WHERE mode = ? AND status = 'approved'", (mode,)) as cursor:
                row = await cursor.fetchone()
        return web.json_response({"available": row is None})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def publish_preset_api(request):
    try:
        data = await request.json()
        title = data.get('title')
        mode = data.get('mode')
        players = data.get('players')
        preset_data = data.get('presetData')
        author_username = data.get('username', 'Anonymous')
        is_appeal = data.get('is_appeal', False)
        appeal_reason = data.get('appeal_reason', '')

        author_id = data.get('user_id')
        if not author_id:
            author_id = hash(author_username) % 1000000000

        await update_user_stats(author_id, author_username, created=1)

        async with aiosqlite.connect(DB_FILE) as db:
            # Check if preset exists for this mode
            async with db.execute("SELECT id FROM presets WHERE mode = ? AND status = 'approved'", (mode,)) as cursor:
                existing = await cursor.fetchone()

            if existing and not is_appeal:
                return web.json_response({"success": False, "error": "mode_occupied"})

            cursor = await db.execute("INSERT INTO presets (user_id, title, mode, players, data, status) VALUES (?, ?, ?, ?, ?, ?)",
                           (author_id, title, mode, players, json.dumps(preset_data), 'pending' if not is_appeal else 'appeal'))
            pid = cursor.lastrowid
            await db.commit()

        # Notify admin
        kb = InlineKeyboardBuilder()
        if is_appeal:
            kb.button(text="✅ Одобрить замену", callback_data=f"replace_{pid}_{mode}")
            kb.button(text="❌ Отклонить", callback_data=f"reject_{pid}")
            msg = f"""⚠️ **Апелляция на замену пресета!**

Название: {title}
Режим: {mode} ({players})
Автор: {author_username}
Причина: {appeal_reason}"""
        else:
            kb.button(text="✅ Одобрить", callback_data=f"approve_{pid}")
            kb.button(text="❌ Отклонить", callback_data=f"reject_{pid}")
            msg = f"""**Новый пресет на модерацию!**

Название: {title}
Автор: {author_username} ({author_id})
Режим: {mode} ({players})

Данные: `{json.dumps(preset_data)[:100]}...`"""

        await bot.send_message(ADMIN_ID, msg, reply_markup=kb.as_markup(), parse_mode="Markdown")

        return web.json_response({"success": True, "preset_id": pid})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)

async def apply_preset_tma_api(request):
    try:
        data = await request.json()
        preset_id = data.get('preset_id')
        target_session = data.get('target_session')
        tg_user_id = data.get('telegram_user_id')

        session_id = None
        if target_session:
            session_id = target_session
        elif tg_user_id and tg_user_id in user_sessions:
            session_id = user_sessions[tg_user_id].get('session_id')

        if not session_id or session_id not in active_websockets:
            return web.json_response({"success": False, "error": "Target web session not connected."})

        async with aiosqlite.connect(DB_FILE) as db:
            async with db.execute("SELECT data FROM presets WHERE id = ?", (int(preset_id),)) as cursor:
                row = await cursor.fetchone()

        if not row:
            return web.json_response({"success": False, "error": "Preset not found."})

        preset_data = json.loads(row[0])

        ws = active_websockets[session_id]
        await ws.send_json({"type": "load_preset", "preset": preset_data})

        return web.json_response({"success": True})
    except Exception as e:
        logging.error(f"Error applying from TMA: {e}")
        return web.json_response({"success": False, "error": str(e)}, status=500)

async def interact_preset_api(request):
    try:
        data = await request.json()
        preset_id = data.get('preset_id')
        action = data.get('action') # 'like', 'dislike', 'favorite'
        # Anonymous for now if from web without auth, but let's accept user_id if passed
        user_id = data.get('user_id', 0)

        async with aiosqlite.connect(DB_FILE) as db:
            if action in ['like', 'dislike']:
                delta = 1 if action == 'like' else -1
                # Check if already voted
                async with db.execute("SELECT id FROM user_interactions WHERE user_id = ? AND preset_id = ? AND interaction_type IN ('like', 'dislike')", (user_id, preset_id)) as cursor:
                    existing = await cursor.fetchone()

                if not existing:
                    await db.execute("UPDATE presets SET likes = likes + ? WHERE id = ?", (delta, preset_id))
                    await db.execute("INSERT INTO user_interactions (user_id, preset_id, interaction_type) VALUES (?, ?, ?)", (user_id, preset_id, action))
                    await db.commit()
            elif action == 'favorite':
                 await db.execute("INSERT INTO user_interactions (user_id, preset_id, interaction_type) VALUES (?, ?, 'favorite')", (user_id, preset_id))
                 await db.commit()

        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)

async def report_preset_api(request):
    try:
        data = await request.json()
        preset_id = data.get('preset_id')
        reason = data.get('reason')

        async with aiosqlite.connect(DB_FILE) as db:
            async with db.execute("SELECT title, user_id FROM presets WHERE id = ?", (preset_id,)) as cursor:
                row = await cursor.fetchone()

        if row:
            title, author_id = row
            await bot.send_message(ADMIN_ID, f"⚠️ **Жалоба на пресет!**\n\nID: {preset_id}\nНазвание: {title}\nАвтор ID: {author_id}\nПричина: {reason}", parse_mode="Markdown")

        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)

async def health_check_api(request):
    return web.Response(text="OK")

async def get_bot_info_api(request):
    try:
        me = await bot.get_me()
        return web.json_response({"username": me.username})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def get_my_presets_api(request):
    try:
        user_id = request.query.get('user_id')
        if not user_id:
            return web.json_response({"error": "User ID required"}, status=400)

        async with aiosqlite.connect(DB_FILE) as db:
            async with db.execute("SELECT id, title, mode, players, likes FROM presets WHERE status = 'approved' AND user_id = ?", (user_id,)) as cursor:
                presets = await cursor.fetchall()

        result = [{"id": row[0], "title": row[1], "mode": row[2], "players": row[3], "likes": row[4]} for row in presets]
        return web.json_response(result)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def get_favorites_api(request):
    try:
        user_id = request.query.get('user_id')
        if not user_id:
            return web.json_response({"error": "User ID required"}, status=400)

        async with aiosqlite.connect(DB_FILE) as db:
            async with db.execute("""
                SELECT p.id, p.title, p.mode, p.players, p.likes
                FROM presets p
                JOIN user_interactions u ON p.id = u.preset_id
                WHERE u.user_id = ? AND u.interaction_type = 'favorite' AND p.status = 'approved'
            """, (user_id,)) as cursor:
                presets = await cursor.fetchall()

        result = [{"id": row[0], "title": row[1], "mode": row[2], "players": row[3], "likes": row[4]} for row in presets]
        return web.json_response(result)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def get_profile_api(request):
    try:
        user_id = request.query.get('user_id')
        if not user_id:
            return web.json_response({"error": "User ID required"}, status=400)

        async with aiosqlite.connect(DB_FILE) as db:
            async with db.execute("SELECT username, presets_created, presets_approved FROM users WHERE user_id = ?", (user_id,)) as cursor:
                row = await cursor.fetchone()

            if not row:
                return web.json_response({"error": "User not found"}, status=404)

            async with db.execute("SELECT SUM(likes) FROM presets WHERE user_id = ?", (user_id,)) as cursor:
                likes_row = await cursor.fetchone()
                total_likes = likes_row[0] if likes_row and likes_row[0] else 0

        return web.json_response({
            "username": row[0],
            "created": row[1],
            "approved": row[2],
            "total_likes": total_likes
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def get_presets_api(request):
    try:
        mode_filter = request.query.get('mode')

        async with aiosqlite.connect(DB_FILE) as db:
            if mode_filter and mode_filter != 'All':
                async with db.execute("""
                    SELECT p.id, p.title, p.mode, p.players, p.likes, u.username
                    FROM presets p
                    LEFT JOIN users u ON p.user_id = u.user_id
                    WHERE p.status = 'approved' AND p.mode = ?
                """, (mode_filter,)) as cursor:
                    presets = await cursor.fetchall()
            else:
                async with db.execute("""
                    SELECT p.id, p.title, p.mode, p.players, p.likes, u.username
                    FROM presets p
                    LEFT JOIN users u ON p.user_id = u.user_id
                    WHERE p.status = 'approved'
                """) as cursor:
                    presets = await cursor.fetchall()

        result = [{"id": row[0], "title": row[1], "mode": row[2], "players": row[3], "likes": row[4], "author": row[5] or "Anonymous"} for row in presets]
        return web.json_response(result)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

# --- aiohttp Server ---
async def websocket_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    session_id = None

    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                data = json.loads(msg.data)
                if data.get('type') == 'register':
                    session_id = data.get('sessionId')
                    if session_id:
                        active_websockets[session_id] = ws
                        logging.info(f"Session {session_id} registered.")
    except Exception as e:
        logging.error(f"WebSocket error: {e}")
    finally:
        if session_id and session_id in active_websockets:
            del active_websockets[session_id]
            logging.info(f"Session {session_id} unregistered.")

    return ws

async def handle_cors(request):
    return web.Response(text="OK", headers={
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    })

async def app_middleware(app, handler):
    async def middleware_handler(request):
        response = await handler(request)
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
    return middleware_handler

app = web.Application(middlewares=[app_middleware])
app.router.add_get('/ws', websocket_handler)
app.router.add_post('/api/auth/generate', generate_auth_key_api)
app.router.add_get('/api/mode/check', check_mode_availability_api)
app.router.add_post('/api/publish', publish_preset_api)
app.router.add_get('/api/presets', get_presets_api)
app.router.add_post('/api/tma/apply', apply_preset_tma_api)
app.router.add_post('/api/interact', interact_preset_api)
app.router.add_post('/api/report', report_preset_api)
app.router.add_get('/health', health_check_api)
app.router.add_get('/api/bot_info', get_bot_info_api)
app.router.add_get('/api/favorites', get_favorites_api)
app.router.add_get('/api/my_presets', get_my_presets_api)
app.router.add_get('/api/profile', get_profile_api)
app.router.add_route('OPTIONS', '/{path:.*}', handle_cors)

# --- Keep Alive Task (Render Free Tier) ---
async def keep_alive():
    import aiohttp
    external_url = os.getenv("RENDER_EXTERNAL_URL")
    port = os.getenv("PORT", 8080)
    target_url = external_url if external_url else f"http://127.0.0.1:{port}/health"
    if external_url and not target_url.endswith('/health'):
        target_url = f"{external_url}/health"

    logging.info(f"Starting keep-alive task for {target_url}")

    while True:
        try:
            await asyncio.sleep(600) # Ping every 10 minutes
            async with aiohttp.ClientSession() as session:
                async with session.get(target_url) as response:
                    if response.status == 200:
                        logging.info("Keep-alive ping successful")
                    else:
                        logging.warning(f"Keep-alive ping failed with status: {response.status}")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logging.error(f"Keep-alive ping error: {e}")

# --- Runner ---
async def start_server():
    port = int(os.getenv("PORT", 8080))
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', port)
    await site.start()
    logging.info(f"aiohttp server started on port {port}")

async def main():
    await init_db()
    # Start web server
    asyncio.create_task(start_server())
    # Start keep-alive ping
    asyncio.create_task(keep_alive())
    # Start bot
    await dp.start_polling(bot)

if __name__ == '__main__':
    asyncio.run(main())
