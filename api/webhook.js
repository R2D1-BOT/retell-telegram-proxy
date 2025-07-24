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

      console.log(`📨 Mensaje recibido de Telegram: ${userMessage}`);

      // Paso 1: Crear sesión en Retell AI
      const sessionResponse = await fetch('https://api.retellai.com/v2/create-chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agent_id: process.env.RETELL_AGENT_ID,
          session_id: `telegram_${chatId}`
        })
      });

      const sessionData = await sessionResponse.json();

      if (!sessionData.chat_id) {
        console.error('❌ Fallo al crear sesión en Retell:', sessionData);
        throw new Error('Error en create-chat');
      }

      // Paso 2: Generar respuesta
      const completionResponse = await fetch('https://api.retellai.com/v2/create-chat-completion', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: sessionData.chat_id,
          content: userMessage
        })
      });

      const completionData = await completionResponse.json();
      console.log('📦 Respuesta de Retell:', completionData);

      const agentReply = completionData?.messages?.[completionData.messages.length - 1]?.content || '🤖 No hay respuesta del agente.';

      // Paso 3: Enviar respuesta a Telegram
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: agentReply
        })
      });

      return res.json({ ok: true });

    } catch (error) {
      console.error('🔥 ERROR CRÍTICO:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
};

