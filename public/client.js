const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas.getContext('2d');
const menu = document.getElementById('menu');
const nicknameInput = document.getElementById('nickname');
const colorPicker = document.getElementById('color-picker');
const previewHead = document.getElementById('preview-head');
const previewBody = document.getElementById('preview-body');
const startBtn = document.getElementById('start-btn');
const leaderboard = document.getElementById('leaderboard');
const leaderboardTable = document.getElementById('leaderboard-table');
const minimapContainer = document.getElementById('minimap-container');
const killScreen = document.getElementById('kill-screen');
const respawnTimer = document.getElementById('respawn-timer');
const controlsHint = document.getElementById('controls-hint');
const liteModeToggle = document.getElementById('lite-mode-toggle');

let socket;
let playerId;
let mapSize = 5000;
let players = [];
let foods = [];
let camera = { x: 2500, y: 2500 };
let isSprinting = false;
let isDead = false;
let deadPos = { x: 0, y: 0 };
let liteMode = false; // MODO LITE: desativa Lerp para performance

// ===== LERP (LINEAR INTERPOLATION) - TWEENSERVICE VISUAL =====
// Cada cobra tem um estado de interpolação suave para cada segmento
const snakeLerp = new Map();

// Customization state
let selectedSegmentIndex = 0;
let snakeColors = ['hsl(120, 70%, 50%)', 'hsl(210, 70%, 50%)', 'hsl(30, 70%, 50%)', 'hsl(0, 70%, 50%)', 'hsl(270, 70%, 50%)'];

const colors = [
    'hsl(0, 70%, 50%)', 'hsl(30, 70%, 50%)', 'hsl(60, 70%, 50%)', 
    'hsl(120, 70%, 50%)', 'hsl(180, 70%, 50%)', 'hsl(210, 70%, 50%)', 
    'hsl(240, 70%, 50%)', 'hsl(270, 70%, 50%)', 'hsl(300, 70%, 50%)', 
    'hsl(330, 70%, 50%)', 'hsl(0, 0%, 100%)', 'hsl(0, 0%, 20%)'
];

function initCustomization() {
    const previewSegs = document.querySelectorAll('.preview-seg');
    previewHead.style.backgroundColor = snakeColors[0];
    previewHead.onclick = () => {
        previewHead.classList.add('active');
        previewSegs.forEach(s => s.classList.remove('active'));
        selectedSegmentIndex = 0;
    };
    previewSegs.forEach((seg, i) => {
        const idx = i + 1;
        seg.style.backgroundColor = snakeColors[idx];
        seg.onclick = () => {
            previewHead.classList.remove('active');
            previewSegs.forEach(s => s.classList.remove('active'));
            seg.classList.add('active');
            selectedSegmentIndex = idx;
        };
    });
    colors.forEach(color => {
        const div = document.createElement('div');
        div.className = 'color-option';
        div.style.backgroundColor = color;
        div.onclick = () => {
            snakeColors[selectedSegmentIndex] = color;
            if (selectedSegmentIndex === 0) {
                previewHead.style.backgroundColor = color;
            } else {
                previewSegs[selectedSegmentIndex - 1].style.backgroundColor = color;
            }
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
        } else if (data.type === 'update') {
            // Atualizar dados dos jogadores
            players.forEach(oldPlayer => {
                const newPlayer = data.players.find(p => p.id === oldPlayer.id);
                if (newPlayer) {
                    Object.assign(oldPlayer, newPlayer);
                }
            });
            
            // Adicionar novos jogadores
            data.players.forEach(newPlayer => {
                if (!players.find(p => p.id === newPlayer.id)) {
                    players.push(newPlayer);
                    // Inicializar Lerp para este jogador
                    snakeLerp.set(newPlayer.id, {
                        displaySegments: [...newPlayer.segments],
                        targetSegments: [...newPlayer.segments],
                        lerpSpeed: 0.15 // Velocidade de interpolação (0-1, quanto maior mais rápido)
                    });
                }
            });
            
            // Remover jogadores que saíram
            players = players.filter(p => data.players.find(np => np.id === p.id));
            
            foods = data.foods;
            updateLeaderboard();
        } else if (data.type === 'death') {
            handleDeath(data.x, data.y);
        }
    };
    socket.onclose = () => setTimeout(connect, 1000);
}

function handleDeath(x, y) {
    isDead = true;
    deadPos = { x, y };
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
            const name = nicknameInput.value.trim() || 'Player';
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'join', name: name, colors: snakeColors }));
                leaderboard.style.display = 'block';
                minimapContainer.style.display = 'block';
                controlsHint.style.display = 'block';
            } else {
                showMenu();
            }
        }
    }, 1000);
}

