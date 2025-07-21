const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const RETELL_API_KEY = process.env.RETELL_API_KEY;
const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID;

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

app.post('/webhook', async (req, res) => {
  try {
    const message = req.body.message?.text;
    const chatId = req.body.message?.chat.id;

    if (!message || !chatId) {
      console.warn('Mensaje o chatId inválido');
      return res.sendStatus(400);
    }

    console.log('📩 Webhook recibido:', req.body);

    const retellResponse = await axios.post(
      'https://api.retellai.com/chat-completion',
      {
        agent_id: RETELL_AGENT_ID,
        messages: [{ role: 'user', content: message }],
      },
      {
        headers: {
          Authorization: `Bearer ${RETELL_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const reply = retellResponse.data?.choices?.[0]?.message?.content || '[Sin respuesta]';

    console.log('✅ Respuesta Retell:', reply);

    await axios.post(TELEGRAM_API, {
      chat_id: chatId,
      text: reply,
    });

    res.sendStatus(200);
  } catch (err) {
    console.error('🔥 ERROR:', err?.response?.data || err.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🔥 Servidor funcionando en puerto ${PORT}`);
});

