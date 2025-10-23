# 🤖 DolarBotardo - Bot de Telegram para Cotización del Dólar

Un bot de Telegram completo con dashboard web para consultar la cotización del dólar oficial en Argentina.

## 🚀 Características

### Bot de Telegram
- ✅ Consulta cotización del dólar oficial en tiempo real
- ✅ Notificaciones automáticas cuando cambia la cotización
- ✅ Configuración de intervalos personalizados por usuario
- ✅ Pausar/reanudar notificaciones
- ✅ Comandos amigables con emojis
- ✅ Persistencia de datos en SQLite

### Dashboard Web
- ✅ Visualización de cotización actual y variaciones
- ✅ Control de usuarios registrados
- ✅ Consola de logs en tiempo real
- ✅ Interfaz responsive y moderna
- ✅ Actualización automática cada 30 segundos

## 📁 Estructura del Proyecto

```
DolarBotardo/
├── bot/                    # Bot de Telegram + API Express
│   ├── index.js           # Lógica principal del bot
│   ├── package.json       # Dependencias del bot
│   ├── env.example        # Variables de entorno de ejemplo
│   ├── db.sqlite         # Base de datos SQLite (se crea automáticamente)
│   └── logs.txt          # Archivo de logs (se crea automáticamente)
├── dashboard/             # Dashboard web estático
│   ├── index.html        # Página principal
│   ├── script.js         # Lógica JavaScript
│   ├── style.css         # Estilos CSS
│   └── config.js         # Configuración del dashboard
└── README.md             # Este archivo
```

## 🛠️ Instalación y Configuración

### 1. Clonar el repositorio
```bash
git clone <tu-repositorio>
cd DolarBotardo
```

### 2. Configurar el Bot de Telegram

#### Crear el bot en Telegram:
1. Habla con [@BotFather](https://t.me/BotFather) en Telegram
2. Ejecuta `/newbot`
3. Sigue las instrucciones para crear tu bot
4. Copia el token que te proporciona

#### Configurar variables de entorno:
```bash
cd bot
cp env.example .env
```

Edita el archivo `.env` con tus valores:
```env
TELEGRAM_TOKEN=tu_token_de_telegram_aqui
API_SECRET_KEY=tu_clave_secreta_aqui
```

### 3. Instalar dependencias del bot
```bash
cd bot
npm install
```

### 4. Configurar el dashboard
Edita `dashboard/config.js` con tus valores:
```javascript
const CONFIG = {
    BOT_API_URL: 'https://tu-bot.onrender.com',
    API_SECRET_KEY: 'tu_clave_secreta_aqui',
    // ... resto de configuración
};
```

## 🚀 Deploy

### Bot en Render

1. **Crear cuenta en [Render](https://render.com)**

2. **Crear nuevo Web Service:**
   - Connect your repository
   - Selecciona la carpeta `bot`
   - Build Command: `npm install`
   - Start Command: `npm start`

3. **Configurar variables de entorno en Render:**
   ```
   TELEGRAM_TOKEN=tu_token_de_telegram
   API_SECRET_KEY=tu_clave_secreta
   NODE_ENV=production
   ```

4. **Deploy:** Render construirá y desplegará automáticamente

### Dashboard en GitHub Pages

1. **Subir el dashboard a GitHub:**
   ```bash
   git add dashboard/
   git commit -m "Add dashboard"
   git push origin main
   ```

2. **Activar GitHub Pages:**
   - Ve a Settings → Pages
   - Source: Deploy from a branch
   - Branch: main / folder: /dashboard

3. **Actualizar config.js:**
   - Cambia `BOT_API_URL` por la URL de tu bot en Render

### Dashboard en Netlify (Alternativa)

1. **Crear cuenta en [Netlify](https://netlify.com)**

2. **Deploy:**
   - Drag & drop la carpeta `dashboard`
   - O conectar con GitHub

3. **Configurar variables de entorno (opcional):**
   - Site settings → Environment variables

## 🤖 Comandos del Bot

| Comando | Descripción |
|---------|-------------|
| `/start` | Iniciar el bot y registrarse |
| `/cotizacion` | Consultar cotización actual |
| `/intervalo <segundos>` | Configurar intervalo de notificaciones |
| `/pause` | Pausar notificaciones automáticas |
| `/resume` | Reanudar notificaciones automáticas |
| `/status` | Ver estado actual del usuario |
| `/help` | Mostrar ayuda |

## 📊 API Endpoints

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/cotizacion` | GET | Obtener cotización actual |
| `/api/usuarios` | GET | Listar usuarios registrados |
| `/api/consola` | GET | Obtener logs del bot |
| `/api/control` | POST | Controlar usuarios (requiere autenticación) |
| `/api/status` | GET | Estado general del bot |
| `/health` | GET | Health check |

## 🔧 Desarrollo Local

### Ejecutar el bot localmente:
```bash
cd bot
npm install
npm start
```

### Ejecutar en modo desarrollo:
```bash
npm run dev
```

El bot estará disponible en `http://localhost:3000`

### Abrir el dashboard:
Simplemente abre `dashboard/index.html` en tu navegador.

## 📝 Base de Datos

El bot usa SQLite con las siguientes tablas:

### `usuarios`
- `telegram_id` - ID único del usuario
- `username` - Nombre de usuario de Telegram
- `intervalo` - Intervalo de notificaciones en segundos
- `ultima_cotizacion_compra` - Último valor de compra enviado
- `ultima_cotizacion_venta` - Último valor de venta enviado
- `activo` - Estado del usuario (activo/pausado)
- `fecha_registro` - Fecha de registro
- `ultima_actualizacion` - Última actualización

### `logs`
- `id` - ID único del log
- `timestamp` - Fecha y hora
- `nivel` - Nivel del log (INFO, WARNING, ERROR)
- `mensaje` - Contenido del mensaje
- `telegram_id` - ID del usuario relacionado (opcional)

### `cotizaciones`
- `id` - ID único
- `timestamp` - Momento de la cotización
- `compra` - Valor de compra
- `venta` - Valor de venta
- `variacion_compra` - Variación de compra
- `variacion_venta` - Variación de venta

## 🔐 Seguridad

- Autenticación con clave secreta para endpoints de control
- Validación de entrada en todos los endpoints
- Sanitización de datos de usuario
- CORS configurado correctamente
- Rate limiting básico

## 📱 Uso del Dashboard

1. **Cotización Actual:** Muestra el valor actual del dólar y variaciones
2. **Usuarios:** Lista todos los usuarios registrados con controles
3. **Consola:** Logs en tiempo real del bot
4. **Control de Usuario:** Pausar/reanudar y cambiar intervalos

## 🛠️ Tecnologías Utilizadas

### Backend (Bot)
- Node.js
- Express.js
- node-telegram-bot-api
- SQLite3
- Axios
- Helmet
- CORS

### Frontend (Dashboard)
- HTML5
- CSS3 (Grid, Flexbox)
- JavaScript (ES6+)
- Font Awesome Icons

## 📄 Licencia

MIT License - Ver archivo LICENSE para más detalles.

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature
3. Commit tus cambios
4. Push a la rama
5. Abre un Pull Request

## 📞 Soporte

Si tienes problemas o preguntas:

1. Revisa este README
2. Verifica las variables de entorno
3. Revisa los logs del bot
4. Abre un issue en GitHub

---

**¡Disfruta usando DolarBotardo! 🇦🇷💵**
