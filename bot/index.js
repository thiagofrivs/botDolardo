const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuración
const config = {
    telegramToken: process.env.TELEGRAM_TOKEN,
    apiSecretKey: process.env.API_SECRET_KEY,
    port: process.env.PORT || 3000,
    apiBaseUrl: process.env.API_BASE_URL || 'https://dolarapi.com/v1/ambito/dolares/oficial',
    logLevel: process.env.LOG_LEVEL || 'INFO',
    maxLogEntries: parseInt(process.env.MAX_LOG_ENTRIES) || 1000,
    checkInterval: parseInt(process.env.CHECK_INTERVAL) || 900, // 15 minutos = 900 segundos
    nodeEnv: process.env.NODE_ENV || 'production'
};

// Estado global del bot
let botGlobalStatus = {
    isActive: true,
    lastPausedBy: null,
    lastPausedAt: null,
    lastResumedBy: null,
    lastResumedAt: null
};

// Validar variables de entorno obligatorias
if (!config.telegramToken) {
    console.error('❌ ERROR: TELEGRAM_TOKEN es obligatorio');
    process.exit(1);
}

if (!config.apiSecretKey) {
    console.error('❌ ERROR: API_SECRET_KEY es obligatorio');
    process.exit(1);
}

// Inicializar bot de Telegram
const bot = new TelegramBot(config.telegramToken, { polling: true });

// Inicializar Express
const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

// Inicializar base de datos
const db = new sqlite3.Database('db.sqlite');

// Inicializar sistema de logs
const logFile = 'logs.txt';

// Función para logging
function log(level, message, telegramId = null) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${telegramId ? `[User: ${telegramId}] ` : ''}${message}\n`;
    
    // Log a consola
    console.log(logEntry.trim());
    
    // Log a archivo
    fs.appendFileSync(logFile, logEntry);
    
    // Log a base de datos
    db.run(
        'INSERT INTO logs (timestamp, nivel, mensaje, telegram_id) VALUES (?, ?, ?, ?)',
        [timestamp, level, message, telegramId],
        (err) => {
            if (err) console.error('Error guardando log en DB:', err);
        }
    );
    
    // Limpiar logs antiguos
    db.run(
        'DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY timestamp DESC LIMIT ?)',
        [config.maxLogEntries]
    );
}

// Inicializar base de datos
function initDatabase() {
    db.serialize(() => {
        // Tabla usuarios
        db.run(`
            CREATE TABLE IF NOT EXISTS usuarios (
                telegram_id INTEGER PRIMARY KEY,
                username TEXT,
                intervalo INTEGER DEFAULT 60,
                ultima_cotizacion_compra REAL,
                ultima_cotizacion_venta REAL,
                activo BOOLEAN DEFAULT 1,
                fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
                ultima_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Tabla logs
        db.run(`
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME,
                nivel TEXT,
                mensaje TEXT,
                telegram_id INTEGER
            )
        `);
        
        // Tabla cotizaciones
        db.run(`
            CREATE TABLE IF NOT EXISTS cotizaciones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                compra REAL,
                venta REAL,
                variacion_compra REAL DEFAULT 0,
                variacion_venta REAL DEFAULT 0
            )
        `);
        
        log('INFO', 'Base de datos inicializada correctamente');
    });
}

// Función para obtener cotización
async function getCotizacion() {
    try {
        const response = await axios.get(config.apiBaseUrl, { timeout: 10000 });
        const data = response.data;
        
        if (data && data.compra && data.venta) {
            return {
                compra: parseFloat(data.compra),
                venta: parseFloat(data.venta),
                timestamp: new Date().toISOString()
            };
        }
        throw new Error('Datos de cotización inválidos');
    } catch (error) {
        log('ERROR', `Error obteniendo cotización: ${error.message}`);
        throw error;
    }
}

// Función para guardar cotización
function saveCotizacion(cotizacion, variacion = { compra: 0, venta: 0 }) {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT INTO cotizaciones (compra, venta, variacion_compra, variacion_venta) VALUES (?, ?, ?, ?)',
            [cotizacion.compra, cotizacion.venta, variacion.compra, variacion.venta],
            function(err) {
                if (err) {
                    log('ERROR', `Error guardando cotización: ${err.message}`);
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            }
        );
    });
}

// Función para obtener última cotización
function getLastCotizacion() {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM cotizaciones ORDER BY timestamp DESC LIMIT 1',
            (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            }
        );
    });
}

