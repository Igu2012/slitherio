const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
// const open = require('open');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const MAP_SIZE = 5000;
const INITIAL_FOOD_COUNT = 500;

// =============================================
// CONFIGURAÇÕES DE OTIMIZAÇÃO - v8
// =============================================
const TRAIL_RECORD_EVERY = 3;  // Registrar apenas 1 a cada 3 posições (reduz 66% de dados)
const MIN_SIZE_LIMIT = 3; // Tamanho mínimo: 3 segmentos (3 pontos)    // SEM LIMITE MÍNIMO - pode ficar minúscula com sprint

let players = {};
let foods = [];

function spawnFood() {
    return {
        id: Math.random().toString(36).substr(2, 9),
        x: Math.random() * MAP_SIZE,
        y: Math.random() * MAP_SIZE,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        value: 1 // Cada bolinha vale 1 ponto
    };
}

for (let i = 0; i < INITIAL_FOOD_COUNT; i++) foods.push(spawnFood());

const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));
app.get('/', (req, res) => { res.sendFile(path.join(publicPath, 'index.html')); });

wss.on('connection', (ws) => {
    const playerId = Math.random().toString(36).substr(2, 9);
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.type === 'join') {
            const margin = MAP_SIZE * 0.1;
            players[playerId] = {
                id: playerId, 
                x: margin + Math.random() * (MAP_SIZE - 2 * margin), 
                y: margin + Math.random() * (MAP_SIZE - 2 * margin),
                angle: Math.random() * Math.PI * 2, 
                segments: [], 
                length: 3, // Tamanho inicial: 3
                colors: data.colors || ['#00ff00'], 
                score: 3, // Pontos iniciais: 3 (tamanho = pontos) 
                name: data.name || 'Player', 
                isSprinting: false, 
                ws: ws, 
                isDead: false, 
                tickCount: 0  // Contador para rastro 1/3
            };
            // Inicializa segmentos iniciais
            for (let i = 0; i < 10; i++) {
                players[playerId].segments.push({ x: players[playerId].x, y: players[playerId].y });
            }
            ws.send(JSON.stringify({ type: 'init', id: playerId, mapSize: MAP_SIZE }));
        }
        if (data.type === 'move' && players[playerId]) players[playerId].angle = data.angle;
        if (data.type === 'sprint' && players[playerId]) players[playerId].isSprinting = data.active;
        if (data.type === 'leave') delete players[playerId];
    });
    ws.on('close', () => delete players[playerId]);
});

function handleDeath(playerId, x, y) {
    const player = players[playerId];
    if (!player || player.isDead) return;
    player.isDead = true;
    
    player.segments.forEach((s, idx) => {
        if (idx % 4 === 0) {
            foods.push({
                id: Math.random().toString(36).substr(2, 9),
                x: s.x + (Math.random() - 0.5) * 20,
                y: s.y + (Math.random() - 0.5) * 20,
                color: player.colors[idx % player.colors.length],
                value: 1 // Cada bolinha vale 1 ponto
            });
        }
    });

    if (player.ws && player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(JSON.stringify({ type: 'death', x: x, y: y }));
    }
    setTimeout(() => { if (players[playerId] && players[playerId].isDead) delete players[playerId]; }, 3500);
}

setInterval(() => {
    Object.values(players).forEach(player => {
        if (player.isDead) return;
        const baseSpeed = 3.0;
        // Sprint só funciona se tamanho for MAIOR que o mínimo (20)
        const isSprinting = player.isSprinting && player.length > MIN_SIZE_LIMIT;
        const speed = isSprinting ? baseSpeed * 2.5 : baseSpeed;

        if (isSprinting) {
            // Reduzir score durante sprint
            player.score = Math.max(MIN_SIZE_LIMIT, player.score - 0.1); // Mínimo: 20 pontos
            // Tamanho = pontos (1:1)
            player.length = player.score;
            if (Math.random() < 0.15) {
                const lastSeg = player.segments[player.segments.length - 1];
                foods.push({
                    id: Math.random().toString(36).substr(2, 9),
                    x: lastSeg.x,
                    y: lastSeg.y,
                    color: player.colors[0],
                    value: 1 // Cada bolinha vale 1 ponto
                });
            }
        }

        player.x += Math.cos(player.angle) * speed;
        player.y += Math.sin(player.angle) * speed;

        if (player.x < 0 || player.x > MAP_SIZE || player.y < 0 || player.y > MAP_SIZE) {
            handleDeath(player.id, player.x, player.y);
            return;
        }

        // ===== OTIMIZAÇÃO: Registra apenas 1 a cada 3 posições (TRAIL_RECORD_EVERY) =====
        // Isso reduz 66% do tráfego de rede enquanto mantém a qualidade visual
        // O cliente faz interpolação para ligar os pontos e manter o corpo sólido
        player.tickCount++;
        if (player.tickCount % TRAIL_RECORD_EVERY === 0) {
            player.segments.unshift({ x: player.x, y: player.y });
            // Mantém segmentos PROPORCIONAIS AO TAMANHO ATUAL (1:1)
            // Score 3 = 3 segmentos, Score 10 = 10 segmentos, etc
            const maxSegments = Math.floor(player.score);
            while (player.segments.length > maxSegments) player.segments.pop();
        }

        const thickness = Math.min(80, 26 + (player.length - 5) * 0.5);
        
        foods.forEach((food, index) => {
            const dx = player.x - food.x;
            const dy = player.y - food.y;
            if (Math.sqrt(dx * dx + dy * dy) < thickness) {
                // Cada bolinha vale 1 ponto
                player.score += food.value; // food.value = 1
                // Tamanho = pontos (1:1)
                player.length = player.score;
                foods[index] = spawnFood();
            }
        });

        Object.values(players).forEach(other => {
            if (player.id === other.id || other.isDead) return;
            const otherThickness = Math.min(80, 26 + (other.length - 5) * 0.5);
            for (let i = 0; i < other.segments.length; i += 4) {
                const seg = other.segments[i];
                const dx = player.x - seg.x;
                const dy = player.y - seg.y;
                if (Math.sqrt(dx * dx + dy * dy) < (otherThickness / 2 + 5)) {
                    handleDeath(player.id, player.x, player.y);
                    break;
                }
            }
        });
    });

    const state = JSON.stringify({
        type: 'update',
        players: Object.values(players).filter(p => !p.isDead).map(p => ({
            id: p.id, x: p.x, y: p.y, angle: p.angle,
            segments: p.segments, // Enviamos os segmentos já reduzidos em 1/3 (TRAIL_RECORD_EVERY)
            colors: p.colors, score: p.score, name: p.name, length: p.length
        })),
        foods: foods.slice(-600)
    });

    wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(state); });
}, 1000 / 30);

function getLocalIPs() {
    const interfaces = os.networkInterfaces(); const ips = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) { if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address); }
    }
    return ips;
}

server.listen(PORT, () => {
    const localIPs = getLocalIPs();
    console.log('\n' + ' '.repeat(25) + '\n   O JOGO ESTÁ NO AR! 🐍\n' + ' '.repeat(25));
    console.log(`\nServidor rodando na porta: ${PORT}`);
    if (localIPs.length > 0) {
        console.log('\nPara jogar com amigos ou no celular:');
        localIPs.forEach(ip => console.log(`🔗 http://${ip}:${PORT}`));
    }
    console.log('\n' + ' '.repeat(25) + '\nPressione Ctrl+C para fechar o servidor.\n');
});
