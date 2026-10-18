// Servidor de radio suelto (para alojar en una PC o VPS sin la app).
//
// Uso:   npm run server            -> puerto 8787 por defecto
//        node server/signaling.js 9000   -> puerto personalizado

const { createRadioServer } = require('./radio-server');

const port = parseInt(process.argv[2] || process.env.PORT || '8787', 10);

createRadioServer(port)
  .then((server) => {
    console.log('');
    console.log('=========================================================');
    console.log('   SERVIDOR DE RADIO CAD ER:LC — ACTIVO');
    console.log(`   Puerto: ${server.port}`);
    console.log(`   Compañeros se conectan a:  ws://TU-IP:${server.port}`);
    console.log('   (Tu IP local aparece ejecutando:  ipconfig)');
    console.log('   Deja esta ventana abierta mientras usan el radio.');
    console.log('=========================================================');
    console.log('');
  })
  .catch((err) => {
    console.error('No se pudo iniciar el servidor:', err.message);
    process.exit(1);
  });
