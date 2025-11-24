import { WebSocketServer } from 'ws';

export class EventBroadcaster {
    constructor(server) {
        this.wss = new WebSocketServer({ server, path: '/ws' });
        this.clients = new Set();

        this.wss.on('connection', (ws, req) => {
            const clientIP = req.socket.remoteAddress;
            console.log(`🔌 WebSocket client connected from ${clientIP}`);
            this.clients.add(ws);

            ws.on('close', () => {
                console.log(`🔌 WebSocket client disconnected from ${clientIP}`);
                this.clients.delete(ws);
            });

            ws.on('error', (error) => {
                console.error(`❌ WebSocket error: ${error.message}`);
                this.clients.delete(ws);
            });

            // Send welcome message
            ws.send(JSON.stringify({
                type: 'connected',
                message: 'Connected to DDoS Attack Map WebSocket',
                timestamp: new Date().toISOString()
            }));
        });

        console.log('✓ WebSocket server initialized on /ws');
    }

    broadcast(message) {
        const payload = JSON.stringify(message);
        let successCount = 0;
        let errorCount = 0;

        this.clients.forEach((client) => {
            try {
                if (client.readyState === 1) { // OPEN state
                    client.send(payload);
                    successCount++;
                }
            } catch (error) {
                console.error('Error broadcasting to client:', error.message);
                errorCount++;
            }
        });

        if (successCount > 0) {
            // Only log occasionally to avoid spam
            if (Math.random() < 0.05) { // 5% of broadcasts
                console.log(`📡 Broadcasted to ${successCount} client(s)`);
            }
        }
    }

    getClientCount() {
        return this.clients.size;
    }
}