// Función para obtener usuarios activos
function getActiveUsers() {
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT * FROM usuarios WHERE activo = 1',
            (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            }
        );
    });
}

// Función para registrar/actualizar usuario
function upsertUser(telegramId, username) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT OR REPLACE INTO usuarios 
             (telegram_id, username, ultima_actualizacion) 
             VALUES (?, ?, CURRENT_TIMESTAMP)`,
            [telegramId, username],
            function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            }
        );
    });
}

// Función para actualizar última cotización del usuario
function updateUserLastCotizacion(telegramId, compra, venta) {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE usuarios SET ultima_cotizacion_compra = ?, ultima_cotizacion_venta = ? WHERE telegram_id = ?',
            [compra, venta, telegramId],
            function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            }
        );
    });
}

// Función para pausar/reanudar usuario
function toggleUserStatus(telegramId, activo) {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE usuarios SET activo = ?, ultima_actualizacion = CURRENT_TIMESTAMP WHERE telegram_id = ?',
            [activo ? 1 : 0, telegramId],
            function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            }
        );
    });
}


// Función para obtener usuario
function getUser(telegramId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM usuarios WHERE telegram_id = ?',
            [telegramId],
            (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            }
        );
    });
}

// Función para formatear mensaje de cotización
function formatCotizacionMessage(cotizacion, variacion = null) {
    let message = `💰 *¡Aquí tienes la cotización del dólar oficial!* 🇦🇷\n\n`;
    message += `🟢 *Compra:* $${cotizacion.compra.toFixed(2)} 💸\n`;
    message += `🔴 *Venta:* $${cotizacion.venta.toFixed(2)} 💸\n`;
    
    if (variacion) {
        const compraVar = variacion.compra >= 0 ? `+${variacion.compra.toFixed(2)}` : variacion.compra.toFixed(2);
        const ventaVar = variacion.venta >= 0 ? `+${variacion.venta.toFixed(2)}` : variacion.venta.toFixed(2);
        const compraIcon = variacion.compra >= 0 ? '📈' : '📉';
        const ventaIcon = variacion.venta >= 0 ? '📈' : '📉';
        
        message += `\n📊 *¡Variación del momento!*\n`;
        message += `${compraIcon} *Compra:* ${compraVar} ${variacion.compra >= 0 ? '🚀' : '😱'}\n`;
        message += `${ventaIcon} *Venta:* ${ventaVar} ${variacion.venta >= 0 ? '🚀' : '😱'}\n`;
    }
    
    message += `\n⏰ *Actualizado:* ${new Date().toLocaleString('es-AR')} 🕐\n\n`;
    message += `💡 *Tip:* ¡Activa las notificaciones automáticas para recibir alertas cada 15 minutos! 🎯✨`;
    
    return message;
}

// Función para notificar cambios de cotización
async function checkAndNotifyChanges() {
    try {
        // Verificar si el bot está pausado globalmente
        if (!botGlobalStatus.isActive) {
            log('INFO', 'Bot pausado globalmente - saltando verificación de cotizaciones');
            return;
        }
        
        const cotizacion = await getCotizacion();
        const lastCotizacion = await getLastCotizacion();
        
        let variacion = { compra: 0, venta: 0 };
        
        if (lastCotizacion) {
            variacion.compra = cotizacion.compra - lastCotizacion.compra;
            variacion.venta = cotizacion.venta - lastCotizacion.venta;
        }
        
        // Guardar nueva cotización
        await saveCotizacion(cotizacion, variacion);
        
        // Si hay cambio significativo, notificar usuarios activos
        const cambioSignificativo = Math.abs(variacion.compra) > 0.01 || Math.abs(variacion.venta) > 0.01;
        
        if (cambioSignificativo) {
            const usuarios = await getActiveUsers();
            
            for (const usuario of usuarios) {
                try {
                    const mensaje = formatCotizacionMessage(cotizacion, variacion);
                    await bot.sendMessage(usuario.telegram_id, mensaje, { parse_mode: 'Markdown' });
                    
                    // Actualizar última cotización del usuario
                    await updateUserLastCotizacion(usuario.telegram_id, cotizacion.compra, cotizacion.venta);
                    
                    log('INFO', `Notificación enviada a usuario ${usuario.telegram_id}`, usuario.telegram_id);
                } catch (error) {
                    log('ERROR', `Error enviando notificación a usuario ${usuario.telegram_id}: ${error.message}`, usuario.telegram_id);
                }
            }
        }
        
        log('INFO', `Cotización verificada: Compra $${cotizacion.compra}, Venta $${cotizacion.venta}`);
        
    } catch (error) {
        log('ERROR', `Error en verificación de cotización: ${error.message}`);
    }
}

// Comandos del bot
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || msg.from.first_name;
    
    try {
        // Verificar si el bot está pausado globalmente
        if (!botGlobalStatus.isActive) {
            await bot.sendMessage(chatId, '😴 ¡Ups! El bot está durmiendo la siesta... 💤\n\n⏰ Intenta más tarde, ¡pronto estaremos de vuelta! 🌅✨');
            log('INFO', `Usuario ${username} (${chatId}) intentó usar comando /start mientras bot pausado`, chatId);
            return;
        }
        
        await upsertUser(chatId, username);
        
        const welcomeMessage = `🎉 ¡Hola ${username}! ¡Bienvenido al mejor bot de cotizaciones! 🚀

