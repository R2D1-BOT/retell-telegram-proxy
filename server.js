const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const userChatMap = {}; // { telegram_user_id: retell_chat_id }

app.post('/webhook', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.text) return res.sendStatus(200);

    const telegramUserId = message.from.id.toString();
    const telegramChatId = message.chat.id;
    const userMsg = message.text;

    // 1️⃣ Crear sesión de chat en Retell si no existe
    if (!userChatMap[telegramUserId]) {
      const chatRes = await axios.post('https://api.retellai.com/v1/create-chat', {
        agent_id: process.env.RETELL_AGENT_ID,
        metadata: { telegram_user_id: telegramUserId }
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      userChatMap[telegramUserId] = chatRes.data.chat_id;
    }

    // 2️⃣ Mandar mensaje y obtener respuesta
    const completionRes = await axios.post('https://api.retellai.com/v1/create-chat-completion', {
      chat_id: userChatMap[telegramUserId],
      message: userMsg
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    // 3️⃣ Responder en Telegram
    const agentResponse = completionRes.data.messages[0].content;
    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: telegramChatId,
      text: agentResponse
    });

    return res.sendStatus(200);
  } catch (err) {
    console.error(err?.response?.data || err.message);
    return res.sendStatus(200); // No reintentes en Telegram, evita loop
  }
});

// Health check simple
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(process.env.PORT || 3000, () =>
  console.log('Bot escuchando en el puerto', process.env.PORT || 3000)
);
