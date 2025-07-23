const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Variables de entorno obligatorias
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const RETELL_API_KEY = process.env.RETELL_API_KEY;
const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID;

if (!TELEGRAM_BOT_TOKEN || !RETELL_API_KEY || !RETELL_AGENT_ID) {
    console.error('❌ Faltan variables de entorno');
    process.exit(1);
}

const userChats = new Map(); // user_id → chat_id

// 🟢 Enviar mensaje a Telegram
async function sendTelegram(chat_id, text) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id,
            text
        });
        console.log(`✅ Enviado a ${chat_id}: "${text}"`);
    } catch (err) {
        console.error('❌ Error enviando a Telegram:', err?.response?.data || err.message);
    }
}

// 🔁 Crear nueva sesión en Retell
async function createRetellChat() {
    const res = await axios.post(
        'https://api.retellai.com/create-chat',
        { agent_id: RETELL_AGENT_ID },
        { headers: { Authorization: `Bearer ${RETELL_API_KEY}` } }
    );
    return res.data.chat_id;
}

// 📩 Enviar mensaje al agente Retell
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

// 🚀 Webhook de Telegram
app.post('/webhook', async (req, res) => {
    try {
        const msg = req.body?.message;
        if (!msg || !msg.text) return res.sendStatus(200);

        const user_id = msg.from.id;
        const chat_id = msg.chat.id;
        const text = msg.text.trim();

        console.log(`📩 Usuario ${user_id} en chat ${chat_id}: "${text}"`);

        // Comando para cerrar sesión
        if (text.toLowerCase() === '/end') {
            userChats.delete(user_id);
            await sendTelegram(chat_id, 'Sesión finalizada. ¡Hasta pronto!');
            return res.sendStatus(200);
        }

        let retellChatId = userChats.get(user_id);

        if (!retellChatId) {
            try {
                retellChatId = await createRetellChat();
                userChats.set(user_id, retellChatId);
                console.log(`🔗 Nueva sesión Retell para user ${user_id}: ${retellChatId}`);
            } catch (err) {
                console.error('❌ Error creando chat Retell:', err?.response?.data || err.message);
                await sendTelegram(chat_id, 'Error creando sesión de reserva. Inténtalo más tarde.');
                return res.sendStatus(200);
            }
        }

        // Intento de envío al agente
        try {
            const agentReply = await sendRetellMessage(retellChatId, text);
            await sendTelegram(chat_id, agentReply);
        } catch (err) {
            console.error('⚠️ Error al enviar mensaje, intentando nueva sesión...');

            try {
                retellChatId = await createRetellChat();
                userChats.set(user_id, retellChatId);
                const agentReply = await sendRetellMessage(retellChatId, text);
                await sendTelegram(chat_id, agentReply);
            } catch (retryErr) {
                console.error('❌ Error tras reintento:', retryErr?.response?.data || retryErr.message);
                await sendTelegram(chat_id, 'Error comunicando con el agente. Inténtalo más tarde.');
            }
        }

        res.sendStatus(200);
    } catch (e) {
        console.error('❌ Error general en webhook:', e.message);
        res.sendStatus(500);
    }
});

// 🔍 Healthcheck
app.get('/health', (req, res) => {
    res.json({ status: 'ok', users: userChats.size });
});

app.listen(PORT, () => {
    console.log(`🚀 Bot escuchando en puerto ${PORT}`);
});

