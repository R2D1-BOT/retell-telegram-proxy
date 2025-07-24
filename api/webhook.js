export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.json({ status: 'OK' });
  }
  
  if (req.method === 'POST') {
    console.log('Mensaje:', req.body);
    return res.json({ ok: true });
  }
}
