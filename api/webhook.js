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

      // Llamada a Retell AI Chat
      const retellResponse = await fetch('https://api.retellai.com/create-chat-completion', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: process.env.RETELL_AGENT_ID,
          content: userMessage
        })
      });

      const retellData = await retellResponse.json();
      console.log('📦 Retell response:', retellData);
      
      // Obtener respuesta del agente
      const agentResponse = retellData.messages?.[retellData.messages.length - 1]?.content || 'Error en respuesta';
      
      // Responder a Telegram
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
      return res.status(500).json({ error: error.message });
    }
  }
}
