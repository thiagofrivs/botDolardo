// Configuración del dashboard
const CONFIG = {
    // URL del bot en producción (cambiar por tu URL de Render)
    BOT_API_URL: 'botdolardo.thiagofrivs01.workers.dev',
    
    // Clave secreta para autenticación (debe coincidir con la del bot)
    API_SECRET_KEY: 'Altb1218.',
    
    // Intervalo de actualización del dashboard en milisegundos
    REFRESH_INTERVAL: 30000, // 30 segundos
    
    // Configuración de la consola
    MAX_CONSOLE_ENTRIES: 50,
    
    // Configuración de la interfaz
    THEME: 'light', // 'light' o 'dark'
    
    // Mensajes de error personalizados
    ERROR_MESSAGES: {
        CONNECTION_ERROR: '❌ Error de conexión con el servidor',
        AUTH_ERROR: '❌ Error de autenticación',
        INVALID_DATA: '❌ Datos inválidos recibidos',
        UNKNOWN_ERROR: '❌ Error desconocido'
    }
};