function showMenu() {
    menu.style.display = 'block';
    leaderboard.style.display = 'none';
    minimapContainer.style.display = 'none';
    controlsHint.style.display = 'none';
    camera = { x: mapSize / 2, y: mapSize / 2 };
}

startBtn.onclick = () => {
    const name = nicknameInput.value.trim() || 'Player';
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    liteMode = liteModeToggle.checked; // Ler estado do Modo Lite
    socket.send(JSON.stringify({ type: 'join', name: name, colors: snakeColors }));
    menu.style.display = 'none';
    leaderboard.style.display = 'block';
    minimapContainer.style.display = 'block';
    controlsHint.style.display = 'block';
};

connect();

// Mouse Controls
window.addEventListener('mousemove', (e) => {
    if (!socket || socket.readyState !== WebSocket.OPEN || isDead || menu.style.display !== 'none') return;
    const dx = e.clientX - canvas.width / 2;
    const dy = e.clientY - canvas.height / 2;
    const angle = Math.atan2(dy, dx);
    socket.send(JSON.stringify({ type: 'move', angle }));
});

window.addEventListener('mousedown', () => { if(!isDead && menu.style.display === 'none') { isSprinting = true; sendSprint(); } });
window.addEventListener('mouseup', () => { isSprinting = false; sendSprint(); });

// Mobile Touch Controls
let lastTouchTime = 0;
canvas.addEventListener('touchstart', (e) => {
    if (!socket || socket.readyState !== WebSocket.OPEN || isDead || menu.style.display !== 'none') return;
    e.preventDefault();
    const now = Date.now();
    if (now - lastTouchTime < 300) { isSprinting = true; sendSprint(); }
    lastTouchTime = now;
    handleTouch(e);
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    if (!socket || socket.readyState !== WebSocket.OPEN || isDead || menu.style.display !== 'none') return;
    e.preventDefault();
    handleTouch(e);
}, { passive: false });

canvas.addEventListener('touchend', () => { isSprinting = false; sendSprint(); });

function handleTouch(e) {
    const touch = e.touches[0];
    const dx = touch.clientX - canvas.width / 2;
    const dy = touch.clientY - canvas.height / 2;
    const angle = Math.atan2(dy, dx);
    socket.send(JSON.stringify({ type: 'move', angle }));
}

window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'm') {
        if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'leave' }));
        showMenu();
    }
    if (e.code === 'Space') { isSprinting = true; sendSprint(); }
});

window.addEventListener('keyup', (e) => { if (e.code === 'Space') { isSprinting = false; sendSprint(); } });

function sendSprint() { if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'sprint', active: isSprinting })); }

function updateLeaderboard() {
    const sorted = [...players].sort((a, b) => b.score - a.score).slice(0, 10);
    leaderboardTable.innerHTML = sorted.map((p, i) => `
        <tr>
            <td class="rank-num">${i + 1}.</td>
            <td style="color:${p.colors[0]}">${p.name}</td>
            <td class="score">${Math.floor(p.score)}</td>
        </tr>
    `).join('');
}

function drawMinimap() {
    minimapCtx.clearRect(0, 0, 160, 160);
    minimapCtx.fillStyle = 'rgba(0, 255, 204, 0.05)';
    minimapCtx.beginPath(); minimapCtx.arc(80, 80, 75, 0, Math.PI * 2); minimapCtx.fill();
    minimapCtx.strokeStyle = '#333'; minimapCtx.stroke();
    players.forEach(p => {
        const mx = (p.x / mapSize) * 150 + 5; const my = (p.y / mapSize) * 150 + 5;
        minimapCtx.fillStyle = p.colors[0];
        minimapCtx.beginPath(); minimapCtx.arc(mx, my, p.id === playerId ? 4 : 2, 0, Math.PI * 2); minimapCtx.fill();
    });
}

// ===== FUNÇÃO LERP (Linear Interpolation) =====
function lerp(start, end, t) {
    return start + (end - start) * t;
}