💰 Soy tu asistente personal del dólar oficial argentino 🇦🇷
¡Estoy aquí para mantenerte siempre informado! 📊✨

🎯 *Mis superpoderes:*
/cotizacion 💵 - Ver la cotización actual del dólar
/activar ▶️ - Activar notificaciones automáticas
/desactivar ⏸️ - Desactivar notificaciones automáticas
/status 📊 - Ver tu estado personal
/help 🤝 - Mostrar esta ayuda genial

💡 *Pro tip:* ¡Activa las notificaciones y te avisaré cada 15 minutos cuando cambie el dólar! 📈
¡Nunca más te pierdas una oportunidad! 🎯💎`;

        await bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
        log('INFO', `Usuario ${username} (${chatId}) inició el bot`, chatId);
    } catch (error) {
        log('ERROR', `Error en comando /start: ${error.message}`, chatId);
        await bot.sendMessage(chatId, '😅 ¡Ups! Algo salió mal... 🤔\n\n🔄 Intenta nuevamente, ¡estoy aquí para ayudarte! 💪✨');
    }
});

bot.onText(/\/cotizacion/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        // Verificar si el bot está pausado globalmente
        if (!botGlobalStatus.isActive) {
            await bot.sendMessage(chatId, '😴 ¡Ups! El bot está durmiendo la siesta... 💤\n\n⏰ Intenta más tarde, ¡pronto estaremos de vuelta! 🌅✨');
            log('INFO', `Usuario ${chatId} intentó consultar cotización mientras bot pausado`, chatId);
            return;
        }
        
        const cotizacion = await getCotizacion();
        const mensaje = formatCotizacionMessage(cotizacion);
        
        await bot.sendMessage(chatId, mensaje, { parse_mode: 'Markdown' });
        log('INFO', `Cotización consultada por usuario ${chatId}`, chatId);
    } catch (error) {
        log('ERROR', `Error consultando cotización: ${error.message}`, chatId);
        await bot.sendMessage(chatId, '😰 ¡Ay no! No pude obtener la cotización... 🤷‍♂️\n\n🔄 Intenta en unos momentos, ¡estoy trabajando en solucionarlo! 💪✨');
    }
});


bot.onText(/\/pause/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        // Verificar si el bot está pausado globalmente
        if (!botGlobalStatus.isActive) {
            await bot.sendMessage(chatId, '😴 ¡Ups! El bot está durmiendo la siesta... 💤\n\n⏰ Intenta más tarde, ¡pronto estaremos de vuelta! 🌅✨');
            log('INFO', `Usuario ${chatId} intentó pausar notificaciones mientras bot pausado`, chatId);
            return;
        }
        
        await toggleUserStatus(chatId, false);
        await bot.sendMessage(chatId, '😴 ¡Perfecto! Tus notificaciones automáticas están pausadas ⏸️\n\n💤 Ahora puedo descansar un poco...\n⏰ Te avisaré cada 15 minutos cuando las reactives!\n▶️ Usa /activar cuando quieras que vuelva a trabajar! 🚀✨');
        log('INFO', `Usuario ${chatId} pausó notificaciones`, chatId);
    } catch (error) {
        log('ERROR', `Error pausando notificaciones: ${error.message}`, chatId);
        await bot.sendMessage(chatId, '😅 ¡Ups! No pude pausar las notificaciones... 🤔\n\n🔄 Intenta nuevamente, ¡estoy aquí para ayudarte! 💪✨');
    }
});

bot.onText(/\/resume/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        // Verificar si el bot está pausado globalmente
        if (!botGlobalStatus.isActive) {
            await bot.sendMessage(chatId, '😴 ¡Ups! El bot está durmiendo la siesta... 💤\n\n⏰ Intenta más tarde, ¡pronto estaremos de vuelta! 🌅✨');
            log('INFO', `Usuario ${chatId} intentó reanudar notificaciones mientras bot pausado`, chatId);
            return;
        }
        
        await toggleUserStatus(chatId, true);
        await bot.sendMessage(chatId, '🚀 ¡Excelente! Tus notificaciones automáticas están reanudadas ▶️\n\n📈 ¡Te avisaré cada 15 minutos cuando cambie el dólar! 💰\n⏰ ¡Nunca más te pierdas una oportunidad! 🎯✨');
        log('INFO', `Usuario ${chatId} reanudó notificaciones`, chatId);
    } catch (error) {
        log('ERROR', `Error reanudando notificaciones: ${error.message}`, chatId);
        await bot.sendMessage(chatId, '😅 ¡Ups! No pude reanudar las notificaciones... 🤔\n\n🔄 Intenta nuevamente, ¡estoy aquí para ayudarte! 💪✨');
    }
});

bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        // Verificar si el bot está pausado globalmente
        if (!botGlobalStatus.isActive) {
            await bot.sendMessage(chatId, '😴 ¡Ups! El bot está durmiendo la siesta... 💤\n\n⏰ Intenta más tarde, ¡pronto estaremos de vuelta! 🌅✨');
            log('INFO', `Usuario ${chatId} intentó consultar estado mientras bot pausado`, chatId);
            return;
        }
        
        const usuario = await getUser(chatId);
        
        if (usuario) {
            const estado = usuario.activo ? '🟢 Activo' : '🔴 Pausado';
            const mensaje = `📊 *¡Aquí está tu estado personal!* 🎯

