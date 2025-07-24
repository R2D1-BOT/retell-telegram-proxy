// api/test.js
module.exports = async function handler(req, res) {
  console.log("Petición recibida en el webhook de prueba!");
  console.log("Método:", req.method);
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);
  return res.status(200).json({ message: "¡Hola desde el webhook de prueba!" });
};
