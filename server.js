const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para parsear JSON
app.use(express.json());

// Variables de entorno con validación
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const RETELL_API_KEY = process.env.RETELL_API_KEY;
const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID;

if (!TELEGRAM_BOT_TOKEN || !RETELL_API_KEY || !RETELL_AGENT_ID) {
    console.error('❌ Error: Faltan variables de entorno requeridas');
    console.error('TELEGRAM_BOT_TOKEN:', TELEGRAM_BOT_TOKEN ? '✅ Configurado' : '❌ Faltante');
    console.error('RETELL_API_KEY:', RETELL_API_KEY ? '✅ Configurado' : '❌ Faltante');
    console.error('RETELL_AGENT_ID:', RETELL_AGENT_ID ? '✅ Configurado' : '❌ Faltante');
    process.exit(1);
}

console.log('🚀 Iniciando servidor con configuración:');
console.log('📱 Agent ID:', RETELL_AGENT_ID);
console.log('🔑 API Key configurada:', RETELL_API_KEY ? 'Sí' : 'No');

// Store para sesiones de chat activas
const activeChatSessions = new Map();

// Función para crear una sesión de chat en Retell
async function createChatSession(userId) {
    try {
        console.log(`🔄 Creando sesión de chat para usuario ${userId}...`);
        
        const response = await axios.post(
            'https://api.retellai.com/v2/create-chat',
            {
                agent_id: RETELL_AGENT_ID,
                metadata: {
                    telegram_user_id: userId.toString(),
                    created_at: new Date().toISOString()
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${RETELL_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ Sesión de chat creada:', response.data.chat_id);
        return response.data;
    } catch (error) {
        console.error('❌ Error creando sesión de chat:', error.response?.data || error.message);
        throw error;
    }
}

// Función para enviar mensaje al chat de Retell
async function sendMessageToRetell(chatId, message) {
    try {
        console.log(`📤 Enviando mensaje a chat ${chatId}: "${message}"`);
        
        const response = await axios.post(
            `https://api.retellai.com/v2/send-message`,
            {
                chat_id: chatId,
                text: message
            },
            {
                headers: {
                    'Authorization': `Bearer ${RETELL_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ Mensaje enviado a Retell');
        return response.data;
    } catch (error) {
        console.error('❌ Error enviando mensaje:', error.response?.data || error.message);
        throw error;
    }
}

// Función para obtener respuesta del chat
async function getChatResponse(chatId) {
    try {
        console.log(`📥 Obteniendo respuesta del chat ${chatId}...`);
        
        const response = await axios.get(
            `https://api.retellai.com/v2/get-chat/${chatId}`,
            {
                headers: {
                    'Authorization': `Bearer ${RETELL_API_KEY}`
                }
            }
        );

        console.log('✅ Respuesta obtenida de Retell');
        return response.data;
    } catch (error) {
        console.error('❌ Error obteniendo respuesta:', error.response?.data || error.message);
        throw error;
    }
}

// Función para enviar mensaje de Telegram
async function sendTelegramMessage(chatId, text) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML'
        });
        console.log(`✅ Mensaje enviado a Telegram chat ${chatId}`);
    } catch (error) {
        console.error('❌ Error enviando mensaje a Telegram:', error.response?.data || error.message);
    }
}

// Endpoint de health check
app.get('/health', (req, res) => {
    res.json({
        status: '✅ Servidor funcionando',
        version: '2.0 - Chat API Support',
        timestamp: new Date().toISOString(),
        config: {
            retell_agent_id: RETELL_AGENT_ID,
            api_key_configured: !!RETELL_API_KEY,
            bot_token_configured: !!TELEGRAM_BOT_TOKEN,
            active_sessions: activeChatSessions.size
        }
    });
});

// Webhook principal de Telegram
app.post('/webhook', async (req, res) => {
    try {
        console.log('📨 Webhook recibido:', JSON.stringify(req.body, null, 2));
        
        const message = req.body.message;
        if (!message || !message.text) {
            console.log('⚠️ Mensaje sin texto, ignorando');
            return res.status(200).send('OK');
        }

        const chatId = message.chat.id;
        const userId = message.from.id;
        const userMessage = message.text;
        
        console.log(`👤 Usuario ${userId} en chat ${chatId}: "${userMessage}"`);

        // Verificar si ya existe una sesión activa para este usuario
        let chatSession = activeChatSessions.get(userId);
        
        if (!chatSession) {
            console.log(`🆕 Creando nueva sesión para usuario ${userId}`);
            try {
                chatSession = await createChatSession(userId);
                activeChatSessions.set(userId, chatSession);
            } catch (error) {
                console.error('❌ Error creando sesión:', error);
                await sendTelegramMessage(chatId, 
                    `🚨 <b>Error de configuración</b>\n\n` +
                    `⚠️ No se pudo crear la sesión de chat.\n` +
                    `🔑 API Key: ${RETELL_API_KEY ? 'Configurada' : 'Faltante'}\n` +
                    `🤖 Agent ID: ${RETELL_AGENT_ID}\n\n` +
                    `Por favor, verifica la configuración en el dashboard de Retell.`
                );
                return res.status(200).send('OK');
            }
        }

        try {
            // Enviar mensaje a Retell
            await sendMessageToRetell(chatSession.chat_id, userMessage);
            
            // Esperar un poco para que Retell procese
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Obtener la respuesta
            const chatData = await getChatResponse(chatSession.chat_id);
            
            // Extraer la última respuesta del agente del transcript
            let agentResponse = "🤖 Procesando respuesta...";
            
            if (chatData.transcript) {
                const lines = chatData.transcript.split('\n');
                const agentLines = lines.filter(line => line.startsWith('Agent:'));
                if (agentLines.length > 0) {
                    agentResponse = agentLines[agentLines.length - 1].replace('Agent: ', '');
                }
            }
            
            console.log(`🤖 Respuesta del agente: "${agentResponse}"`);
            
            // Enviar respuesta a Telegram
            await sendTelegramMessage(chatId, agentResponse);
            
        } catch (error) {
            console.error('❌ Error en el flujo de chat:', error);
            await sendTelegramMessage(chatId, 
                `🚨 <b>Error de comunicación</b>\n\n` +
                `⚠️ No se pudo procesar tu mensaje.\n` +
                `🔄 Intenta de nuevo en unos segundos.\n\n` +
                `<i>Error: ${error.message}</i>`
            );
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('❌ Error general en webhook:', error);
        res.status(500).send('Error interno del servidor');
    }
});

// Endpoint para limpiar sesiones (opcional, para debugging)
app.post('/clear-sessions', (req, res) => {
    const count = activeChatSessions.size;
    activeChatSessions.clear();
    console.log(`🧹 ${count} sesiones limpiadas`);
    res.json({ message: `${count} sesiones limpiadas` });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
    console.log(`🔗 Webhook URL: https://retell-telegram-proxy-production.up.railway.app/webhook`);
    console.log(`💚 Health check: https://retell-telegram-proxy-production.up.railway.app/health`);
    console.log('✅ Listo para recibir mensajes de Telegram');
});
