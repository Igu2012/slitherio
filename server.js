const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const MAP_SIZE = 5000;
const MAX_FOOD = 600;

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
                players.set(playerId, {
                    id: playerId,
                    x: Math.random() * MAP_SIZE,
                    y: Math.random() * MAP_SIZE,
                    angle: 0,
                    score: 3,
                    name: data.name || 'Player',
                    colors: data.colors || ['#00ff00'],
                    isSprinting: false,
                    lastUpdate: Date.now()
                });
                ws.send(JSON.stringify({ type: 'init', id: playerId, mapSize: MAP_SIZE }));
            } 
            else if (data.type === 'update' && players.has(playerId)) {
                const p = players.get(playerId);
                p.x = data.x;
                p.y = data.y;
                p.angle = data.angle;
                p.score = data.score;
                p.isSprinting = data.isSprinting;
                p.lastUpdate = Date.now();
            }
            else if (data.type === 'eat' && players.has(playerId)) {
                const foodIndex = foods.findIndex(f => f.id === data.foodId);
                if (foodIndex !== -1) {
                    foods[foodIndex] = spawnFood();
                    // Broadcast food update to all
                    const foodMsg = JSON.stringify({ type: 'food', index: foodIndex, newFood: foods[foodIndex] });
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) client.send(foodMsg);
                    });
                }
            }
            else if (data.type === 'die' && players.has(playerId)) {
                const p = players.get(playerId);
                // Create food from dead snake segments (simplified)
                if (data.segments) {
                    data.segments.forEach((s, i) => {
                        if (i % 5 === 0) {
                            foods.push({
                                id: Math.random().toString(36).substr(2, 5),
                                x: s.x,
                                y: s.y,
                                color: p.colors[0],
                                value: 2
                            });
                        }
                    });
                    // Keep food count in check
                    if (foods.length > MAX_FOOD + 100) foods.splice(MAX_FOOD, foods.length - MAX_FOOD);
                }
                players.delete(playerId);
            }
        } catch (e) {}
    });

    ws.on('close', () => players.delete(playerId));
});

// Broadcast game state at 20fps to save bandwidth/CPU
setInterval(() => {
    if (players.size === 0) return;
    
    const now = Date.now();
    const playerList = [];
    for (const [id, p] of players) {
        // Timeout players inactive for > 5s
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
}, 50); // 20 FPS

// Periodically sync all food (less frequent)
setInterval(() => {
    const foodSync = JSON.stringify({ type: 'foodSync', f: foods });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(foodSync);
    });
}, 5000);

server.listen(PORT, () => {
    console.log(`Server optimized for 100 players running on port ${PORT}`);
});
