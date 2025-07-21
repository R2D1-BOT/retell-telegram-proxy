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

// Validar que todas las variables estén presentes
if (!TELEGRAM_BOT_TOKEN || !RETELL_API_KEY || !RETELL_AGENT_ID) {
    console.error('❌ Faltan variables de entorno:');
    console.error('TELEGRAM_BOT_TOKEN:', !!TELEGRAM_BOT_TOKEN);
    console.error('RETELL_API_KEY:', !!RETELL_API_KEY);
    console.error('RETELL_AGENT_ID:', !!RETELL_AGENT_ID);
    process.exit(1);
}

console.log('✅ Variables de entorno cargadas correctamente');
console.log('🤖 Agent ID:', RETELL_AGENT_ID);

// URLs de las APIs
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const RETELL_API_BASE_URL = 'https://api.retellai.com';

// Función para enviar mensajes a Telegram
async function sendTelegramMessage(chatId, message) {
    try {
        const response = await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML'
        });
        console.log('📤 Mensaje enviado a Telegram:', message.substring(0, 50) + '...');
        return response.data;
    } catch (error) {
        console.error('❌ Error enviando mensaje a Telegram:', error.response?.data || error.message);
        throw error;
    }
}

// Función para crear una conversación con Retell AI
async function createRetellChat(message, userId) {
    try {
        console.log('🔄 Creando chat con Retell AI...');
        console.log('📝 Mensaje del usuario:', message);
        console.log('👤 User ID:', userId);
        
        const response = await axios.post(`${RETELL_API_BASE_URL}/v2/create-web-call`, {
            agent_id: RETELL_AGENT_ID,
            metadata: {
                user_id: userId.toString(),
                source: 'telegram'
            }
        }, {
            headers: {
                'Authorization': `Bearer ${RETELL_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ Chat creado con Retell:', response.data);
        return response.data;
    } catch (error) {
        console.error('❌ Error creando chat con Retell:');
        console.error('Status:', error.response?.status);
        console.error('Headers:', error.response?.headers);
        console.error('Data:', error.response?.data);
        console.error('Message:', error.message);
        throw error;
    }
}

// Función alternativa para chat de texto (si el agente es de texto)
async function sendMessageToRetell(message, userId) {
    try {
        console.log('💬 Enviando mensaje directo a Retell...');
        
        const response = await axios.post(`${RETELL_API_BASE_URL}/v2/create-chat`, {
            agent_id: RETELL_AGENT_ID,
            user_id: userId.toString(),
            message: message
        }, {
            headers: {
                'Authorization': `Bearer ${RETELL_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ Respuesta de Retell:', response.data);
        return response.data;
    } catch (error) {
        console.error('❌ Error enviando mensaje a Retell:');
        console.error('Status:', error.response?.status);
        console.error('Data:', error.response?.data);
        throw error;
    }
}

// Endpoint de salud
app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        message: 'Telegram-Retell Bot está funcionando',
        endpoints: ['/webhook', '/health']
    });
});

// Endpoint de salud adicional
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        env_vars: {
            telegram_token: !!TELEGRAM_BOT_TOKEN,
            retell_api_key: !!RETELL_API_KEY,
            retell_agent_id: !!RETELL_AGENT_ID
        }
    });
});

// Webhook de Telegram
app.post('/webhook', async (req, res) => {
    try {
        console.log('📥 Webhook recibido de Telegram:', JSON.stringify(req.body, null, 2));
        
        const { message } = req.body;
        
        if (!message || !message.text) {
            console.log('⚠️ Mensaje sin texto, ignorando...');
            return res.status(200).send('OK');
        }
        
        const chatId = message.chat.id;
        const userId = message.from.id;
        const userName = message.from.first_name || message.from.username || 'Usuario';
        const userMessage = message.text;
        
        console.log(`👤 ${userName} (${userId}) en chat ${chatId}: ${userMessage}`);
        
        // Enviar indicador de "escribiendo..."
        await axios.post(`${TELEGRAM_API_URL}/sendChatAction`, {
            chat_id: chatId,
            action: 'typing'
        });
        
        try {
            // Intentar primero con el endpoint de web call
            console.log('🔄 Intentando crear web call...');
            const retellResponse = await createRetellChat(userMessage, userId);
            
            if (retellResponse.access_token || retellResponse.call_id) {
                await sendTelegramMessage(chatId, 
                    `🤖 <b>Conexión establecida con Retell AI</b>\n\n` +
                    `📞 Call ID: <code>${retellResponse.call_id || 'N/A'}</code>\n` +
                    `🔑 Token: <code>${retellResponse.access_token ? 'Generado' : 'N/A'}</code>\n\n` +
                    `<i>Tu mensaje ha sido procesado correctamente.</i>`
                );
            } else {
                throw new Error('Respuesta inesperada de Retell');
            }
            
        } catch (retellError) {
            console.log('⚠️ Web call falló, intentando con chat directo...');
            
            try {
                const chatResponse = await sendMessageToRetell(userMessage, userId);
                
                if (chatResponse.response || chatResponse.message) {
                    await sendTelegramMessage(chatId, 
                        chatResponse.response || chatResponse.message || '✅ Mensaje procesado por Retell AI'
                    );
                } else {
                    throw new Error('Sin respuesta válida del chat');
                }
                
            } catch (chatError) {
                console.error('❌ Ambos métodos fallaron');
                
                // Mensaje de error amigable al usuario
                await sendTelegramMessage(chatId, 
                    `⚠️ <b>Servicio temporalmente no disponible</b>\n\n` +
                    `Lo siento, hay un problema de conectividad con el sistema de IA. ` +
                    `Por favor, inténtalo de nuevo en unos momentos.\n\n` +
                    `<i>Tu mensaje: "${userMessage}"</i>`
                );
            }
        }
        
    } catch (error) {
        console.error('❌ Error general en webhook:', error);
        
        // Intentar enviar mensaje de error si es posible
        if (req.body?.message?.chat?.id) {
            try {
                await sendTelegramMessage(req.body.message.chat.id, 
                    '🔥 <b>Error interno del servidor</b>\n\n' +
                    'Hubo un problema procesando tu solicitud. El equipo técnico ha sido notificado.'
                );
            } catch (sendError) {
                console.error('❌ No se pudo enviar mensaje de error:', sendError);
            }
        }
    } finally {
        // Siempre responder a Telegram para evitar reintentos
        res.status(200).send('OK');
    }
});

// Endpoint para testing manual
app.post('/test-retell', async (req, res) => {
    try {
        const { message = 'Test message', userId = '12345' } = req.body;
        
        console.log('🧪 Testing Retell connection...');
        const result = await createRetellChat(message, userId);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            details: error.response?.data
        });
    }
});

// Manejo de errores no capturados
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor iniciado en puerto ${PORT}`);
    console.log(`🌍 URL pública: https://retell-telegram-proxy-production.up.railway.app`);
    console.log(`📡 Webhook URL: https://retell-telegram-proxy-production.up.railway.app/webhook`);
    console.log('✅ Bot listo para recibir mensajes');
});
