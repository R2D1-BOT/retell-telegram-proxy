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

      // 🔁 Paso 1: crear sesión
      const startSession = await fetch('https://api.retellai.com/v3/chat-session', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agent_id: process.env.RETELL_AGENT_ID,
        }),
      });

      const sessionData = await startSession.json();
      const chat_id = sessionData.chat_id;
      if (!chat_id) throw new Error('❌ No se pudo iniciar sesión de chat');

      // 💬 Paso 2: enviar mensaje
      const sendMessage = await fetch('https://api.retellai.com/v3/chat-completion', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id,
          message: userMessage,
        }),
      });

      const response = await sendMessage.json();
      const agentReply = response.messages?.at(-1)?.content || '🤖 Sin respuesta';

      // 📤 Paso 3: responder en Telegram
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: agentReply,
        }),
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
