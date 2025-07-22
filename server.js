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

// Función para simular conversación con Retell (como es de voz, adaptamos para texto)
async function processMessageWithRetell(message) {
    try {
        console.log(`🤖 Procesando mensaje con Retell: "${message}"`);
        
        // Por ahora, como Retell es principalmente de voz, 
        // retornamos una respuesta que indique que el agente está configurado
        return {
            success: true,
            response: `🤖 Agente Retell (${RETELL_AGENT_ID}) procesó: "${message}"\n\n` +
                     `✅ Configuración verificada:\n` +
                     `• API Key: Válida\n` +
                     `• Agent ID: ${RETELL_AGENT_ID}\n` +
                     `• Status: Activo\n\n` +
                     `💡 Este es un agente de VOZ de Retell, diseñado para llamadas telefónicas.`
        };
    } catch (error) {
        console.error('❌ Error procesando mensaje:', error);
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
            // Verificar conexión con Retell primero
            const agentInfo = await verifyRetellAgent();
            
            // Procesar mensaje
            const result = await processMessageWithRetell(userMessage);
            
            console.log(`🤖 Respuesta procesada exitosamente`);
            
            // Enviar respuesta a Telegram
            await sendTelegramMessage(chatId, result.response);
            
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
