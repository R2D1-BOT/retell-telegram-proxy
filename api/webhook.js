// /api/webhook.js
export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { message } = req.body;
      if (!message || !message.text) return res.status(200).json({ ok: true });

      const chatId = message.chat.id;
      const userMessage = message.text;

      // 1. Crear sesión de chat
      const sessionRes = await fetch('https://api.retellai.com/v3/chat-session', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agent_id: process.env.RETELL_AGENT_ID,
        }),
      });

      const sessionData = await sessionRes.json();
      const chat_id = sessionData.chat_id;
      if (!chat_id) throw new Error('❌ Retell: no se pudo iniciar sesión de chat');

      // 2. Enviar mensaje del usuario
      const completionRes = await fetch('https://api.retellai.com/v3/chat-completion', {
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

      const completionData = await completionRes.json();
      const agentReply = completionData.messages?.at(-1)?.content || '🤖 No hay respuesta del agente.';

      // 3. Responder a Telegram
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
      console.error('❌ Error crítico:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).end();
}
