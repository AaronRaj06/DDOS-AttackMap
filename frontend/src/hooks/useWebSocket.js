import { useEffect, useRef, useState, useCallback } from 'react';

export function useWebSocket(url) {
    const wsRef = useRef(null);
    const [isConnected, setIsConnected] = useState(false);
    const [lastMessage, setLastMessage] = useState(null);
    const [events, setEvents] = useState([]);
    const reconnectTimeoutRef = useRef(null);

    const connect = useCallback(() => {
        try {
            const ws = new WebSocket(url);

            ws.onopen = () => {
                console.log('✅ WebSocket connected');
                setIsConnected(true);
            };

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    setLastMessage(message);

                    // Add to events list if it's an attack event
                    if (message.type === 'event' || message.type === 'event_update') {
                        setEvents(prev => {
                            // Update existing event or add new one
                            const existingIndex = prev.findIndex(e => e.id === message.data.id);
                            if (existingIndex >= 0) {
                                // Update existing event with enrichment
                                const updated = [...prev];
                                updated[existingIndex] = message.data;
                                return updated;
                            }
                            // Add new event (keep last 100)
                            return [...prev.slice(-99), message.data];
                        });
                    }
                } catch (err) {
                    console.error('Error parsing WebSocket message:', err);
                }
            };

            ws.onerror = (error) => {
                console.error('❌ WebSocket error:', error);
            };

            ws.onclose = () => {
                console.log('🔌 WebSocket disconnected');
                setIsConnected(false);

                // Auto-reconnect after 3 seconds
                reconnectTimeoutRef.current = setTimeout(() => {
                    console.log('🔄 Attempting to reconnect...');
                    connect();
                }, 3000);
            };

            wsRef.current = ws;
        } catch (err) {
            console.error('Failed to create WebSocket:', err);
        }
    }, [url]);

    useEffect(() => {
        connect();

        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [connect]);

    return {
        isConnected,
        lastMessage,
        events,
        ws: wsRef.current
    };
}
