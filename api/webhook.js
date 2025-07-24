// /api/webhook.js

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: '✅ Bot + Retell V3 Chat OK' });
  }

  if (req.method === 'POST') {
    try {
      const { message } = req.body;
      if (!message?.text) return res.status(200).json({ ok: true });

      const chatId = message.chat.id;
      const userMessage = message.text;

      // 1. Crear nueva sesión de chat
      const sessionRes = await fetch('https://api.retellai.com/v3/chat-session', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ agent_id: process.env.RETELL_AGENT_ID }),
      });
      const sessionData = await sessionRes.json();
      const chat_id = sessionData.chat_id;
      if (!chat_id) throw new Error('❌ Falló iniciar sesión Retell');

      // 2. Enviar mensaje al chat
      const replyRes = await fetch('https://api.retellai.com/v3/chat-completion', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ chat_id, message: userMessage }),
      });
      const replyData = await replyRes.json();
      const agentReply = replyData.messages?.slice(-1)[0]?.content || '🤖 Sin respuesta';

      // 3. Devolver respuesta a Telegram
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: agentReply }),
      });

      return res.status(200).json({ ok: true });

    } catch (err) {
      console.error('❌ Error crítico:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).end();
}