${estado} ${usuario.activo ? '🚀' : '😴'}
⏰ *Notificaciones:* ${usuario.activo ? 'Activadas cada 15 min' : 'Pausadas'} ⏱️
📅 *Registrado:* ${new Date(usuario.fecha_registro).toLocaleDateString('es-AR')} 📆
🔄 *Última actualización:* ${new Date(usuario.ultima_actualizacion).toLocaleDateString('es-AR')} 🔄

💡 *¡Todo listo para mantenerte informado!* ✨`;

            await bot.sendMessage(chatId, mensaje, { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, '🤔 ¡Ups! No estás registrado aún... 😅\n\n🚀 Usa /start para comenzar esta aventura! ✨');
        }
        
        log('INFO', `Usuario ${chatId} consultó su estado`, chatId);
    } catch (error) {
        log('ERROR', `Error consultando estado: ${error.message}`, chatId);
        await bot.sendMessage(chatId, '😅 ¡Ups! No pude consultar tu estado... 🤔\n\n🔄 Intenta nuevamente, ¡estoy aquí para ayudarte! 💪✨');
    }
});

bot.onText(/\/activar/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        // Verificar si el bot está pausado globalmente
        if (!botGlobalStatus.isActive) {
            await bot.sendMessage(chatId, '😴 ¡Ups! El bot está durmiendo la siesta... 💤\n\n⏰ Intenta más tarde, ¡pronto estaremos de vuelta! 🌅✨');
            log('INFO', `Usuario ${chatId} intentó activar notificaciones mientras bot pausado`, chatId);
            return;
        }
        
        await toggleUserStatus(chatId, true);
        await bot.sendMessage(chatId, '🚀 ¡Excelente! Tus notificaciones automáticas están activadas ▶️\n\n📈 ¡Te avisaré cada 15 minutos cuando cambie el dólar! 💰\n⏰ ¡Nunca más te pierdas una oportunidad! 🎯✨');
        log('INFO', `Usuario ${chatId} activó notificaciones`, chatId);
    } catch (error) {
        log('ERROR', `Error activando notificaciones: ${error.message}`, chatId);
        await bot.sendMessage(chatId, '😅 ¡Ups! No pude activar las notificaciones... 🤔\n\n🔄 Intenta nuevamente, ¡estoy aquí para ayudarte! 💪✨');
    }
});

bot.onText(/\/desactivar/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        // Verificar si el bot está pausado globalmente
        if (!botGlobalStatus.isActive) {
            await bot.sendMessage(chatId, '😴 ¡Ups! El bot está durmiendo la siesta... 💤\n\n⏰ Intenta más tarde, ¡pronto estaremos de vuelta! 🌅✨');
            log('INFO', `Usuario ${chatId} intentó desactivar notificaciones mientras bot pausado`, chatId);
            return;
        }
        
        await toggleUserStatus(chatId, false);
        await bot.sendMessage(chatId, '😴 ¡Perfecto! Tus notificaciones automáticas están desactivadas ⏸️\n\n💤 Ahora puedo descansar un poco...\n⏰ Te avisaré cada 15 minutos cuando las reactives!\n▶️ Usa /activar cuando quieras que vuelva a trabajar! 🚀✨');
        log('INFO', `Usuario ${chatId} desactivó notificaciones`, chatId);
    } catch (error) {
        log('ERROR', `Error desactivando notificaciones: ${error.message}`, chatId);
        await bot.sendMessage(chatId, '😅 ¡Ups! No pude desactivar las notificaciones... 🤔\n\n🔄 Intenta nuevamente, ¡estoy aquí para ayudarte! 💪✨');
    }
});

bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        // Verificar si el bot está pausado globalmente
        if (!botGlobalStatus.isActive) {
            await bot.sendMessage(chatId, '😴 ¡Ups! El bot está durmiendo la siesta... 💤\n\n⏰ Intenta más tarde, ¡pronto estaremos de vuelta! 🌅✨');
            log('INFO', `Usuario ${chatId} intentó consultar ayuda mientras bot pausado`, chatId);
            return;
        }
        
        const helpMessage = `🎉 *¡Hola! Soy tu asistente del dólar!* 🇦🇷💰

