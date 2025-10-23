// Dashboard JavaScript
class DolarDashboard {
    constructor() {
        this.config = CONFIG;
        this.refreshInterval = null;
        this.currentUserModal = null;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.startAutoRefresh();
        this.loadInitialData();
        
        console.log('🚀 Dashboard inicializado correctamente');
    }
    
    setupEventListeners() {
        // Botón de actualizar cotización
        document.getElementById('refresh-cotizacion').addEventListener('click', () => {
            this.loadCotizacion();
        });
        
        // Filtro de logs
        document.getElementById('log-level-filter').addEventListener('change', (e) => {
            this.loadLogs(e.target.value);
        });
        
        // Botón limpiar logs
        document.getElementById('clear-logs').addEventListener('click', () => {
            this.clearLogs();
        });
        
        // Modal
        document.getElementById('close-modal').addEventListener('click', () => {
            this.closeModal();
        });
        
        // Click fuera del modal para cerrarlo
        document.getElementById('user-modal').addEventListener('click', (e) => {
            if (e.target.id === 'user-modal') {
                this.closeModal();
            }
        });
        
        // Botones del modal
        document.getElementById('toggle-status').addEventListener('click', () => {
            this.toggleUserStatus();
        });
        
        // Botones de control global
        document.getElementById('pause-bot').addEventListener('click', () => {
            this.pauseBot();
        });
        
        document.getElementById('resume-bot').addEventListener('click', () => {
            this.resumeBot();
        });
    }
    
    async loadInitialData() {
        await Promise.all([
            this.loadCotizacion(),
            this.loadUsuarios(),
            this.loadLogs(),
            this.loadBotStatus()
        ]);
        
        this.updateConnectionStatus(true);
    }
    
