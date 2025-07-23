const userSessions = {};

// Endpoint webhook Telegram
app.post('/webhook', async (req, res) => {
  const userId = req.body.message.from.id;
  const message = req.body.message.text;

  try {
    // Crear chat solo si no existe
    if (!userSessions[userId]) {
      const createRes = await axios.post('https://api.retellai.com/create-chat', {
        agent_id: RETELL_AGENT_ID
      }, {
        headers: { Authorization: `Bearer ${RETELL_API_KEY}` }
      });

      userSessions[userId] = {
        chat_id: createRes.data.chat_id,
        last_interaction: Date.now()
      };
    }

    // Reutilizar chat_id existente para mantener contexto
    const chatId = userSessions[userId].chat_id;

    const completionRes = await axios.post('https://api.retellai.com/create-chat-completion', {
      chat_id: chatId,
      content: message
    }, {
      headers: { Authorization: `Bearer ${RETELL_API_KEY}` }
    });

    // Envía respuesta a Telegram
    const reply = completionRes.data.messages[0].content;
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: req.body.message.chat.id,
      text: reply
    });

    userSessions[userId].last_interaction = Date.now();

    res.sendStatus(200);
  } catch (error) {
    console.error('ERROR:', error);
    res.sendStatus(500);
  }
});
