const fetch = require('node-fetch');

module.exports = async function handler(req, res) {
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

      // 🔐 Llamada segura a Retell AI
      const retellResponse = await fetch('https://api.retellai.com/v3/response-engine', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agent_id: process.env.RETELL_AGENT_ID,
          chat_id: `telegram-${chatId}`,
          content: userMessage
        })
      });

      // 🔍 Procesar respuesta: puede no ser JSON
      const responseText = await retellResponse.text();

      let retellData;
      try {
        retellData = JSON.parse(responseText);
      } catch (err) {
        console.error("❌ ERROR: Retell no devolvió JSON:", responseText);
        throw new Error("Retell respondió con HTML o un error no JSON.");
      }

      console.log('📦 Retell response:', retellData);

      const agentResponse = retellData?.content || 'Lo siento, no entendí.';

      // Enviar mensaje a Telegram
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
};