    startAutoRefresh() {
        this.refreshInterval = setInterval(() => {
            this.loadInitialData();
        }, this.config.REFRESH_INTERVAL);
    }
    
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }
    
    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('connection-status');
        
        if (statusElement) {
            const statusIcon = statusElement.querySelector('i');
            
            if (connected) {
                statusElement.className = 'status-indicator connected';
                if (statusIcon) statusIcon.className = 'fas fa-circle';
                statusElement.textContent = ' Conectado';
            } else {
                statusElement.className = 'status-indicator disconnected';
                if (statusIcon) statusIcon.className = 'fas fa-circle';
                statusElement.textContent = ' Desconectado';
            }
        }
    }
    
    updateLastUpdateTime() {
        const now = new Date();
        const timeString = now.toLocaleString('es-AR');
        document.getElementById('last-update').textContent = `Última actualización: ${timeString}`;
    }
    
    async makeAPIRequest(endpoint, options = {}) {
        const url = `${this.config.BOT_API_URL}${endpoint}`;
        
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': this.config.API_SECRET_KEY
            }
        };
        
        const finalOptions = { ...defaultOptions, ...options };
        
        try {
            const response = await fetch(url, finalOptions);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`Error en API request a ${endpoint}:`, error);
            throw error;
        }
    }
    
    async loadCotizacion() {
        const loadingElement = document.getElementById('cotizacion-loading');
        const contentElement = document.getElementById('cotizacion-content');
        const errorElement = document.getElementById('cotizacion-error');
        
        try {
            loadingElement.style.display = 'block';
            contentElement.style.display = 'none';
            errorElement.style.display = 'none';
            
            const data = await this.makeAPIRequest('/api/cotizacion');
            
            // Actualizar valores
            document.getElementById('compra-actual').textContent = `$${data.actual.compra.toFixed(2)}`;
            document.getElementById('venta-actual').textContent = `$${data.actual.venta.toFixed(2)}`;
            
            // Actualizar variaciones
            const compraVar = data.variacion.compra;
            const ventaVar = data.variacion.venta;
            
            const compraVarElement = document.getElementById('variacion-compra');
            const ventaVarElement = document.getElementById('variacion-venta');
            
            this.updateVariacion(compraVarElement, compraVar);
            this.updateVariacion(ventaVarElement, ventaVar);
            
            // Actualizar timestamp
            const timestamp = new Date(data.actual.timestamp).toLocaleString('es-AR');
            document.getElementById('cotizacion-timestamp').textContent = timestamp;
            
            loadingElement.style.display = 'none';
            contentElement.style.display = 'block';
            
            this.updateConnectionStatus(true);
            this.updateLastUpdateTime();
            
        } catch (error) {
            loadingElement.style.display = 'none';
            contentElement.style.display = 'none';
            errorElement.style.display = 'block';
            errorElement.textContent = `Error: ${error.message}`;
            
            this.updateConnectionStatus(false);
            this.showToast('Error cargando cotización', 'error');
        }
    }
    
    updateVariacion(element, value) {
        element.textContent = value >= 0 ? `+$${value.toFixed(2)}` : `-$${Math.abs(value).toFixed(2)}`;
        
        element.className = 'variacion';
        if (value > 0) {
            element.classList.add('positive');
        } else if (value < 0) {
            element.classList.add('negative');
        } else {
            element.classList.add('neutral');
        }
    }
    
    async loadUsuarios() {
        const loadingElement = document.getElementById('usuarios-loading');
        const contentElement = document.getElementById('usuarios-content');
        const errorElement = document.getElementById('usuarios-error');
        
        try {
            loadingElement.style.display = 'block';
            contentElement.style.display = 'none';
            errorElement.style.display = 'none';
            
            const data = await this.makeAPIRequest('/api/usuarios');
            const usuarios = data.usuarios;
            
            // Actualizar estadísticas
            const totalUsuarios = usuarios.length;
            const usuariosActivos = usuarios.filter(u => u.activo).length;
            
            document.getElementById('total-usuarios').textContent = `Total: ${totalUsuarios}`;
            document.getElementById('usuarios-activos').textContent = `Activos: ${usuariosActivos}`;
            
            // Renderizar lista de usuarios
            const usuariosList = document.getElementById('usuarios-list');
            usuariosList.innerHTML = '';
            
            if (usuarios.length === 0) {
                usuariosList.innerHTML = '<div class="no-data">No hay usuarios registrados</div>';
            } else {
                usuarios.forEach(usuario => {
                    const usuarioElement = this.createUsuarioElement(usuario);
                    usuariosList.appendChild(usuarioElement);
                });
            }
            
            loadingElement.style.display = 'none';
            contentElement.style.display = 'block';
            
        } catch (error) {
            loadingElement.style.display = 'none';
            contentElement.style.display = 'none';
            errorElement.style.display = 'block';
            errorElement.textContent = `Error: ${error.message}`;
            
            this.showToast('Error cargando usuarios', 'error');
        }
    }
    
    createUsuarioElement(usuario) {
        const div = document.createElement('div');
        div.className = 'usuario-item';
        
        const statusClass = usuario.activo ? 'active' : 'inactive';
        const statusText = usuario.activo ? 'Activo' : 'Pausado';
        
        div.innerHTML = `
            <div class="usuario-info">
                <div class="usuario-id">Usuario ${usuario.telegram_id}</div>
                <div class="usuario-details">
                    <span>@${usuario.username || 'Sin username'}</span>
                    <span>Notificaciones: ${usuario.activo ? 'Cada 15 min' : 'Pausadas'}</span>
                    <span>Registrado: ${new Date(usuario.fecha_registro).toLocaleDateString('es-AR')}</span>
                </div>
            </div>
            <div class="usuario-controls">
                <span class="usuario-status ${statusClass}">${statusText}</span>
                <button class="btn btn-small btn-primary" onclick="dashboard.openUserModal(${usuario.telegram_id})">
                    <i class="fas fa-cog"></i> Control
                </button>
            </div>
        `;
        
        return div;
    }
    
    async loadLogs(level = '') {
        const loadingElement = document.getElementById('consola-loading');
        const contentElement = document.getElementById('consola-content');
        const errorElement = document.getElementById('consola-error');
        
        try {
            loadingElement.style.display = 'block';
            contentElement.style.display = 'none';
            errorElement.style.display = 'none';
            
            const endpoint = level ? `/api/consola?level=${level}&limit=${this.config.MAX_CONSOLE_ENTRIES}` : `/api/consola?limit=${this.config.MAX_CONSOLE_ENTRIES}`;
            const data = await this.makeAPIRequest(endpoint);
            const logs = data.logs;
            
            // Renderizar logs
            const logsContainer = document.getElementById('logs-container');
            logsContainer.innerHTML = '';
            
            if (logs.length === 0) {
                logsContainer.innerHTML = '<div class="no-logs">No hay logs disponibles</div>';
            } else {
                logs.reverse().forEach(log => {
                    const logElement = this.createLogElement(log);
                    logsContainer.appendChild(logElement);
                });
            }
            
            loadingElement.style.display = 'none';
            contentElement.style.display = 'block';
            
        } catch (error) {
            loadingElement.style.display = 'none';
            contentElement.style.display = 'none';
            errorElement.style.display = 'block';
            errorElement.textContent = `Error: ${error.message}`;
            
            this.showToast('Error cargando logs', 'error');
        }
    }
    
    createLogElement(log) {
        const div = document.createElement('div');
        div.className = 'log-entry';
        
        const timestamp = new Date(log.timestamp).toLocaleString('es-AR');
        
        div.innerHTML = `
            <span class="log-timestamp">${timestamp}</span>
            <span class="log-level ${log.nivel}">${log.nivel}</span>
            <span class="log-message">${log.mensaje}</span>
        `;
        
        return div;
    }
    
    async clearLogs() {
        if (confirm('¿Estás seguro de que quieres limpiar los logs?')) {
            try {
                await this.makeAPIRequest('/api/consola', { method: 'DELETE' });
                this.showToast('Logs limpiados correctamente', 'success');
                this.loadLogs();
            } catch (error) {
                this.showToast('Error limpiando logs', 'error');
            }
        }
    }
    
    async openUserModal(telegramId) {
        try {
            const data = await this.makeAPIRequest('/api/usuarios');
            const usuario = data.usuarios.find(u => u.telegram_id === telegramId);
            
            if (!usuario) {
                this.showToast('Usuario no encontrado', 'error');
                return;
            }
            
            this.currentUserModal = usuario;
            
            // Actualizar información del modal
            document.getElementById('modal-user-info').innerHTML = `
                <div><strong>ID:</strong> ${usuario.telegram_id}</div>
                <div><strong>Username:</strong> @${usuario.username || 'Sin username'}</div>
                <div><strong>Estado:</strong> ${usuario.activo ? 'Activo' : 'Pausado'}</div>
                <div><strong>Notificaciones:</strong> ${usuario.activo ? 'Activadas cada 15 min' : 'Pausadas'}</div>
                <div><strong>Registrado:</strong> ${new Date(usuario.fecha_registro).toLocaleString('es-AR')}</div>
            `;
            
            // Actualizar controles
            const toggleButton = document.getElementById('toggle-status');
            
            if (usuario.activo) {
                toggleButton.innerHTML = '<i class="fas fa-pause"></i> Pausar';
                toggleButton.className = 'btn btn-toggle btn-danger';
            } else {
                toggleButton.innerHTML = '<i class="fas fa-play"></i> Activar';
                toggleButton.className = 'btn btn-toggle btn-success';
            }
            
            // Mostrar modal
            document.getElementById('user-modal').style.display = 'flex';
            
        } catch (error) {
            this.showToast('Error cargando datos del usuario', 'error');
        }
    }
    
    closeModal() {
        document.getElementById('user-modal').style.display = 'none';
        this.currentUserModal = null;
    }
    
    async toggleUserStatus() {
        if (!this.currentUserModal) return;
        
        try {
            const newStatus = !this.currentUserModal.activo;
            const action = newStatus ? 'resume' : 'pause';
            
            await this.makeAPIRequest('/api/control', {
                method: 'POST',
                body: JSON.stringify({
                    action: action,
                    telegram_id: this.currentUserModal.telegram_id
                })
            });
            
            this.currentUserModal.activo = newStatus;
            this.showToast(`Usuario ${newStatus ? 'activado' : 'pausado'} correctamente`, 'success');
            
            // Actualizar botón
            const toggleButton = document.getElementById('toggle-status');
            if (newStatus) {
                toggleButton.innerHTML = '<i class="fas fa-pause"></i> Pausar';
                toggleButton.className = 'btn btn-toggle btn-danger';
            } else {
                toggleButton.innerHTML = '<i class="fas fa-play"></i> Activar';
                toggleButton.className = 'btn btn-toggle btn-success';
            }
            
            // Recargar usuarios
            this.loadUsuarios();
            
        } catch (error) {
            this.showToast('Error cambiando estado del usuario', 'error');
        }
    }
    
    
    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toast-container');
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-${this.getToastIcon(type)}"></i>
                <span>${message}</span>
            </div>
        `;
        
        toastContainer.appendChild(toast);
        
        // Auto-remove después de 5 segundos
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 5000);
    }
    
    getToastIcon(type) {
        switch (type) {
            case 'success': return 'check-circle';
            case 'error': return 'exclamation-circle';
            case 'warning': return 'exclamation-triangle';
            default: return 'info-circle';
        }
    }
    
    async loadBotStatus() {
        try {
            const data = await this.makeAPIRequest('/api/status');
            this.updateBotGlobalStatus(data.bot_global_status);
        } catch (error) {
            console.error('Error cargando estado del bot:', error);
        }
    }
    
    updateBotGlobalStatus(botStatus) {
        const statusElement = document.getElementById('bot-global-status');
        const pauseButton = document.getElementById('pause-bot');
        const resumeButton = document.getElementById('resume-bot');
        
        if (botStatus.isActive) {
            statusElement.className = 'bot-status-indicator active';
            statusElement.innerHTML = '<i class="fas fa-circle"></i> Bot: Activo';
            pauseButton.style.display = 'inline-flex';
            resumeButton.style.display = 'none';
        } else {
            statusElement.className = 'bot-status-indicator paused';
            statusElement.innerHTML = '<i class="fas fa-circle"></i> Bot: Pausado';
            pauseButton.style.display = 'none';
            resumeButton.style.display = 'inline-flex';
        }
    }
    
    async pauseBot() {
        if (confirm('¿Estás seguro de que quieres pausar el bot para TODOS los usuarios?')) {
            try {
                await this.makeAPIRequest('/api/control', {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'pause'
                    })
                });
                
                this.showToast('Bot pausado globalmente', 'success');
                this.loadBotStatus();
                
            } catch (error) {
                this.showToast('Error pausando el bot', 'error');
            }
        }
    }
    
    async resumeBot() {
        try {
            await this.makeAPIRequest('/api/control', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'resume'
                })
            });
            
            this.showToast('Bot reanudado globalmente', 'success');
            this.loadBotStatus();
            
        } catch (error) {
            this.showToast('Error reanudando el bot', 'error');
        }
    }
}

// Inicializar dashboard cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new DolarDashboard();
});

// Manejo de errores globales
window.addEventListener('error', (event) => {
    console.error('Error global:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Promise rechazada:', event.reason);
});

// Detener auto-refresh cuando la página se oculta
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        window.dashboard.stopAutoRefresh();
    } else {
        window.dashboard.startAutoRefresh();
    }
});
