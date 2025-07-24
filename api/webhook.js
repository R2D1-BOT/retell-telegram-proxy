<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bot de Telegram con Retell AI</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background-color: #f0f0f0;
            color: #333;
            text-align: center;
        }
        .container {
            padding: 20px;
            border-radius: 8px;
            background-color: #fff;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }
        h1 {
            color: #007bff;
        }
        p {
            margin-top: 10px;
        }
        code {
            background-color: #e9ecef;
            padding: 2px 4px;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>¡Tu bot de Telegram está esperando mensajes!</h1>
        <p>Si ves esta página, significa que el alojamiento de tu bot está funcionando correctamente.</p>
        <p>El bot responde a través del webhook en <code>/api/webhook</code>.</p>
        <p>Asegúrate de que tu webhook de Telegram está configurado para apuntar a la URL completa de tu Vercel más <code>/api/webhook</code>.</p>
        <p>¡Gracias por tu paciencia!</p>
    </div>
</body>
</html>
  // Si se usa otro método HTTP (PUT, DELETE, etc.), respondemos que no está permitido.
  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
};
