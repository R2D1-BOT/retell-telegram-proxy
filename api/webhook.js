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

      console.log(`📨 Mensaje recibido: ${userMessage}`);

      // 🔐 Petición a Retell AI CHAT (NO VOICE)
      const retellResponse = await fetch('https://api.retellai.com/v3/response-engine', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agent_id: process.env.RETELL_AGENT_ID,
          chat_id: `telegram-${chatId}`,  // sesión única por usuario
          content: userMessage
        })
      });

      const retellData = await retellResponse.json();
      console.log('📦 Retell response:', retellData);

      const agentResponse = retellData?.content || 'Lo siento, no entendí.';

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
      console.error('❌ Error crítico:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}

