const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

// Mapeo usuario Telegram → chat_id de Retell
const userChatMap = {};

app.post('/webhook', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.text) return res.sendStatus(200);

    const telegramUserId = message.from.id.toString();
    const telegramChatId = message.chat.id;
    const userMsg = message.text;

    // 1️⃣ Crear sesión de chat en Retell si no existe para este usuario
    if (!userChatMap[telegramUserId]) {
      const chatRes = await axios.post(
        'https://api.retellai.com/v1/create-chat',      // URL ABSOLUTA, NUNCA LOCAL
        {
          agent_id: process.env.RETELL_AGENT_ID,
          metadata: { telegram_user_id: telegramUserId }
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      userChatMap[telegramUserId] = chatRes.data.chat_id;
    }

    // 2️⃣ Mandar mensaje y obtener respuesta del agente Retell
    const completionRes = await axios.post(
      'https://api.retellai.com/v1/create-chat-completion',   // URL ABSOLUTA
      {
        chat_id: userChatMap[telegramUserId],
        message: userMsg
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // 3️⃣ Responder en Telegram
    const agentResponse = completionRes.data.messages[0].content || 'Sin respuesta del agente.';
    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: telegramChatId,
        text: agentResponse
      }
    );

    return res.sendStatus(200);
  } catch (err) {
    // Log detallado para troubleshooting
    if (err.response) {
      console.error('ERROR:', err.response.status, err.response.data);
    } else {
      console.error('ERROR:', err.message);
    }
    // Mensaje al usuario
    const telegramChatId = req.body?.message?.chat?.id;
    if (telegramChatId) {
      await axios.post(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          chat_id: telegramChatId,
          text: '⚠️ Servicio temporalmente no disponible\n\nLo siento, hay un problema de conectividad con el sistema de IA. Por favor, inténtalo de nuevo en unos momentos.\n\nTu mensaje: "' +
            (req.body?.message?.text || '') + '"'
        }
      );
    }
    return res.sendStatus(200);
  }
});

// Health check endpoint para Railway
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(process.env.PORT || 3000, () =>
  console.log('Bot escuchando en el puerto', process.env.PORT || 3000)
);