🤖 *¡Aquí tienes todos mis superpoderes!* ✨

🎯 *Mis comandos mágicos:*
/cotizacion 💵 - Ver la cotización actual del dólar
/activar ▶️ - Activar notificaciones automáticas
/desactivar ⏸️ - Desactivar notificaciones automáticas
/status 📊 - Ver tu estado personal
/help 🤝 - Mostrar esta ayuda genial

💡 *¡Cómo funciono!*
⏰ Verifico el dólar cada 15 minutos automáticamente
📈 Te aviso solo si cambió y tienes notificaciones activadas
🎯 ¡Súper simple! Solo activa/desactiva las notificaciones

🌐 *Dashboard web:* ¡Visita nuestro dashboard para control avanzado! 🎛️✨

💎 *¡Nunca más te pierdas una oportunidad con el dólar!* 🚀📈`;

        await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
        log('INFO', `Usuario ${chatId} consultó la ayuda`, chatId);
    } catch (error) {
        log('ERROR', `Error en comando /help: ${error.message}`, chatId);
        await bot.sendMessage(chatId, '😅 ¡Ups! Algo salió mal... 🤔\n\n🔄 Intenta nuevamente, ¡estoy aquí para ayudarte! 💪✨');
    }
});

// Middleware de autenticación para API
function authenticateAPI(req, res, next) {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'];
    
    if (authHeader && authHeader === `Bearer ${config.apiSecretKey}`) {
        return next();
    }
    
    if (apiKey && apiKey === config.apiSecretKey) {
        return next();
    }
    
    res.status(401).json({ error: 'No autorizado' });
}

// Endpoints de la API
app.get('/api/cotizacion', async (req, res) => {
    try {
        const cotizacion = await getCotizacion();
        const lastCotizacion = await getLastCotizacion();
        
        let variacion = { compra: 0, venta: 0 };
        if (lastCotizacion) {
            variacion.compra = cotizacion.compra - lastCotizacion.compra;
            variacion.venta = cotizacion.venta - lastCotizacion.venta;
        }
        
        res.json({
            actual: cotizacion,
            anterior: lastCotizacion,
            variacion: variacion,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        log('ERROR', `Error en API cotizacion: ${error.message}`);
        res.status(500).json({ error: 'Error obteniendo cotización' });
    }
});

app.get('/api/usuarios', async (req, res) => {
    try {
        db.all('SELECT * FROM usuarios ORDER BY fecha_registro DESC', (err, rows) => {
            if (err) {
                log('ERROR', `Error obteniendo usuarios: ${err.message}`);
                res.status(500).json({ error: 'Error obteniendo usuarios' });
            } else {
                res.json({ usuarios: rows });
            }
        });
    } catch (error) {
        log('ERROR', `Error en API usuarios: ${error.message}`);
        res.status(500).json({ error: 'Error obteniendo usuarios' });
    }
});

app.get('/api/consola', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const nivel = req.query.nivel || null;
        
        let query = 'SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?';
        let params = [limit];
        
        if (nivel) {
            query = 'SELECT * FROM logs WHERE nivel = ? ORDER BY timestamp DESC LIMIT ?';
            params = [nivel, limit];
        }
        
        db.all(query, params, (err, rows) => {
            if (err) {
                log('ERROR', `Error obteniendo logs: ${err.message}`);
                res.status(500).json({ error: 'Error obteniendo logs' });
            } else {
                res.json({ logs: rows });
            }
        });
    } catch (error) {
        log('ERROR', `Error en API consola: ${error.message}`);
        res.status(500).json({ error: 'Error obteniendo logs' });
    }
});

app.post('/api/control', authenticateAPI, async (req, res) => {
    try {
        const { action, telegram_id, value } = req.body;
        
        if (!action) {
            return res.status(400).json({ error: 'Action es requerida' });
        }
        
        let result;
        
        switch (action) {
            case 'pause':
                if (telegram_id) {
                    result = await toggleUserStatus(telegram_id, false);
                    log('INFO', `Usuario ${telegram_id} pausado desde dashboard`, telegram_id);
                } else {
                    // Pausar bot globalmente
                    botGlobalStatus.isActive = false;
                    botGlobalStatus.lastPausedBy = 'dashboard';
                    botGlobalStatus.lastPausedAt = new Date().toISOString();
                    result = 1;
                    log('INFO', 'Bot pausado globalmente desde dashboard');
                }
                break;
            case 'resume':
                if (telegram_id) {
                    result = await toggleUserStatus(telegram_id, true);
                    log('INFO', `Usuario ${telegram_id} reanudado desde dashboard`, telegram_id);
                } else {
                    // Reanudar bot globalmente
                    botGlobalStatus.isActive = true;
                    botGlobalStatus.lastResumedBy = 'dashboard';
                    botGlobalStatus.lastResumedAt = new Date().toISOString();
                    result = 1;
                    log('INFO', 'Bot reanudado globalmente desde dashboard');
                }
                break;
            case 'interval':
                return res.status(400).json({ error: 'Comando interval ya no está disponible. El bot verifica automáticamente cada 15 minutos.' });
            default:
                return res.status(400).json({ error: 'Action inválida' });
        }
        
        res.json({ success: true, changes: result });
    } catch (error) {
        log('ERROR', `Error en API control: ${error.message}`);
        res.status(500).json({ error: 'Error procesando comando' });
    }
});

app.get('/api/status', async (req, res) => {
    try {
        const usuarios = await getActiveUsers();
        const lastCotizacion = await getLastCotizacion();
        
        res.json({
            status: botGlobalStatus.isActive ? 'active' : 'paused',
            bot_global_status: botGlobalStatus,
            usuarios_activos: usuarios.length,
            total_usuarios: await new Promise((resolve) => {
                db.get('SELECT COUNT(*) as count FROM usuarios', (err, row) => {
                    resolve(row ? row.count : 0);
                });
            }),
            ultima_cotizacion: lastCotizacion ? {
                compra: lastCotizacion.compra,
                venta: lastCotizacion.venta,
                timestamp: lastCotizacion.timestamp
            } : null,
            uptime: process.uptime()
        });
    } catch (error) {
        log('ERROR', `Error en API status: ${error.message}`);
        res.status(500).json({ error: 'Error obteniendo estado' });
    }
});

// Endpoint de salud
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Inicializar base de datos y comenzar verificación periódica
initDatabase();

// Verificar cotizaciones periódicamente
setInterval(checkAndNotifyChanges, config.checkInterval * 1000);

// Iniciar servidor
app.listen(config.port, () => {
    log('INFO', `🚀 Servidor iniciado en puerto ${config.port}`);
    log('INFO', `🤖 Bot de Telegram activo`);
    log('INFO', `📊 Dashboard disponible en /api/*`);
});

// Manejo de errores del bot
bot.on('error', (error) => {
    log('ERROR', `Error del bot de Telegram: ${error.message}`);
});

bot.on('polling_error', (error) => {
    log('ERROR', `Error de polling: ${error.message}`);
});

// Manejo de cierre graceful
process.on('SIGINT', () => {
    log('INFO', 'Cerrando aplicación...');
    bot.stopPolling();
    db.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    log('INFO', 'Cerrando aplicación...');
    bot.stopPolling();
    db.close();
    process.exit(0);
});

log('INFO', '✅ Aplicación iniciada correctamente');
