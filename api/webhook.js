// api/webhook.js
const fetch = require('node-fetch');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    console.log('🔵 [GET] Petición GET recibida. Webhook está vivo.');
    return res.json({ status: 'Bot de Telegram con Retell AI OK. Webhook listo para escuchar.' });
  }

  if (req.method === 'POST') {
    try {
      const { message } = req.body;
      console.log('🔵 [POST] Petición POST de Telegram recibida. Cuerpo completo:', JSON.stringify(req.body, null, 2));

      if (!message || !message.text) {
        console.log('⚠️ Mensaje de Telegram sin texto o vacío, ignorando y respondiendo OK a Telegram.');
        return res.json({ ok: true });
      }

      const chatId = message.chat.id;
      const userMessage = message.text;
      console.log(`📨 Mensaje recibido de Telegram (Chat ID: ${chatId}): "${userMessage}"`);

      // URL CORRECTA para Retell AI Chat Completions
      const retellApiUrl = 'https://api.retellai.com/v3/chat/completions';
      const retellApiKey = process.env.RETELL_API_KEY;
      const retellAgentId = process.env.RETELL_AGENT_ID;
      const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;

      console.log(`📡 Preparando petición a Retell AI: ${retellApiUrl}`);

      const retellPayload = {
        agent_id: retellAgentId, // Asegúrate de que este agent_id se usa
        chat_id: `telegram-${chatId}`,
        content: userMessage
      };

      console.log('   Cuerpo de la petición a Retell AI:', JSON.stringify(retellPayload));

      const retellResponse = await fetch(retellApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${retellApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(retellPayload)
      });

      if (!retellResponse.ok) {
        const errorDetails = await retellResponse.text();
        console.error(`❌ ERROR de Retell AI (${retellResponse.status}): ${errorDetails}`);
        await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `Lo siento, el motor de IA de Retell tuvo un error (${retellResponse.status}): ${errorDetails.substring(0, 100)}...`
          })
        }).catch(tgError => console.error('❌ Error al notificar a Telegram sobre el error de Retell:', tgError));
        return res.status(500).json({ error: `Retell AI API error: ${errorDetails}` });
      }

      const retellData = await retellResponse.json();
      console.log('✅ Respuesta completa de Retell AI:', JSON.stringify(retellData, null, 2));

      const agentMessages = retellData.messages;
      let agentResponseContent = "Disculpa, no pude generar una respuesta clara.";

      if (agentMessages && agentMessages.length > 0) {
        const lastAgentMessage = agentMessages.find(msg => msg.role === 'agent' && msg.content);
        if (lastAgentMessage) {
          agentResponseContent = lastAgentMessage.content;
        } else {
          console.warn('⚠️ Retell AI devolvió mensajes, pero no se encontró un mensaje de agente con contenido.');
        }
      } else {
        console.warn('⚠️ Retell AI no devolvió la estructura esperada de "messages" o estaba vacía.');
      }

      console.log(`💬 Contenido de respuesta para Telegram: "${agentResponseContent}"`);

      const telegramSendUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
      console.log(`🚀 Enviando respuesta a Telegram: ${telegramSendUrl}`);

      const telegramSendResponse = await fetch(telegramSendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: agentResponseContent,
          parse_mode: 'Markdown'
        })
      });

      if (!telegramSendResponse.ok) {
        const tgErrorText = await telegramSendResponse.text();
        console.error(`❌ ERROR al enviar mensaje a Telegram (${telegramSendResponse.status}): ${tgErrorText}`);
        throw new Error(`Telegram sendMessage error: ${tgErrorText}`);
      }

      console.log(`✅ Mensaje enviado con éxito a Telegram (Chat ID: ${chatId})`);
      return res.json({ ok: true });

    } catch (error) {
      console.error('🔥 ERROR CRÍTICO en el webhook:', error);
      const chatId = req.body?.message?.chat?.id;
      if (chatId) {
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: "Lo siento, ha ocurrido un error interno. Por favor, inténtalo de nuevo más tarde."
          })
        }).catch(tgError => console.error('❌ Error al enviar mensaje de error a Telegram:', tgError));
      }
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
};
