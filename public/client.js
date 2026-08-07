const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas.getContext('2d');
const menu = document.getElementById('menu');
const nicknameInput = document.getElementById('nickname');
const colorPicker = document.getElementById('color-picker');
const previewHead = document.getElementById('preview-head');
const startBtn = document.getElementById('start-btn');
const leaderboardTable = document.getElementById('leaderboard-table');
const killScreen = document.getElementById('kill-screen');
const respawnTimer = document.getElementById('respawn-timer');

let socket;
let playerId;
let mapSize = 5000;
let foods = [];
let players = new Map();
let me = null;
let camera = { x: 2500, y: 2500 };
let isDead = false;
let lastUpdate = 0;
let targetAngle = 0;

// Customization
let snakeColors = ['hsl(120, 70%, 50%)', 'hsl(210, 70%, 50%)', 'hsl(30, 70%, 50%)'];
const colors = ['hsl(0, 70%, 50%)', 'hsl(30, 70%, 50%)', 'hsl(60, 70%, 50%)', 'hsl(120, 70%, 50%)', 'hsl(210, 70%, 50%)', 'hsl(270, 70%, 50%)', 'hsl(0, 0%, 100%)'];

function initCustomization() {
    previewHead.style.backgroundColor = snakeColors[0];
    colors.forEach(color => {
        const div = document.createElement('div');
        div.className = 'color-option';
        div.style.backgroundColor = color;
        div.onclick = () => {
            snakeColors = [color, color, color];
            previewHead.style.backgroundColor = color;
        };
        colorPicker.appendChild(div);
    });
}
initCustomization();

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    minimapCanvas.width = 160;
    minimapCanvas.height = 160;
}
window.addEventListener('resize', resize);
resize();

