const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser'); // Para parsear el cuerpo de las peticiones JSON
require('dotenv').config(); // <-- Esto carga las variables de tu archivo .env

const app = express();
app.use(bodyParser.json()); // Habilita Express para leer JSON en el cuerpo de las peticiones

// --- Configuración de Variables de Entorno (¡Método SEGURO!) ---
// Estas variables se leerán desde tu archivo .env LOCALMENTE
// Y desde la configuración de variables de entorno en Reiwah cuando despliegues.
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const RETELL_API_KEY = process.env.RETELL_API_KEY;
const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID;

// Verifica si las variables se cargaron correctamente (útil para depuración)
if (!TELEGRAM_BOT_TOKEN || !RETELL_API_KEY || !RETELL_AGENT_ID) {
    console.error("ERROR: ¡Faltan variables de entorno! Asegúrate de tener un archivo .env o configurarlas en tu entorno de despliegue.");
    process.exit(1); // Sale del proceso si faltan variables críticas
}

// --- Almacenamiento de Sesiones (¡SOLO PARA PRUEBAS/DESARROLLO LOCAL!) ---
// En PRODUCCIÓN con Reiwah, DEBES usar una base de datos o Redis
// para persistir las sesiones entre reinicios del servidor o si Reiwah escala tu app.
const userSessions = {}; // Formato: { telegram_user_id: retell_chat_id }

// --- Webhook de Telegram ---
app.post('/webhook', async (req, res) => { // <-- ¡IMPORTANTE! Aquí debe estar 'async'
  const { message } = req.body;

  // Validar que el mensaje de Telegram sea válido y contenga texto.
  if (!message || !message.text || !message.from || !message.from.id || !message.chat || !message.chat.id) {
    console.warn('Mensaje de Telegram inválido o sin texto recibido. Ignorando.', req.body);
    return res.status(200).send('Mensaje de Telegram inválido. Ignorado.');
  }

  const telegramUserId = message.from.id;
  const telegramChatId = message.chat.id;
  const userMessage = message.text;

  let retellChatId = userSessions[telegramUserId];

  try {
    // 1. Si NO tenemos un chat_id de Retell para este usuario, creamos uno nuevo.
    if (!retellChatId) {
      console.log(`[Usuario ${telegramUserId}] No se encontró sesión Retell. Creando una nueva...`);
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
      console.log(`[Usuario ${telegramUserId}] Nueva sesión Retell creada: ${retellChatId}`);
    } else {
      console.log(`[Usuario ${telegramUserId}] Usando sesión Retell existente: ${retellChatId}`);
    }

    // 2. Enviamos el mensaje del usuario a Retell AI usando el chat_id correcto.
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

    console.log(`[Usuario ${telegramUserId}] Respuesta cruda de Retell: ${JSON.stringify(retellCompletionResponse.data)}`);

    // 3. Enviamos la respuesta de Retell de vuelta al usuario de Telegram.
    if (botResponseText) {
      await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          chat_id: telegramChatId,
          text: botResponseText,
        }
      );
    } else {
      console.warn(`[Usuario ${telegramUserId}] Retell no devolvió contenido de respuesta válido.`);
      await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          chat_id: telegramChatId,
          text: 'Disculpa, no pude generar una respuesta en este momento. Intenta de nuevo.',
        }
      );
    }

    // Siempre responde 200 OK a Telegram para indicar que el mensaje fue recibido.
    res.status(200).send('Mensaje procesado correctamente.');

  } catch (error) { // <-- ESTE es el bloque catch correcto para tu try
    console.error(`[Usuario ${telegramUserId}] Error al procesar mensaje:`, error.response ? error.response.data : error.message);

    // Si Retell indica que la sesión ha terminado o es inválida (ej. 400 Bad Request),
    // borramos el chat_id localmente para forzar una nueva sesión en la próxima interacción.
    if (error.response && error.response.status) {
        if (error.response.status === 404) {
            console.log(`[Usuario ${telegramUserId}] Recibido 404 Not Found de Retell. Borrando chat_id almacenado para forzar nueva sesión.`);
            delete userSessions[telegramUserId];
        } else if (error.response.status === 400 && error.response.data.message && error.response.data.message.includes('chat_id is not found or has ended')) {
            console.log(`[Usuario ${telegramUserId}] Sesión Retell terminada o inválida (mensaje específico). Borrando chat_id almacenado.`);
            delete userSessions[telegramUserId];
        }
    }

    // Envía un mensaje de error genérico al usuario de Telegram.
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: telegramChatId,
        text: '¡Vaya! Hubo un problema al conectar con el asistente. Por favor, intenta de nuevo.',
      }
    );
    
    // --- ¡CRÍTICO! SIEMPRE RESPONDE 200 OK A TELEGRAM, incluso con error interno. ---
    res.status(200).send('Mensaje de Telegram procesado (con error interno).');
  } // <-- ¡Cierre correcto del try/catch!
}); // <-- ¡Cierre correcto del app.post!

// --- Iniciar el Servidor ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
  console.log('--- Recordatorio para despliegue en Reiwah (o similar): ---');
  console.log('1. Asegúrate de que el archivo .env NO esté en tu GitHub (.gitignore).');
  console.log('2. Configura TELEGRAM_BOT_TOKEN, RETELL_API_KEY y RETELL_AGENT_ID como variables de entorno directamente en la plataforma de Reiwah.');
  console.log('3. En Reiwah, tu webhook de Telegram apuntará a la URL de tu despliegue (ej. https://tucodigo.reiwah.com/webhook).');
});
