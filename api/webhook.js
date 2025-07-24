export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.json({ status: 'Bot + Retell OK' });
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
      console.log(`🔑 API Key exists: ${!!process.env.RETELL_API_KEY}`);
      console.log(`🤖 Agent ID exists: ${!!process.env.RETELL_AGENT_ID}`);

      // Llamada a Retell AI
      console.log('🚀 Llamando a Retell...');
      const retellResponse = await fetch('https://api.retellai.com/v2/create-phone-call', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from_number: "+1234567890",
          to_number: "+0987654321", 
          agent_id: process.env.RETELL_AGENT_ID,
          metadata: {
            telegram_chat_id: chatId,
            user_message: userMessage
          }
        })
      });

      console.log(`📊 Retell status: ${retellResponse.status}`);
      const retellData = await retellResponse.json();
      console.log('📦 Retell response:', retellData);
      
      // Responder a Telegram
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `🤖 Procesado con Retell: "${userMessage}" - ID: ${retellData.call_id || 'error'}`
        })
      });

      return res.json({ ok: true });

    } catch (error) {
      console.error('❌ Error completo:', error);
      return res.status(500).json({ error: error.message });
    }
  }
}
