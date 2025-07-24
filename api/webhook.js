const fetch = require('node-fetch');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return res.json({ 
      status: 'Bot + Retell Chat OK',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  }

  if (req.method === 'POST') {
    try {
      const { message } = req.body;
      if (!message || !message.text) {
        console.log('Mensaje recibido sin texto, ignorado.');
        return res.json({ ok: true });
      }

      const chatId = message.chat.id;
      const userMessage = message.text;
      const userName = message.from?.first_name || 'Usuario';
      console.log(`[${userName}] Mensaje recibido: "${userMessage}"`);

      if (!process.env.RETELL_API_KEY || !process.env.RETELL_AGENT_ID) {
        throw new Error('Faltan variables de entorno: RETELL_API_KEY o RETELL_AGENT_ID');
      }

      const retellResponse = await fetch('https://api.retellai.com/v2/create-chat-completion', {
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

      if (!retellResponse.ok) {
        const errorText = await retellResponse.text();
        console.error(`Error HTTP ${retellResponse.status}: ${errorText}`);

        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `Error del agente (${retellResponse.status}). Verifica tu configuración de Retell AI.`
          })
        });

        throw new Error(`Retell API error: ${retellResponse.status}`);
      }

      const responseText = await retellResponse.text();
      let retellData;

      try {
        retellData = JSON.parse(responseText);
        console.log('Respuesta válida de Retell:', retellData);
      } catch (err) {
        console.error("Respuesta no JSON desde Retell:", responseText.substring(0, 500));
        console.error("Posibles causas: API Key o Agent ID incorrectos");

        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: 'Error de configuración. Verifica tu API Key y Agent ID de Retell AI.'
          })
        });

        throw new Error("Respuesta inválida de Retell.");
      }

      const agentResponse = retellData?.content || retellData?.message || 'No se pudo generar respuesta.';
      console.log(`Respuesta generada: "${agentResponse.substring(0, 100)}${agentResponse.length > 100 ? '...' : ''}"`);

      const telegramResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: agentResponse,
          parse_mode: 'Markdown'
        })
      });

      if (!telegramResponse.ok) {
        const telegramError = await telegramResponse.text();
        console.error('Error enviando a Telegram:', telegramError);
        throw new Error(`Telegram error: ${telegramResponse.status}`);
      }

      console.log('Mensaje enviado exitosamente');
      return res.json({ ok: true });

    } catch (error) {
      console.error('Error crítico:', error.message);

      try {
        const { message } = req.body;
        if (message?.chat?.id) {
          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: message.chat.id,
              text: 'Temporalmente no puedo responder. Intenta más tarde.'
            })
          });
        }
      } catch (fallbackError) {
        console.error('Error en mensaje de fallback:', fallbackError.message);
      }

      return res.status(500).json({ 
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
};

