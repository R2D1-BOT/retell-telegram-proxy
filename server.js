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

// Función SIMPLE para probar diferentes endpoints de Retell
async function testRetellEndpoints(message, userId) {
    const endpoints = [
        {
            name: 'Web Chat',
            url: `${RETELL_API_BASE_URL}/v2/create-web-chat`,
            payload: {
                agent_id: RETELL_AGENT_ID,
                user_id: userId.toString(),
                metadata: { source: 'telegram' }
            }
        },
        {
            name: 'Chat Completion',
            url: `${RETELL_API_BASE_URL}/v1/chat/completions`,
            payload: {
                agent_id: RETELL_AGENT_ID,
                messages: [{ role: 'user', content: message }],
                user_id: userId.toString()
            }
        },
        {
            name: 'Create Chat',
            url: `${RETELL_API_BASE_URL}/v1/chat`,
            payload: {
                agent_id: RETELL_AGENT_ID,
                user_message: message,
                user_id: userId.toString()
            }
        }
    ];

    for (const endpoint of endpoints) {
        try {
            console.log(`🔄 Probando: ${endpoint.name} - ${endpoint.url}`);
            
            const response = await axios.post(endpoint.url, endpoint.payload, {
                headers: {
                    'Authorization': `Bearer ${RETELL_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
            
            console.log(`✅ ${endpoint.name} FUNCIONÓ:`, response.data);
            return {
                success: true,
                endpoint: endpoint.name,
                data: response.data
            };
            
        } catch (error) {
            console.log(`❌ ${endpoint.name} falló:`, error.response?.status, error.response?.data?.message || error.message);
            continue;
        }
    }
    
    throw new Error('Todos los endpoints fallaron');
}

// Endpoint de salud
app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        message: 'Telegram-Retell Bot está funcionando',
        version: '2.0',
        endpoints: ['/webhook', '/health', '/test-retell']
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
        console.log('📥 Webhook recibido:', JSON.stringify(req.body, null, 2));
        
        const { message } = req.body;
        
        if (!message || !message.text) {
            console.log('⚠️ Mensaje sin texto, ignorando...');
            return res.status(200).send('OK');
        }
        
        const chatId = message.chat.id;
        const userId = message.from.id;
        const userName = message.from.first_name || message.from.username || 'Usuario';
        const userMessage = message.text;
        
        console.log(`👤 ${userName} (${userId}): ${userMessage}`);
        
        // Enviar "escribiendo..."
        await axios.post(`${TELEGRAM_API_URL}/sendChatAction`, {
            chat_id: chatId,
            action: 'typing'
        });
        
        try {
            const result = await testRetellEndpoints(userMessage, userId);
            
            let responseMessage = '🤖 ¡Conexión exitosa con Retell AI!\n\n';
            
            if (result.data.response) {
                responseMessage += result.data.response;
            } else if (result.data.content) {
                responseMessage += result.data.content;
            } else if (result.data.message) {
                responseMessage += result.data.message;
            } else {
                responseMessage += `Endpoint usado: ${result.endpoint}\n`;
                responseMessage += `Datos: ${JSON.stringify(result.data).substring(0, 100)}...`;
            }
            
            await sendTelegramMessage(chatId, responseMessage);
            
        } catch (error) {
            console.error('❌ Todos los endpoints fallaron:', error.message);
            
            await sendTelegramMessage(chatId, 
                `🔧 <b>Estado del sistema:</b>\n\n` +
                `⚠️ Los endpoints de Retell no están respondiendo correctamente.\n` +
                `🔑 API Key: ${RETELL_API_KEY ? 'Configurada' : 'Faltante'}\n` +
                `🤖 Agent ID: <code>${RETELL_AGENT_ID}</code>\n\n` +
                `<i>Mensaje recibido: "${userMessage}"</i>\n\n` +
                `Por favor, verifica que el agente esté activo en el dashboard de Retell.`
            );
        }
        
    } catch (error) {
        console.error('❌ Error general:', error);
    } finally {
        res.status(200).send('OK');
    }
});

// Endpoint para testing
app.post('/test-retell', async (req, res) => {
    try {
        const { message = 'Test message', userId = '12345' } = req.body;
        const result = await testRetellEndpoints(message, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Manejo de errores
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor iniciado en puerto ${PORT}`);
    console.log(`🌍 URL: https://retell-telegram-proxy-production.up.railway.app`);
    console.log('✅ Bot listo - Versión 2.0 con múltiples endpoints');
});
