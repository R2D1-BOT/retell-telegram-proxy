// api/webhook.js
module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return res.json({ status: 'Servidor Bot OK - Webhook accesible.' });
  }

  if (req.method === 'POST') {
    // Si Telegram nos envía algo, respondemos directamente sin procesar nada más.
    // Esto es para depuración pura.
    console.log('🎉 Recibido mensaje de Telegram. Respondiendo OK.');
    return res.json({ ok: true, message: 'Mensaje recibido y procesado (debug).' });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
};
