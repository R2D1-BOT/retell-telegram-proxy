const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

app.post('/webhook', async (req, res) => {
  const msg = req.body.message;
  if (!msg || !msg.text) return res.send('ok');

  try {
    const ret = await axios.post('https://api.retellai.com/v1/chat-completion', {
      agent_id: process.env.RETELL_AGENT_ID,
      session_id: msg.chat.id.toString(),
      message: msg.text
    }, {
      headers: { Authorization: `Bearer ${process.env.RETELL_API_KEY}` }
    });

    const reply = ret.data.message || 'Lo siento, no tengo respuesta.';
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: msg.chat.id,
      text: reply
    });

    res.send('ok');
  } catch (e) {
    console.error(e.response?.data || e.message);
    res.send('ok');
  }
});

// ESTA LÍNEA ERA CRÍTICA — PARA EXPONER EN RAILWAY
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔥 Servidor funcionando en puerto ${PORT}`));
