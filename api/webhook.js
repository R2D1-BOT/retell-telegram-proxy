// /api/webhook.js

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: '✅ Bot + Retell V3 Chat OK' });
  }

  if (req.method === 'POST') {
    try {
      const { message } = req.body;
      if (!message || !message.text) return res.status(200).json({ ok: true });

      const chatId = message.chat.id;
      const userMessage = message.text;
      console.log(`📨 Mensaje Telegram: ${userMessage}`);

      // Paso 1: crear sesión de chat
      const startChat = await fetch('https://api.retellai.com/v3/response-engine/start-chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agent_id: process.env.RETELL_AGENT_ID
        })
      });

      const startChatData = await startChat.json();
      const chat_id = startChatData.chat_id;
      if (!chat_id) throw new Error('No se pudo crear la sesión de chat con Retell');

      // Paso 2: enviar mensaje del usuario
      const sendMessage = await fetch('https://api.retellai.com/v3/response-engine/send-message', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id,
          content: userMessage
        })
      });

      const responseData = await sendMessage.json();
      const agentReply = responseData.messages?.[responseData.messages.length - 1]?.content || '🤖 No se pudo generar respuesta';
      console.log('🤖 Respuesta Retell:', agentReply);

      // Paso 3: responder a Telegram
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: agentReply
        })
      });

      return res.status(200).json({ ok: true });

    } catch (err) {
      console.error('❌ Error:', err);
      return res.status(500).json({ error: err.message });
    }
  } else {
    res.status(405).end();
  }
}
