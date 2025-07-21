const express = require('express')
const axios = require('axios')
const bodyParser = require('body-parser')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 8080

app.use(bodyParser.json())

app.post('/webhook', async (req, res) => {
  console.log('📩 Webhook recibido:', JSON.stringify(req.body))

  const message = req.body.message?.text
  const chatId = req.body.message?.chat?.id

  if (!message || !chatId) {
    console.log('❌ No hay mensaje o chatId válido.')
    return res.sendStatus(200)
  }

  try {
    const retellResponse = await axios.post(
      'https://api.retellai.com/chat-completion',
      {
        agent_id: process.env.RETELL_AGENT_ID,
        messages: [{ role: 'user', content: message }]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    )

    const reply = retellResponse.data?.text || '⚠️ Sin respuesta'
    console.log('🧠 Retell dice:', reply)

    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: reply
    })

    res.sendStatus(200)
  } catch (err) {
    console.error('🔥 ERROR:', err.message)
    res.sendStatus(500)
  }
})

app.listen(PORT, () => {
  console.log(`🔥 Servidor funcionando en puerto ${PORT}`)
})
