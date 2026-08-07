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
let mapSize = 15000;
let foods = [];
let players = new Map();
let me = null;
let camera = { x: 7500, y: 7500 };
let isDead = false;
let lastUpdate = 0;
let targetAngle = 0;
let lastTouchTime = 0;
let touchCount = 0;
let frameCount = 0;

// Zoom system for mobile
let zoom = 1;
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

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
    minimapCanvas.width = 120;
    minimapCanvas.height = 120;
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
            camera.x = mapSize / 2;
            camera.y = mapSize / 2;
        } else if (data.type === 'sync') {
            const serverIds = new Set();
            data.p.forEach(p => {
                serverIds.add(p.id);
                if (p.id === playerId) {
                    if (me) {
                        me.score = Math.max(3, p.s);
                    }
                } else {
                    if (!players.has(p.id)) {
                        players.set(p.id, { 
                            id: p.id, x: p.x, y: p.y, a: p.a, s: Math.max(3, p.s),
                            n: p.n, c: p.c, sp: p.sp, segments: [{x: p.x, y: p.y}]
                        });
                    } else {
                        const existing = players.get(p.id);
                        existing.x = p.x;
                        existing.y = p.y;
                        existing.a = p.a;
                        existing.s = Math.max(3, p.s);
                        existing.sp = p.sp;
                    }
                }
            });
            for (const id of players.keys()) {
                if (!serverIds.has(id)) players.delete(id);
            }
            updateLeaderboard();
        } else if (data.type === 'foodSync') {
            foods = data.f || [];
        } else if (data.type === 'food') {
            if (data.index < foods.length) foods[data.index] = data.newFood;
        }
    };
    socket.onclose = () => setTimeout(connect, 1000);
}

