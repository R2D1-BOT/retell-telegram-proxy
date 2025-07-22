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

// Mapping Telegram user_id → Retell chat_id (en memoria)
const userChats = new Map();

// Enviar mensaje a Telegram
async function sendTelegram(chat_id, text) {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id,
        text
    });
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
    // Tomar el primer mensaje del array
    if (res.data.messages && res.data.messages.length > 0) {
        return res.data.messages[0].content || '[Respuesta vacía del agente]';
    }
    return '[Sin respuesta del agente]';
}

// Webhook de Telegram
app.post('/webhook', async (req, res) => {
    try {
        const msg = req.body?.message;
        if (!msg || !msg.text) return res.sendStatus(200);

        const user_id = msg.from.id;
        const chat_id = msg.chat.id;
        const text = msg.text.trim();

        // Si usuario manda /end → borra la sesión y responde
        if (text === '/end') {
            userChats.delete(user_id);
            await sendTelegram(chat_id, 'Sesión de reserva finalizada. ¡Hasta pronto!');
            return res.sendStatus(200);
        }

        // Si no existe chat_id, crea uno nuevo
        let retellChatId = userChats.get(user_id);
        if (!retellChatId) {
            try {
                retellChatId = await createRetellChat();
                userChats.set(user_id, retellChatId);
            } catch (err) {
                await sendTelegram(chat_id, 'Error creando sesión de reserva. Inténtalo más tarde.');
                return res.sendStatus(200);
            }
        }

        // Envia mensaje del usuario a Retell y responde lo que diga el agente
        try {
            const agentReply = await sendRetellMessage(retellChatId, text);
            await sendTelegram(chat_id, agentReply);
        } catch (err) {
            await sendTelegram(chat_id, 'Error comunicando con el agente. Inténtalo más tarde.');
        }

        res.sendStatus(200);
    } catch (e) {
        res.sendStatus(500);
    }
});

// Healthcheck
app.get('/health', (req, res) => {
    res.json({ status: 'ok', users: userChats.size });
});

app.listen(PORT, () => {
    console.log('Bot escuchando en puerto', PORT);
});