function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}`);
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'init') {
            playerId = data.id;
            mapSize = data.mapSize;
        } else if (data.type === 'sync') {
            const serverIds = new Set();
            data.p.forEach(p => {
                serverIds.add(p.id);
                if (p.id === playerId) {
                    if (me) {
                        // Basic reconciliation if needed, but we trust local mostly
                        me.score = p.s;
                    }
                } else {
                    if (!players.has(p.id)) {
                        players.set(p.id, { ...p, segments: [{x: p.x, y: p.y}] });
                    } else {
                        const existing = players.get(p.id);
                        existing.x = p.x;
                        existing.y = p.y;
                        existing.a = p.a;
                        existing.s = p.s;
                        existing.sp = p.sp;
                    }
                }
            });
            // Remove players not in server sync
            for (const id of players.keys()) {
                if (!serverIds.has(id)) players.delete(id);
            }
            updateLeaderboard();
        } else if (data.type === 'foodSync') {
            foods = data.f;
        } else if (data.type === 'food') {
            foods[data.index] = data.newFood;
        }
    };
    socket.onclose = () => setTimeout(connect, 1000);
}

function updateLeaderboard() {
    const all = Array.from(players.values());
    if (me) all.push(me);
    const sorted = all.sort((a, b) => (b.s || b.score) - (a.s || a.score)).slice(0, 10);
    leaderboardTable.innerHTML = sorted.map((p, i) => `
        <tr>
            <td>${i + 1}.</td>
            <td style="color:${p.c ? p.c[0] : p.colors[0]}">${p.n || p.name}</td>
            <td>${Math.floor(p.s || p.score)}</td>
        </tr>
    `).join('');
}

function handleDeath() {
    if (isDead) return;
    isDead = true;
    socket.send(JSON.stringify({ type: 'die', segments: me.segments }));
    killScreen.style.display = 'flex';
    let count = 3;
    respawnTimer.innerText = count;
    const interval = setInterval(() => {
        count--;
        respawnTimer.innerText = count;
        if (count <= 0) {
            clearInterval(interval);
            isDead = false;
            killScreen.style.display = 'none';
            menu.style.display = 'block';
        }
    }, 1000);
}

startBtn.onclick = () => {
    const name = nicknameInput.value.trim() || 'Player';
    socket.send(JSON.stringify({ type: 'join', name, colors: snakeColors }));
    me = {
        x: Math.random() * mapSize,
        y: Math.random() * mapSize,
        angle: 0,
        score: 3,
        name,
        colors: snakeColors,
        segments: [],
        isSprinting: false
    };
    for(let i=0; i<10; i++) me.segments.push({x: me.x, y: me.y});
    menu.style.display = 'none';
};

// Input handling
const handleInput = (clientX, clientY) => {
    if (!me || isDead) return;
    const dx = clientX - canvas.width / 2;
    const dy = clientY - canvas.height / 2;
    targetAngle = Math.atan2(dy, dx);
};

window.addEventListener('mousemove', (e) => handleInput(e.clientX, e.clientY));
window.addEventListener('mousedown', () => { if(me) me.isSprinting = true; });
window.addEventListener('mouseup', () => { if(me) me.isSprinting = false; });

// Mobile touch
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleInput(touch.clientX, touch.clientY);
    if (e.touches.length > 1) me.isSprinting = true;
}, {passive: false});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleInput(touch.clientX, touch.clientY);
}, {passive: false});

canvas.addEventListener('touchend', () => { if(me) me.isSprinting = false; });

// Game Loop
function gameLoop(now) {
    const dt = (now - lastUpdate) / 1000;
    lastUpdate = now;

    if (me && !isDead) {
        // Smooth angle transition
        let diff = targetAngle - me.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        me.angle += diff * 0.1;

        const speed = me.isSprinting && me.score > 5 ? 6 : 3;
        if (me.isSprinting && me.score > 5) me.score -= 0.05;

        me.x += Math.cos(me.angle) * speed;
        me.y += Math.sin(me.angle) * speed;

        // Wall collision
        if (me.x < 0 || me.x > mapSize || me.y < 0 || me.y > mapSize) handleDeath();

        // Update segments
        me.segments.unshift({x: me.x, y: me.y});
        while (me.segments.length > Math.floor(me.score) * 3) me.segments.pop();

        // Food collision
        const thickness = Math.min(80, 26 + (me.score - 5) * 0.5);
        foods.forEach((f, i) => {
            const dx = me.x - f.x;
            const dy = me.y - f.y;
            if (dx*dx + dy*dy < thickness*thickness) {
                me.score += f.value;
                socket.send(JSON.stringify({ type: 'eat', foodId: f.id }));
            }
        });

        // Player collision
        players.forEach(p => {
            const otherThickness = Math.min(80, 26 + (p.s - 5) * 0.5);
            // Check head against other's segments
            if (p.segments) {
                for (let i = 0; i < p.segments.length; i += 5) {
                    const seg = p.segments[i];
                    const dx = me.x - seg.x;
                    const dy = me.y - seg.y;
                    if (dx*dx + dy*dy < (otherThickness/2 + 10)**2) {
                        handleDeath();
                        break;
                    }
                }
            }
        });

        // Send update to server
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'update',
                x: me.x, y: me.y, angle: me.angle,
                score: me.score, isSprinting: me.isSprinting
            }));
        }

        camera.x = me.x - canvas.width / 2;
        camera.y = me.y - canvas.height / 2;
    }

    // Update other players' segments locally
    players.forEach(p => {
        if (!p.segments) p.segments = [];
        p.segments.unshift({x: p.x, y: p.y});
        while (p.segments.length > Math.floor(p.s) * 3) p.segments.pop();
    });

    draw();
    requestAnimationFrame(gameLoop);
}

function draw() {
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Grid
    ctx.strokeStyle = '#1a1d24';
    ctx.lineWidth = 2;
    const step = 100;
    const startX = Math.floor(camera.x / step) * step;
    const startY = Math.floor(camera.y / step) * step;
    for (let x = startX; x < startX + canvas.width + step; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, mapSize); ctx.stroke();
    }
    for (let y = startY; y < startY + canvas.height + step; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(mapSize, y); ctx.stroke();
    }

    // Border
    ctx.strokeStyle = '#ff3333'; ctx.lineWidth = 15;
    ctx.strokeRect(0, 0, mapSize, mapSize);

    // Food
    foods.forEach(f => {
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 5, 0, Math.PI * 2);
        ctx.fill();
    });

    // Render Players
    const renderSnake = (p, isMe) => {
        const segs = isMe ? p.segments : p.segments;
        if (!segs || segs.length < 2) return;
        const thickness = Math.min(80, 26 + ((isMe ? p.score : p.s) - 5) * 0.5);
        const color = isMe ? p.colors[0] : p.c[0];
        
        ctx.fillStyle = color;
        for (let i = segs.length - 1; i >= 0; i -= 2) {
            const seg = segs[i];
            ctx.beginPath();
            ctx.arc(seg.x, seg.y, thickness/2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Head
        const head = segs[0];
        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(isMe ? p.angle : p.a);
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(10, -7, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(10, 7, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'black';
        ctx.beginPath(); ctx.arc(12, -7, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(12, 7, 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    };

    players.forEach(p => renderSnake(p, false));
    if (me && !isDead) renderSnake(me, true);

    ctx.restore();
    drawMinimap();
}

function drawMinimap() {
    minimapCtx.clearRect(0, 0, 160, 160);
    minimapCtx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    minimapCtx.fillRect(0, 0, 160, 160);
    players.forEach(p => {
        minimapCtx.fillStyle = p.c[0];
        minimapCtx.fillRect((p.x/mapSize)*160, (p.y/mapSize)*160, 2, 2);
    });
    if (me) {
        minimapCtx.fillStyle = '#fff';
        minimapCtx.fillRect((me.x/mapSize)*160, (me.y/mapSize)*160, 4, 4);
    }
}

connect();
requestAnimationFrame(gameLoop);
