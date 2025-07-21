const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const RETELL_API_KEY = process.env.RETELL_API_KEY;
const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID;

app.use(bodyParser.json());

app.post('/webhook', async (req, res) => {
  try {
    const message = req.body.message;
    if (!message || !message.text) return res.sendStatus(200);

    const userMessage = message.text;
    const chatId = message.chat.id;

    console.log('📩 Webhook recibido:', JSON.stringify(req.body, null, 2));

    const retellResponse = await axios.post(
      'https://api.retellai.com/v1/chat-completion',
      {
        agent_id: RETELL_AGENT_ID,
        messages: [
          {
            role: 'user',
            content: userMessage
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${RETELL_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const responseText = retellResponse.data.choices[0].message.content;

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: responseText
    });

    res.sendStatus(200);
  } catch (error) {
    console.error('🔥 ERROR:', error.response?.data || error.message);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log(`🔥 Servidor funcionando en puerto ${PORT}`);
});


