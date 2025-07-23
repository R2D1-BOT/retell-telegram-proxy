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

// Store para información de usuarios (para tracking)
const userSessions = new Map();

// Función para procesar mensaje con Retell (adaptado para chat)
async function processMessageWithRetell(message, userId) {
    try {
        console.log(`🤖 Procesando mensaje con Retell: "${message}"`);
        
        // Primero creamos una sesión de chat
        const chatSession = await createChatSession(userId);
        console.log(`✅ Sesión creada: ${chatSession.chat_id}`);
        
        // Enviamos el mensaje
        await sendMessageToChat(chatSession.chat_id, message);
        
        // Esperamos la respuesta
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Obtenemos la respuesta actualizada
        const chatData = await getChatData(chatSession.chat_id);
        
        // Extraemos la respuesta del agente
        let agentResponse = "⚠️ Sin respuesta del agente";
        
        if (chatData && chatData.transcript) {
            console.log(`📋 Transcript completo: ${chatData.transcript}`);
            
            // Dividimos el transcript en líneas
            const lines = chatData.transcript.trim().split('\n');
            
            // Buscamos la última línea del agente
            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i].trim();
                if (line.startsWith('Agent:')) {
                    agentResponse = line.replace('Agent:', '').trim();
                    console.log(`✅ Respuesta encontrada: "${agentResponse}"`);
                    break;
                }
            }
        }
        
        return {
            success: true,
            response: agentResponse,
            chat_id: chatSession.chat_id,
            full_transcript: chatData?.transcript || "Sin transcript"
        };
        
    } catch (error) {
        console.error('❌ Error procesando mensaje:', error.response?.data || error.message);
        return {
            success: false,
            response: `🚨 Error: ${error.message}\n\n🔧 El agente de Retell funciona en Dashboard pero hay un problema de comunicación con Telegram.`,
            error: error.message
        };
    }
}

// Función para crear sesión de chat
async function createChatSession(userId) {
    try {
        const response = await axios.post(
            'https://api.retellai.com/create-chat',
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
        return response.data;
    } catch (error) {
        console.error('❌ Error creando sesión:', error.response?.data || error.message);
        throw error;
    }
}

// Función para enviar mensaje al chat
async function sendMessageToChat(chatId, message) {
    try {
        const response = await axios.post(
            'https://api.retellai.com/send-message',
            {
                chat_id: chatId,
                message: message
            },
            {
                headers: {
                    'Authorization': `Bearer ${RETELL_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error('❌ Error enviando mensaje:', error.response?.data || error.message);
        throw error;
    }
}

// Función para obtener datos del chat
async function getChatData(chatId) {
    try {
        const response = await axios.get(
            `https://api.retellai.com/get-chat/${chatId}`,
            {
                headers: {
                    'Authorization': `Bearer ${RETELL_API_KEY}`
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error('❌ Error obteniendo datos del chat:', error.response?.data || error.message);
        throw error;
    }
}

// Función para verificar si el agente de Retell está activo
async function verifyRetellAgent() {
    try {
        console.log(`🔍 Verificando agente ${RETELL_AGENT_ID}...`);
        
        const response = await axios.get(
            `https://api.retellai.com/get-agent/${RETELL_AGENT_ID}`,
            {
                headers: {
                    'Authorization': `Bearer ${RETELL_API_KEY}`
                }
            }
        );

        console.log('✅ Agente verificado en Retell');
        return response.data;
    } catch (error) {
        console.error('❌ Error verificando agente:', error.response?.data || error.message);
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

        // Guardar información del usuario
        userSessions.set(userId, {
            telegram_chat_id: chatId,
            last_message: userMessage,
            timestamp: new Date().toISOString()
        });

        try {
            // Procesar mensaje con Retell
            const result = await processMessageWithRetell(userMessage, userId);
            
            if (result.success) {
                console.log(`✅ Respuesta exitosa: "${result.response}"`);
                await sendTelegramMessage(chatId, result.response);
            } else {
                console.log(`❌ Error en respuesta: ${result.error}`);
                await sendTelegramMessage(chatId, result.response);
            }
            
        } catch (error) {
            console.error('❌ Error procesando mensaje:', error);
            await sendTelegramMessage(chatId, 
                `🚨 <b>Error de configuración</b>\n\n` +
                `⚠️ Problema conectando con Retell AI.\n` +
                `🔑 API Key: ${RETELL_API_KEY ? 'Configurada' : 'Faltante'}\n` +
                `🤖 Agent ID: ${RETELL_AGENT_ID}\n\n` +
                `<i>Error: ${error.message}</i>\n\n` +
                `💡 Nota: Retell AI está diseñado principalmente para agentes de VOZ (llamadas telefónicas).`
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
    const count = userSessions.size;
    userSessions.clear();
    console.log(`🧹 ${count} sesiones de usuario limpiadas`);
    res.json({ message: `${count} sesiones limpiadas` });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
    console.log(`🔗 Webhook URL: https://retell-telegram-proxy-production.up.railway.app/webhook`);
    console.log(`💚 Health check: https://retell-telegram-proxy-production.up.railway.app/health`);
    console.log('✅ Listo para recibir mensajes de Telegram');
});
