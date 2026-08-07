const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const MAP_SIZE = 15000; // Increased from 5000
const MAX_FOOD = 800;

let players = new Map();
let foods = [];

function spawnFood() {
    return {
        id: Math.random().toString(36).substr(2, 5),
        x: Math.random() * MAP_SIZE,
        y: Math.random() * MAP_SIZE,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        value: 1
    };
}

// Initialize food
for (let i = 0; i < MAX_FOOD; i++) foods.push(spawnFood());

app.use(express.static(path.join(__dirname, 'public')));

wss.on('connection', (ws) => {
    const playerId = Math.random().toString(36).substr(2, 9);
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'join') {
                const margin = MAP_SIZE * 0.1;
                players.set(playerId, {
                    id: playerId,
                    x: margin + Math.random() * (MAP_SIZE - 2 * margin),
                    y: margin + Math.random() * (MAP_SIZE - 2 * margin),
                    angle: 0,
                    score: 3,
                    name: (data.name || 'Player').substring(0, 12),
                    colors: data.colors || ['#00ff00'],
                    isSprinting: false,
                    lastUpdate: Date.now()
                });
                ws.send(JSON.stringify({ type: 'init', id: playerId, mapSize: MAP_SIZE }));
            } 
            else if (data.type === 'update' && players.has(playerId)) {
                const p = players.get(playerId);
                p.x = Math.max(0, Math.min(MAP_SIZE, data.x));
                p.y = Math.max(0, Math.min(MAP_SIZE, data.y));
                p.angle = data.angle;
                p.score = Math.max(3, data.score);
                p.isSprinting = data.isSprinting;
                p.lastUpdate = Date.now();
            }
            else if (data.type === 'eat' && players.has(playerId)) {
                const foodIndex = foods.findIndex(f => f.id === data.foodId);
                if (foodIndex !== -1) {
                    foods[foodIndex] = spawnFood();
                }
            }
            else if (data.type === 'die' && players.has(playerId)) {
                players.delete(playerId);
            }
        } catch (e) {}
    });

    ws.on('close', () => players.delete(playerId));
});

// Broadcast game state at 20fps
setInterval(() => {
    if (players.size === 0) return;
    
    const now = Date.now();
    const playerList = [];
    for (const [id, p] of players) {
        if (now - p.lastUpdate > 5000) {
            players.delete(id);
            continue;
        }
        playerList.push({
            id: p.id, x: p.x, y: p.y, a: p.angle, s: p.score, 
            n: p.name, c: p.colors, sp: p.isSprinting
        });
    }

    const state = JSON.stringify({ type: 'sync', p: playerList });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(state);
    });
}, 50);

// Periodically sync all food
setInterval(() => {
    const foodSync = JSON.stringify({ type: 'foodSync', f: foods });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(foodSync);
    });
}, 5000);

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} with map size ${MAP_SIZE}`);
});
