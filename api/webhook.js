// 📁 /api/webhook.js
const fetch = require('node-fetch');

module.exports = async function handler(req, res) {
  // Verificación de salud del endpoint
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
      
      // Validar que existe el mensaje y tiene texto
      if (!message || !message.text) {
        console.log('📭 Mensaje sin texto recibido, ignorando...');
        return res.json({ ok: true });
      }

      const chatId = message.chat.id;
      const userMessage = message.text;
      const userName = message.from?.first_name || 'Usuario';
      
      console.log(`📨 [${userName}] Mensaje recibido: "${userMessage}"`);

      // Validar variables de entorno
      if (!process.env.RETELL_API_KEY || !process.env.RETELL_AGENT_ID) {
        throw new Error('Faltan variables de entorno: RETELL_API_KEY o RETELL_AGENT_ID');
      }

      // Llamada a Retell AI
      const retellResponse = await fetch('https://api.retellai.com/v3/response-engine', {
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

      // Verificar si la respuesta es exitosa
      if (!retellResponse.ok) {
        const errorText = await retellResponse.text();
        console.error(`❌ Error HTTP ${retellResponse.status}:`, errorText);
        throw new Error(`Retell API error: ${retellResponse.status} - ${errorText}`);
      }

      const responseText = await retellResponse.text();
      let retellData;

      try {
        retellData = JSON.parse(responseText);
      } catch (err) {
        console.error("❌ Respuesta no JSON desde Retell:", responseText.substring(0, 200));
        throw new Error("Retell devolvió contenido inválido. Revisa token o agent_id.");
      }

      // Extraer respuesta del agente
      const agentResponse = retellData?.content || retellData?.message || 'Lo siento, no pude procesar tu mensaje.';
      
      console.log(`🤖 Respuesta generada: "${agentResponse.substring(0, 100)}${agentResponse.length > 100 ? '...' : ''}"`);

      // Enviar respuesta a Telegram
      const telegramResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: agentResponse,
          parse_mode: 'Markdown' // Opcional: permite formato básico
        })
      });

      if (!telegramResponse.ok) {
        const telegramError = await telegramResponse.text();
        console.error('❌ Error enviando a Telegram:', telegramError);
        throw new Error(`Error enviando mensaje a Telegram: ${telegramResponse.status}`);
      }

      console.log('✅ Mensaje enviado exitosamente');
      return res.json({ ok: true });

    } catch (error) {
      console.error('❌ Error crítico:', error.message);
      
      // Intentar enviar mensaje de error al usuario
      try {
        const { message } = req.body;
        if (message?.chat?.id) {
          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: message.chat.id,
              text: '⚠️ Temporalmente no puedo responder. Por favor, inténtalo más tarde.'
            })
          });
        }
      } catch (fallbackError) {
        console.error('❌ Error enviando mensaje de fallback:', fallbackError.message);
      }

      return res.status(500).json({ 
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Método no permitido
  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
};

// 📁 /package.json
{
  "name": "telegram-retell-bot",
  "version": "1.0.0",
  "description": "Bot de Telegram conectado a Retell AI",
  "main": "api/webhook.js",
  "scripts": {
    "dev": "vercel dev",
    "deploy": "vercel --prod"
  },
  "dependencies": {
    "node-fetch": "^2.6.7"
  },
  "engines": {
    "node": ">=14.x"
  }
}

// 📁 /vercel.json
{
  "version": 2,
  "builds": [
    {
      "src": "api/webhook.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/api/webhook",
      "dest": "/api/webhook.js"
    }
  ],
  "env": {
    "RETELL_API_KEY": "@retell_api_key",
    "RETELL_AGENT_ID": "@retell_agent_id", 
    "TELEGRAM_BOT_TOKEN": "@telegram_bot_token"
  }
}

// 📁 /.env.example
RETELL_API_KEY=sk-xxx
RETELL_AGENT_ID=agent_8bb084b488139c5d3898c2878d
TELEGRAM_BOT_TOKEN=8115124802:AAGd_EED9DQHFVYDYagf1CRPs6PKS_xpwJ0

// 📁 /README.md
# 🤖 Bot Telegram + Retell AI

Bot de Telegram que utiliza agentes de chat de Retell AI para responder mensajes automáticamente.

## 🚀 Despliegue Rápido

### 1. Clona y configura
```bash
git clone [tu-repo]
cd telegram-retell-bot
```

### 2. Configura variables de entorno en Vercel
```bash
vercel env add RETELL_API_KEY
vercel env add RETELL_AGENT_ID  
vercel env add TELEGRAM_BOT_TOKEN
```

### 3. Despliega
```bash
vercel --prod
```

### 4. Configura webhook de Telegram
```bash
curl -F "url=https://TU_DOMINIO.vercel.app/api/webhook" \
  https://api.telegram.org/botTU_TOKEN/setWebhook
```

## 🔧 Variables de Entorno

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `RETELL_API_KEY` | API Key de Retell AI | `sk-xxx` |
| `RETELL_AGENT_ID` | ID del agente de chat | `agent_8bb084b488139c5d3898c2878d` |
| `TELEGRAM_BOT_TOKEN` | Token del bot de Telegram | `123456:ABC-DEF` |

## 📊 Logs y Monitoreo

- Verifica el funcionamiento: `https://tu-dominio.vercel.app/api/webhook`
- Los logs están disponibles en el dashboard de Vercel
- Cada mensaje muestra: usuario, mensaje recibido y respuesta generada

## 🆘 Troubleshooting

### Error: "Retell devolvió HTML"
- ✅ Verifica que el `RETELL_API_KEY` sea correcto
- ✅ Confirma que el `RETELL_AGENT_ID` existe y es de tipo chat

### Error: "Method not allowed" 
- ✅ Asegúrate de que el webhook esté configurado correctamente
- ✅ El endpoint debe recibir POST requests de Telegram

### Bot no responde
- ✅ Verifica que el webhook esté activo con `/getWebhookInfo`
- ✅ Revisa los logs en Vercel para errores específicos

## 🎯 Características

- ✅ Manejo de errores robusto
- ✅ Logs detallados para debugging  
- ✅ Soporte para formato Markdown en respuestas
- ✅ Mensajes de fallback en caso de error
- ✅ Contexto preservado por chat_id único

---

⚡ **¡Listo para usar!** Una vez desplegado, tu bot responderá automáticamente usando tu agente de Retell AI.
