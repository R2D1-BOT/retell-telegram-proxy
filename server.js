const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const RETELL_API_KEY = process.env.RETELL_API_KEY;
const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID;

if (!TELEGRAM_BOT_TOKEN || !RETELL_API_KEY || !RETELL_AGENT_ID) {
    console.error('❌ Faltan variables de entorno');
    process.exit(1);
}

const SESSION_TIMEOUT = 30 * 1000;
const userSessions = new Map();

// Enviar mensaje a Telegram
async function sendTelegram(chatId, text) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text,
        });
    } catch (error) {
        console.error('❌ Error enviando mensaje a Telegram:', error.message);
    }
}

// Crear sesión Retell (sin /v1)
async function createRetellChat() {
    const res = await axios.post(
        'https://api.retellai.com/create-chat',
        { agent_id: RETELL_AGENT_ID },
        { headers: { Authorization: `Bearer ${RETELL_API_KEY}` } }
    );
    return res.data.chat_id;
}

// Enviar mensaje a Retell (también sin /v1)
async function sendRetellMessage(chatId, content) {
    const res = await axios.post(
        'https://api.retellai.com/create-chat-completion',
        { chat_id: chatId, content },
        { headers: { Authorization: `Bearer ${RETELL_API_KEY}` } }
    );
    if (res.data.messages && res.data.messages.length > 0) {
        return res.data.messages[0].content || '[Respuesta vacía del agente]';
    }
    return '[Sin respuesta del agente]';
}

// Cerrar sesión por inactividad
function closeSession(userId, telegramChatId) {
    userSessions.delete(userId);
    sendTelegram(telegramChatId, '⏰ Sesión cerrada por inactividad. Si quieres, puedes iniciar otra reserva.');
    console.log(`🕒 Sesión cerrada automáticamente para usuario ${userId}`);
}

// Webhook Telegram
app.post('/webhook', async (req, res) => {
    try {
        const msg = req.body?.message;
        if (!msg || !msg.text) return res.sendStatus(200);

        const userId = msg.from.id;
        const telegramChatId = msg.chat.id;
        const text = msg.text.trim();

        // Cierre manual
        if (text === '/end') {
            if (userSessions.has(userId)) {
                clearTimeout(userSessions.get(userId).timeoutId);
                userSessions.delete(userId);
            }
            await sendTelegram(telegramChatId, '✅ Sesión finalizada. ¡Hasta pronto!');
            return res.sendStatus(200);
        }

        let session = userSessions.get(userId);

        if (!session) {
            try {
                const chatId = await createRetellChat();
                session = { chatId, timeoutId: null };
                userSessions.set(userId, session);
            } catch (err) {
                console.error('❌ Error creando sesión Retell:', err.message);
                await sendTelegram(telegramChatId, 'Error creando la sesión. Inténtalo más tarde.');
                return res.sendStatus(200);
            }
        } else {
            clearTimeout(session.timeoutId);
        }

        try {
            const reply = await sendRetellMessage(session.chatId, text);
            await sendTelegram(telegramChatId, reply || '[Respuesta vacía]');
        } catch (err) {
            console.error('❌ Error Retell:', err.message);
            await sendTelegram(telegramChatId, 'Error comunicando con el agente. Inténtalo más tarde.');
        }

        session.timeoutId = setTimeout(() => {
            closeSession(userId, telegramChatId);
        }, SESSION_TIMEOUT);

        res.sendStatus(200);
    } catch (err) {
        console.error('❌ Error en webhook:', err.message);
        res.sendStatus(500);
    }
});

// Healthcheck
app.get('/health', (req, res) => {
    res.json({ status: 'ok', active_sessions: userSessions.size });
});

app.listen(PORT, () => {
    console.log(`✅ Bot escuchando en puerto ${PORT}`);
});
