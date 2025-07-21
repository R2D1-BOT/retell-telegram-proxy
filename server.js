const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const RETELL_API_KEY = process.env.RETELL_API_KEY;
const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID;

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

let activeChats = {}; // Guarda chat_id por user_id

// 🔹 Endpoint para recibir mensajes de Telegram
app.post('/webhook', async (req, res) => {
  try {
    const msg = req.body.message;
    const userId = msg.from.id;
    const userText = msg.text;

    // Si no hay chat Retell creado, crearlo
    if (!activeChats[userId]) {
      const chat = await axios.post(
        'https://api.retellai.com/v1/create-chat',
        { agent_id: RETELL_AGENT_ID },
        { headers: { Authorization: `Bearer ${RETELL_API_KEY}` } }
      );
      activeChats[userId] = chat.data.chat_id;
    }

    // Enviar mensaje a Retell y obtener respuesta
    const completion = await axios.post(
      'https://api.retellai.com/v1/create-chat-completion',
      {
        chat_id: activeChats[userId],
        messages: [{ role: 'user', content: userText }]
      },
      { headers: { Authorization: `Bearer ${RETELL_API_KEY}` } }
    );

    const responseText = completion.data.messages[0].content;

    // Enviar respuesta a Telegram
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: userId,
      text: responseText
    });

    res.sendStatus(200);
  } catch (err) {
    console.error('🔥 ERROR', err.response?.data || err.message);
    res.sendStatus(500);
  }
});

app.listen(8080, () => {
  console.log('🔥 Servidor funcionando en puerto 8080');
});