function updateLeaderboard() {
    const all = Array.from(players.values());
    if (me) all.push(me);
    const sorted = all.sort((a, b) => (b.s || b.score) - (a.s || a.score)).slice(0, 10);
    leaderboardTable.innerHTML = sorted.map((p, i) => `
        <tr><td>${i + 1}</td><td style="color:${p.c ? p.c[0] : p.colors[0]}">${(p.n || p.name).substring(0, 10)}</td><td>${Math.floor(p.s || p.score)}</td></tr>
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
            players.clear();
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
        segments: [{x: 0, y: 0}],
        isSprinting: false
    };
    menu.style.display = 'none';
};

const handleInput = (clientX, clientY) => {
    if (!me || isDead || menu.style.display !== 'none') return;
    const dx = clientX - canvas.width / 2;
    const dy = clientY - canvas.height / 2;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 5) {
        targetAngle = Math.atan2(dy, dx);
    }
};

window.addEventListener('mousemove', (e) => handleInput(e.clientX, e.clientY));
window.addEventListener('mousedown', () => { if(me && menu.style.display === 'none') me.isSprinting = true; });
window.addEventListener('mouseup', () => { if(me) me.isSprinting = false; });

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleInput(touch.clientX, touch.clientY);
    
    const now = Date.now();
    if (now - lastTouchTime < 300) {
        touchCount++;
        if (touchCount === 2 && me && menu.style.display === 'none') {
            me.isSprinting = true;
            touchCount = 0;
        }
    } else {
        touchCount = 1;
    }
    lastTouchTime = now;
}, {passive: false});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleInput(touch.clientX, touch.clientY);
}, {passive: false});

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (me) me.isSprinting = false;
    touchCount = 0;
}, {passive: false});

function gameLoop(now) {
    const dt = (now - lastUpdate) / 1000 || 0.016;
    lastUpdate = now;
    frameCount++;

    if (me && !isDead && menu.style.display === 'none') {
        // Smooth angle rotation
        let diff = targetAngle - me.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        me.angle += diff * 0.2;

        // Movement
        const baseSpeed = 2.5;
        const sprintSpeed = 5;
        const speed = me.isSprinting && me.score > 5 ? sprintSpeed : baseSpeed;
        
        if (me.isSprinting && me.score > 5) {
            me.score -= 0.04;
        }

        me.x += Math.cos(me.angle) * speed;
        me.y += Math.sin(me.angle) * speed;

        // Boundary collision
        if (me.x < 0 || me.x > mapSize || me.y < 0 || me.y > mapSize) {
            handleDeath();
        }

        // Update segments
        me.segments.unshift({x: me.x, y: me.y});
        const maxSegs = Math.max(4, Math.floor(me.score * 1.5));
        while (me.segments.length > maxSegs) me.segments.pop();

        // Food collision
        const thickness = Math.min(80, 26 + (me.score - 5) * 0.5);
        for (let i = foods.length - 1; i >= 0; i--) {
            const f = foods[i];
            const dx = me.x - f.x;
            const dy = me.y - f.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < thickness * thickness) {
                me.score += f.value;
                socket.send(JSON.stringify({ type: 'eat', foodId: f.id }));
                break;
            }
        }

        // Player collision
        players.forEach(p => {
            const otherThickness = Math.min(80, 26 + (p.s - 5) * 0.5);
            if (p.segments && p.segments.length > 0) {
                for (let i = 0; i < p.segments.length; i += 3) {
                    const seg = p.segments[i];
                    const dx = me.x - seg.x;
                    const dy = me.y - seg.y;
                    const distSq = dx * dx + dy * dy;
                    const minDist = (otherThickness / 2 + 8);
                    if (distSq < minDist * minDist) {
                        handleDeath();
                        return;
                    }
                }
            }
        });

        // Send update to server every 2 frames
        if (frameCount % 2 === 0 && socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'update',
                x: me.x, y: me.y, angle: me.angle,
                score: Math.max(3, me.score), isSprinting: me.isSprinting
            }));
        }

        camera.x = me.x - canvas.width / (2 * zoom);
        camera.y = me.y - canvas.height / (2 * zoom);
    }

    // Update other players' segments
    players.forEach(p => {
        if (!p.segments) p.segments = [];
        p.segments.unshift({x: p.x, y: p.y});
        const maxSegs = Math.max(4, Math.floor(p.s * 1.5));
        while (p.segments.length > maxSegs) p.segments.pop();
    });

    draw();
    requestAnimationFrame(gameLoop);
}

function draw() {
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dynamic zoom for mobile
    zoom = isMobile && me ? 1.6 : 1;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-camera.x - canvas.width / (2 * zoom), -camera.y - canvas.height / (2 * zoom));

    // Grid
    ctx.strokeStyle = '#1a1d24';
    ctx.lineWidth = 1;
    const step = 250;
    const startX = Math.floor(camera.x / step) * step;
    const startY = Math.floor(camera.y / step) * step;
    
    for (let x = startX; x < startX + canvas.width / zoom + step; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, mapSize);
        ctx.stroke();
    }
    for (let y = startY; y < startY + canvas.height / zoom + step; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(mapSize, y);
        ctx.stroke();
    }

    // Border
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 25;
    ctx.strokeRect(0, 0, mapSize, mapSize);

    // Food
    ctx.fillStyle = '#fff';
    foods.forEach(f => {
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
    });

    const renderSnake = (p, isMe) => {
        const segs = p.segments;
        if (!segs || segs.length < 1) return;
        
        const score = isMe ? p.score : p.s;
        const thickness = Math.min(80, 26 + (score - 5) * 0.5);
        const color = isMe ? p.colors[0] : p.c[0];
        
        // Draw body
        ctx.fillStyle = color;
        for (let i = segs.length - 1; i >= 0; i--) {
            const seg = segs[i];
            ctx.beginPath();
            ctx.arc(seg.x, seg.y, thickness / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Draw head
        if (segs.length > 0) {
            const head = segs[0];
            ctx.save();
            ctx.translate(head.x, head.y);
            ctx.rotate(isMe ? p.angle : p.a);
            
            // Eyes
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(10, -6, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(10, 6, 5, 0, Math.PI * 2);
            ctx.fill();
            
            // Pupils
            ctx.fillStyle = 'black';
            ctx.beginPath();
            ctx.arc(12, -6, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(12, 6, 2.5, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        }
    };

    // Render all players
    players.forEach(p => renderSnake(p, false));
    if (me && !isDead) renderSnake(me, true);

    ctx.restore();
    drawMinimap();
}

function drawMinimap() {
    minimapCtx.clearRect(0, 0, 120, 120);
    minimapCtx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    minimapCtx.fillRect(0, 0, 120, 120);
    minimapCtx.strokeStyle = 'rgba(0, 255, 204, 0.2)';
    minimapCtx.lineWidth = 1;
    minimapCtx.strokeRect(0, 0, 120, 120);
    
    const scale = 120 / mapSize;
    
    // Draw other players
    players.forEach(p => {
        minimapCtx.fillStyle = p.c[0];
        minimapCtx.fillRect(p.x * scale - 1, p.y * scale - 1, 2, 2);
    });
    
    // Draw self
    if (me) {
        minimapCtx.fillStyle = '#fff';
        minimapCtx.fillRect(me.x * scale - 1.5, me.y * scale - 1.5, 3, 3);
    }
}

connect();
requestAnimationFrame(gameLoop);
