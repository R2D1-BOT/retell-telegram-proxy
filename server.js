const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

// --- Configuración de Variables de Entorno ---
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const RETELL_API_KEY = process.env.RETELL_API_KEY;
const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID;

if (!TELEGRAM_BOT_TOKEN || !RETELL_API_KEY || !RETELL_AGENT_ID) {
    console.error("ERROR: ¡Faltan variables de entorno!");
    process.exit(1);
}

// --- Almacenamiento de Sesiones ---
const userSessions = {};

// --- Webhook de Telegram ---
app.post('/webhook', async (req, res) => {
  const { message } = req.body;

  if (!message || !message.text || !message.from || !message.from.id || !message.chat || !message.chat.id) {
    console.warn('Mensaje de Telegram inválido o sin texto recibido. Ignorando.');
    return res.status(200).send('Mensaje de Telegram inválido. Ignorado.');
  }

  const telegramUserId = message.from.id;
  const telegramChatId = message.chat.id;
  const userMessage = message.text;

  let retellChatId = userSessions[telegramUserId];

  try {
    // 1. Si NO tenemos un chat_id de Retell para este usuario, creamos uno nuevo.
    if (!retellChatId) {
      console.log(`[Usuario ${telegramUserId}] Creando nueva sesión Retell...`);
      const createChatResponse = await axios.post(
        'https://api.retellai.com/create-chat',
        {
          agent_id: RETELL_AGENT_ID,
        },
        {
          headers: {
            Authorization: `Bearer ${RETELL_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      retellChatId = createChatResponse.data.chat_id;
      userSessions[telegramUserId] = retellChatId;
      console.log(`[Usuario ${telegramUserId}] Nueva sesión creada: ${retellChatId}`);
    }

    // 2. Enviamos el mensaje del usuario a Retell AI
    const retellCompletionResponse = await axios.post(
      'https://api.retellai.com/create-chat-completion',
      {
        chat_id: retellChatId,
        content: userMessage,
      },
      {
        headers: {
          Authorization: `Bearer ${RETELL_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const botResponseMessages = retellCompletionResponse.data.messages;
    let botResponseText = '';
    for (const msg of botResponseMessages) {
      if (msg.content) {
        botResponseText += msg.content + ' ';
      }
    }
    botResponseText = botResponseText.trim();

    // 3. Enviamos la respuesta de vuelta al usuario
    if (botResponseText) {
      await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          chat_id: telegramChatId,
          text: botResponseText,
        }
      );
      console.log(`[Usuario ${telegramUserId}] Respuesta enviada exitosamente`);
    } else {
      await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          chat_id: telegramChatId,
          text: 'Disculpa, no pude generar una respuesta. Intenta de nuevo.',
        }
      );
    }

    res.status(200).send('Mensaje procesado correctamente.');

  } catch (error) {
    console.error(`[Usuario ${telegramUserId}] Error:`, error.response ? error.response.data : error.message);

    // Si la sesión es inválida, la borramos
    if (error.response && (error.response.status === 404 || error.response.status === 400)) {
      console.log(`[Usuario ${telegramUserId}] Sesión inválida, borrando...`);
      delete userSessions[telegramUserId];
    }

    // Mensaje de error al usuario
    try {
      await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          chat_id: telegramChatId,
          text: 'Hubo un problema. Intenta de nuevo.',
        }
      );
    } catch (telegramError) {
      console.error(`Error enviando mensaje a Telegram:`, telegramError.message);
    }

    // SIEMPRE responde 200 OK a Telegram
    res.status(200).send('Mensaje procesado (con error).');
  }
});

// --- Iniciar el Servidor ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Bot funcionando en puerto ${PORT}`);
});
