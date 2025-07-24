export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.json({ status: 'Bot + Retell Chat OK' });
  }

  if (req.method === 'POST') {
    try {
      const { message } = req.body;

      if (!message || !message.text) {
        return res.json({ ok: true });
      }

      const chatId = message.chat.id;
      const userMessage = message.text;

      console.log(`📨 Mensaje: ${userMessage}`);

      // 1. Crear sesión de chat (siempre)
      const createChat = await fetch('https://api.retellai.com/v2/create-chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agent_id: process.env.RETELL_AGENT_ID,
          session_id: String(chatId)
        })
      });

      const chatData = await createChat.json();

      if (!chatData.chat_id) {
        throw new Error('Fallo en create-chat: ' + JSON.stringify(chatData));
      }

      // 2. Generar respuesta
      const chatCompletion = await fetch('https://api.retellai.com/v2/create-chat-completion', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: chatData.chat_id,
          user_input: userMessage
        })
      });

      const retellData = await chatCompletion.json();
      console.log('📦 Retell response:', retellData);

      const agentResponse = retellData?.content || 'Sin respuesta del agente';

      // 3. Responder a Telegram
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: agentResponse
        })
      });

      return res.json({ ok: true });

    } catch (error) {
      console.error('❌ Error:', error);
      return res.status(500).json({ error:
