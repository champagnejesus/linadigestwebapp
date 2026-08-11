import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log errors to a file to debug 503 on Hostinger
const logErrorToFile = (err) => {
  const errorMsg = `${new Date().toISOString()} - ${err.stack || err}\n`;
  fs.appendFileSync(path.join(__dirname, 'hostinger_error.log'), errorMsg);
};
process.on('uncaughtException', logErrorToFile);
process.on('unhandledRejection', logErrorToFile);

// 1. Cargar archivo .env de forma manual si existe (Next.js standalone no lo lee en producción por defecto)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  try {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split(/\r?\n/).forEach(line => {
      // Ignorar comentarios y líneas vacías
      if (line.trim().startsWith('#') || !line.includes('=')) return;
      
      const parts = line.split('=');
      const key = parts[0].trim();
      let value = parts.slice(1).join('=').trim();
      
      // Limpiar comillas si existen
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      }
      
      // Solo asignar si no está ya definida en el sistema
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    });
  } catch (err) {
    console.error("Error cargando el archivo .env:", err);
  }
}

// 2. Hook para permitir que Next.js standalone escuche en sockets Unix (requerido por Phusion Passenger en Hostinger)
const originalParseInt = global.parseInt;
global.parseInt = function(value, radix) {
  if (value === process.env.PORT) {
    const parsed = originalParseInt(value, radix);
    // Si process.env.PORT no es un número (es un path de socket como /tmp/passenger.xxx),
    // devolvemos el string original para que Node pueda hacer bind al socket.
    if (isNaN(parsed)) {
      return value;
    }
    return parsed;
  }
  return originalParseInt(value, radix);
};

// 3. Cargar dinámicamente el servidor standalone de Next.js
// Usamos import() dinámico para asegurar que el hook de parseInt y las variables .env se registren ANTES de levantar el servidor.
import('./.next/standalone/server.js').catch(err => {
  console.error("Fallo al iniciar el servidor de Next.js:", err);
  logErrorToFile(err);
  process.exit(1);
});