// ===== ATUALIZAR SEGMENTOS COM LERP =====
function updateSnakeLerp(snake) {
    const lerp_data = snakeLerp.get(snake.id);
    if (!lerp_data) return snake.segments || [];

    // Se recebemos novos segmentos, atualizar o alvo
    if (snake.segments && snake.segments.length > 0) {
        lerp_data.targetSegments = [...snake.segments];
    }

    // Se não temos segmentos de exibição, inicializar com o alvo
    if (lerp_data.displaySegments.length === 0) {
        lerp_data.displaySegments = [...lerp_data.targetSegments];
    }

    // Aplicar Lerp a cada segmento
    const speed = lerp_data.lerpSpeed;
    
    // Ajustar o número de segmentos se necessário
    if (lerp_data.displaySegments.length < lerp_data.targetSegments.length) {
        // Adicionar segmentos novos
        while (lerp_data.displaySegments.length < lerp_data.targetSegments.length) {
            const lastSeg = lerp_data.displaySegments[lerp_data.displaySegments.length - 1];
            lerp_data.displaySegments.push({ x: lastSeg.x, y: lastSeg.y });
        }
    } else if (lerp_data.displaySegments.length > lerp_data.targetSegments.length) {
        // Remover segmentos excedentes
        lerp_data.displaySegments.length = lerp_data.targetSegments.length;
    }

    // Interpolar cada segmento suavemente
    for (let i = 0; i < lerp_data.displaySegments.length; i++) {
        const display = lerp_data.displaySegments[i];
        const target = lerp_data.targetSegments[i];
        
        display.x = lerp(display.x, target.x, speed);
        display.y = lerp(display.y, target.y, speed);
    }

    return lerp_data.displaySegments;
}

// ===== VERIFICAR SE COBRA ESTÁ VISÍVEL NA TELA =====
function isSnakeVisible(snake, camera, viewportWidth, viewportHeight) {
    const viewRadius = Math.max(viewportWidth, viewportHeight) / 2 + 200;
    const dx = snake.x - (camera.x + viewportWidth / 2);
    const dy = snake.y - (camera.y + viewportHeight / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist < viewRadius;
}

function draw() {
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const me = players.find(p => p.id === playerId);
    if (isDead) { camera.x = deadPos.x - canvas.width / 2; camera.y = deadPos.y - canvas.height / 2; }
    else if (me) { camera.x = me.x - canvas.width / 2; camera.y = me.y - canvas.height / 2; }

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Grid
    ctx.strokeStyle = '#1a1d24'; ctx.lineWidth = 2;
    for (let x = 0; x <= mapSize; x += 100) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, mapSize); ctx.stroke(); }
    for (let y = 0; y <= mapSize; y += 100) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(mapSize, y); ctx.stroke(); }

    // Border
    ctx.strokeStyle = '#ff3333'; ctx.lineWidth = 15; ctx.strokeRect(0, 0, mapSize, mapSize);

    // Food
    foods.forEach(f => {
        ctx.fillStyle = f.color;
        ctx.beginPath();
        const radius = f.value > 2 ? 7 : 5;
        ctx.arc(f.x, f.y, radius, 0, Math.PI * 2);
        ctx.fill();
    });

    // Players
    players.forEach(p => {
        // ===== OTIMIZAÇÃO: Só processar cobras visíveis =====
        if (!isSnakeVisible(p, camera, canvas.width, canvas.height)) {
            return;
        }

        if (!p.segments || p.segments.length < 2) return;
        
        // ===== APLICAR LERP PARA MOVIMENTO SUAVE (ou usar direto se Modo Lite) =====
        let displaySegments;
        if (liteMode) {
            // MODO LITE: Sem Lerp, usa segmentos diretos (teletransporte)
            displaySegments = p.segments;
        } else {
            // MODO NORMAL: Com Lerp para movimento suave
            displaySegments = updateSnakeLerp(p);
        }
        if (!displaySegments || displaySegments.length < 2) return;

        const thickness = Math.min(80, 26 + (p.length - 5) * 0.5);
        
        // Renderizar corpo com segmentos interpolados
        for (let i = displaySegments.length - 1; i >= 0; i--) {
            const seg = displaySegments[i];
            const colorIndex = i % p.colors.length;
            ctx.fillStyle = p.colors[colorIndex];
            
            ctx.beginPath();
            ctx.arc(seg.x, seg.y, thickness/2 + 0.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Head
        const head = displaySegments[0];
        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(p.angle || 0);
        const eyeScale = thickness / 26;
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(8 * eyeScale, -7 * eyeScale, 6 * eyeScale, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(8 * eyeScale, 7 * eyeScale, 6 * eyeScale, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'black';
        ctx.beginPath(); ctx.arc(11 * eyeScale, -7 * eyeScale, 3 * eyeScale, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(11 * eyeScale, 7 * eyeScale, 3 * eyeScale, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // Name
        ctx.fillStyle = 'white';
        ctx.font = `bold ${Math.max(16, 16 * eyeScale)}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(p.name, head.x, head.y - (20 + thickness/2));
    });

    ctx.restore();
    if (menu.style.display === 'none') drawMinimap();
    requestAnimationFrame(draw);
}

draw();
