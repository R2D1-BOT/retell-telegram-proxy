const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para parsear JSON
app.use(express.json());

// Variables de entorno
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const RETELL_API_KEY = process.env.RETELL_API_KEY;
const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID;

if (!TELEGRAM_BOT_TOKEN || !RETELL_API_KEY || !RETELL_AGENT_ID) {
    console.error('❌ Faltan variables de entorno');
    process.exit(1);
}

// Tiempo sin actividad para cerrar sesión (30 segundos)
const SESSION_TIMEOUT = 30 * 1000;

// Map para sesiones: user_id → { chatId, timeoutId }
const userSessions = new Map();

// Enviar mensaje a Telegram
async function sendTelegram(chat_id, text) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id,
            text
        });
    } catch (error) {
        console.error('Error enviando mensaje a Telegram:', error.message);
    }
}

// Crear chat en Retell
async function createRetellChat() {
    const res = await axios.post(
        'https://api.retellai.com/create-chat',
        { agent_id: RETELL_AGENT_ID },
        { headers: { Authorization: `Bearer ${RETELL_API_KEY}` } }
    );
    return res.data.chat_id;
}

// Enviar mensaje al agente Retell
async function sendRetellMessage(chat_id, content) {
    const res = await axios.post(
        'https://api.retellai.com/create-chat-completion',
        { chat_id, content },
        { headers: { Authorization: `Bearer ${RETELL_API_KEY}` } }
    );
    if (res.data.messages && res.data.messages.length > 0) {
        return res.data.messages[0].content || '[Respuesta vacía del agente]';
    }
    return '[Sin respuesta del agente]';
}

// Función para cerrar sesión tras timeout
function closeSession(user_id, chat_id, telegram_chat_id) {
    userSessions.delete(user_id);
    sendTelegram(telegram_chat_id, '⏰ Sesión cerrada por inactividad. Si quieres, puedes iniciar otra reserva.');
    console.log(`Sesión cerrada automáticamente para usuario ${user_id}`);
}

// Webhook Telegram
app.post('/webhook', async (req, res) => {
    try {
        const msg = req.body?.message;
        if (!msg || !msg.text) return res.sendStatus(200);

        const user_id = msg.from.id;
        const telegram_chat_id = msg.chat.id;
        const text = msg.text.trim();

        // Comando para cerrar sesión manualmente
        if (text === '/end') {
            if (userSessions.has(user_id)) {
                clearTimeout(userSessions.get(user_id).timeoutId);
                userSessions.delete(user_id);
            }
            await sendTelegram(telegram_chat_id, 'Sesión de reserva finalizada. ¡Hasta pronto!');
            return res.sendStatus(200);
        }

        let session = userSessions.get(user_id);

        // Crear chat Retell si no existe
        if (!session) {
            try {
                const retellChatId = await createRetellChat();
                session = { chatId: retellChatId, timeoutId: null };
                userSessions.set(user_id, session);
            } catch (err) {
                await sendTelegram(telegram_chat_id, 'Error creando sesión de reserva. Inténtalo más tarde.');
                return res.sendStatus(200);
            }
        } else {
            // Reiniciar timeout si ya hay sesión
            clearTimeout(session.timeoutId);
        }

        // Enviar mensaje a Retell
        try {
            const agentReply = await sendRetellMessage(session.chatId, text);
            await sendTelegram(telegram_chat_id, agentReply);
        } catch (err) {
            await sendTelegram(telegram_chat_id, 'Error comunicando con el agente. Inténtalo más tarde.');
        }

        // Programar cierre automático de sesión
        session.timeoutId = setTimeout(() => {
            closeSession(user_id, session.chatId, telegram_chat_id);
        }, SESSION_TIMEOUT);

        res.sendStatus(200);
    } catch (e) {
        console.error('Error en webhook:', e);
        res.sendStatus(500);
    }
});

// Healthcheck
app.get('/health', (req, res) => {
    res.json({ status: 'ok', active_sessions: userSessions.size });
});

app.listen(PORT, () => {
    console.log(`Bot escuchando en puerto ${PORT}`);
});
