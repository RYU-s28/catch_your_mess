window.addEventListener('load', function(){
    // --- Highscore Leaderboard Logic ---
    const LEADERBOARD_SIZE = 10;
    const LEADERBOARD_FILE = 'data/highscores.json';
    let leaderboard = [];

    // Initialize Firebase (if SDK loaded and config present)
    let db = null;
    try {
        if (window.firebase && window.__FIREBASE_CONFIG) {
            try { firebase.app(); } catch(e) { firebase.initializeApp(window.__FIREBASE_CONFIG); }
            if (firebase && firebase.firestore) {
                db = firebase.firestore();
            }
        }
    } catch (e) {
        console.warn('Firebase init failed', e);
        db = null;
    }

    // Helper: load leaderboard (Firestore -> server -> localStorage)
    async function loadLeaderboard() {
        // Try Firestore first
        if (db) {
            try {
                const q = db.collection('highscores').orderBy('score', 'desc').limit(10);
                const snap = await q.get();
                leaderboard = snap.docs.map(d => {
                    const data = d.data();
                    let dateStr = '';
                    if (data.createdAt && typeof data.createdAt.toDate === 'function') {
                        dateStr = data.createdAt.toDate().toLocaleString();
                    } else if (data.date) {
                        dateStr = data.date;
                    }
                    return { name: String(data.name || '---').slice(0,8), score: Number(data.score || 0), date: dateStr };
                });
                updateLeaderboardPanel();
                return;
            } catch (e) {
                console.warn('Firestore load failed, falling back', e);
            }
        }

        // Try Express server next
        try {
            const res = await fetch('/api/highscores');
            if (res.ok) {
                const data = await res.json();
                leaderboard = Array.isArray(data) ? data : [];
                updateLeaderboardPanel();
                return;
            }
        } catch (e) {
            // ignore and try localStorage fallback
        }

        // Local fallback
        try {
            const data = localStorage.getItem('highscores');
            if (data) leaderboard = JSON.parse(data);
            else leaderboard = [];
        } catch (e) {
            leaderboard = [];
        }
        updateLeaderboardPanel();
    }

    // Helper: save leaderboard to localStorage (fallback only)
    function saveLeaderboard() {
        try { localStorage.setItem('highscores', JSON.stringify(leaderboard)); } catch(e){}
    }

    // Helper: update leaderboard panel
    function updateLeaderboardPanel() {
        const listEl = document.getElementById('leaderboardList');
        if (!listEl) return;
        listEl.innerHTML = '';
        leaderboard.slice(0, LEADERBOARD_SIZE).forEach((entry, idx) => {
            const li = document.createElement('li');
            li.textContent = `${(idx+1).toString().padStart(2,'0')}. ${entry.name.padEnd(3, ' ')} - ${entry.score} (${entry.date})`;
            listEl.appendChild(li);
        });
    }

    // Helper: check if score is a new highscore
    function isHighscore(score) {
        if (leaderboard.length < LEADERBOARD_SIZE) return true;
        return leaderboard.some(entry => score > entry.score);
    }

    // Helper: add new highscore (try Firestore -> Express -> localStorage)
    async function addHighscore(name, score) {
        const shortName = String(name || '???').trim().slice(0,8) || '???';

        // Try Firestore
        if (db) {
            try {
                await db.collection('highscores').add({
                    name: shortName,
                    score: Math.floor(Number(score)),
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                // reload
                await loadLeaderboard();
                saveLeaderboard();
                return;
            } catch (e) {
                console.warn('Firestore write failed, falling back', e);
            }
        }

        // Try Express server next
        try {
            const res = await fetch('/api/highscores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: shortName, score: Number(score) })
            });
            if (res.ok) {
                const data = await res.json();
                leaderboard = Array.isArray(data) ? data : leaderboard;
                updateLeaderboardPanel();
                saveLeaderboard();
                return;
            }
        } catch (e) {
            // server not available, fallback below
        }

        // Local fallback
        const now = new Date();
        const dateStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        leaderboard.push({ name: shortName, score: Math.floor(Number(score)), date: dateStr });
        leaderboard.sort((a, b) => b.score - a.score);
        leaderboard = leaderboard.slice(0, LEADERBOARD_SIZE);
        saveLeaderboard();
        updateLeaderboardPanel();
    }

    // Helper: show name entry popup
    function showNameEntryPopup(score) {
        const popup = document.createElement('div');
        popup.className = 'highscore-popup';

        const title = document.createElement('h3');
        title.textContent = 'NEW HIGHSCORE!';
        popup.appendChild(title);

        const label = document.createElement('label');
        label.textContent = 'Enter your name:';
        label.style.display = 'block';
        label.style.marginBottom = '12px';
        popup.appendChild(label);

        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 8;
        input.placeholder = '_';
        input.autofocus = true;
        input.style.width = '100%';
        input.style.padding = '8px';
        input.style.marginBottom = '12px';
        input.style.fontSize = '16px';
        input.style.border = '2px solid #ccc';
        input.style.borderRadius = '6px';
        popup.appendChild(input);

        // Blinking cursor effect via placeholder and CSS

        const submitBtn = document.createElement('button');
        submitBtn.textContent = 'SUBMIT';
        submitBtn.style.marginTop = '12px';
        submitBtn.style.padding = '10px 24px';
        submitBtn.style.fontSize = '14px';
        submitBtn.style.fontWeight = '600';
        submitBtn.style.background = 'linear-gradient(135deg,#4d79bc,#3d5fa8)';
        submitBtn.style.color = '#fff';
        submitBtn.style.border = 'none';
        submitBtn.style.borderRadius = '6px';
        submitBtn.style.cursor = 'pointer';
        popup.appendChild(submitBtn);

        submitBtn.onclick = () => {
            let name = input.value.trim().slice(0,8);
            if (!name) name = '???';
            addHighscore(name, score);
            document.body.removeChild(popup);
        };

        document.body.appendChild(popup);
        input.focus();
    }

    // Load leaderboard on start
    loadLeaderboard();
    updateLeaderboardPanel();

    // canvas setup with devicePixelRatio scaling for crisp rendering
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d', { alpha: true });

    // Logical resolution used for drawing (game coordinates)
    const LOGICAL_WIDTH = 480;
    const LOGICAL_HEIGHT = 800;
    const dpr = window.devicePixelRatio || 1;

    // Set canvas physical resolution and scale context
    canvas.width = LOGICAL_WIDTH * dpr;
    canvas.height = LOGICAL_HEIGHT * dpr;
    // Keep CSS size for display (the CSS file sets width/height)
    canvas.style.width = LOGICAL_WIDTH + 'px';
    canvas.style.height = LOGICAL_HEIGHT + 'px';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Sprite image assets
    const sprites = {
        basket: null,
        goodDrops: [], // array of good drop images (6 variants: bun, coin, corn, nacho, octopus, skewer)
        badDrop: null,  // rubish.png
        bomb: null      // dynamite.png
    };

    // Load sprite images
    async function loadSprites(){
        const baseUrl = 'assets/images/';
        
        // Load basket
        sprites.basket = new Image();
        sprites.basket.src = baseUrl + 'basket.png';
        
        // Load 6 good drops (equal probability)
        const goodNames = ['bun', 'coin', 'corn', 'nacho', 'octupus', 'skewer'];
        for(const name of goodNames){
            const img = new Image();
            img.src = baseUrl + 'good_drops/' + name + '.png';
            sprites.goodDrops.push(img);
        }
        
        // Load bad drop (rubish)
        sprites.badDrop = new Image();
        sprites.badDrop.src = baseUrl + 'bad_drops/rubish.png';
        
        // Load bomb (dynamite)
        sprites.bomb = new Image();
        sprites.bomb.src = baseUrl + 'bad_drops/dynamite.png';
    }

    // Helper to get random good drop sprite
    function getRandomGoodDrop(){
        return sprites.goodDrops[Math.floor(Math.random() * sprites.goodDrops.length)];
    }

    // UI DOM elements (we update these instead of drawing HUD on canvas)
    const uiScore = document.getElementById('uiScore');
    const uiLevel = document.getElementById('uiLevel');
    const uiBombs = document.getElementById('uiBombs');
    const uiSpeed = document.getElementById('uiSpeed');
    const gameOverModal = document.getElementById('gameOverModal');
    const finalScoreEl = document.getElementById('finalScore');
    const restartBtn = document.getElementById('restartBtn');
    if(restartBtn) restartBtn.addEventListener('click', () => window.location.reload());

    // Load sprites immediately
    loadSprites();

    // Preload bomb sound effect (flashbang)
    const bombAudio = new Audio('assets/audio/flashbang.mp3');
    bombAudio.volume = 0.7;

    // Game state (aligned with user's requested variables)
    let items = [];           // list of active falling objects
    const maxItems = 5;       // limit of visible items
    let fallSpeed = 2;        // initial fall speed (pixels/frame)
    let level = 1;            // current difficulty level
    const levelTime = 10;     // seconds to level up
    let levelElapsed = 0;     // seconds elapsed in current level
    let spawnInterval = 1000; // ms between spawns

    let score = 0;
    let bombsCaught = 0;
    const maxBombs = 3;
    let gameOver = false;
    let paused = false;
    let bombFlashing = false; // flag to indicate bomb flash is active
    let trashOverlay = false; // flag to render grey overlay when collecting trash

    // Basket (original placeholder dimensions)
    const basket = {
        width: Math.max(80, Math.floor(LOGICAL_WIDTH * 0.12)),
        height: 28,
        x: 0,
        y: 0,
        speed: 8
    };

    function resetBasketPosition(){
        basket.x = (LOGICAL_WIDTH - basket.width) / 2;
        basket.y = LOGICAL_HEIGHT - basket.height - 30;
    }
    resetBasketPosition();

    // Note: `items` is declared above per spec

    // Input
    const keys = { left: false, right: false };
    window.addEventListener('keydown', (e) => {
        if(e.code === 'ArrowLeft') keys.left = true;
        if(e.code === 'ArrowRight') keys.right = true;
    });
    window.addEventListener('keyup', (e) => {
        if(e.code === 'ArrowLeft') keys.left = false;
        if(e.code === 'ArrowRight') keys.right = false;
    });

    // Pointer / mouse control (works for mouse and touch via Pointer Events)
    // convert pointer position from CSS pixels to canvas logical coordinates
    canvas.addEventListener('pointermove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = LOGICAL_WIDTH / rect.width; // logical / css
        const xGame = (e.clientX - rect.left) * scaleX;
        basket.x = xGame - basket.width / 2;
        // constrain immediately in logical coords
        if(basket.x < 0) basket.x = 0;
        if(basket.x + basket.width > LOGICAL_WIDTH) basket.x = LOGICAL_WIDTH - basket.width;
    });

    // Spawn settings
    let spawnTimerId = null;

    function spawnItem(){
        if(gameOver) return;
        // enforce max items
        if(items.length >= maxItems) return;

        const x = Math.random() * (LOGICAL_WIDTH - 60) + 30;
        const r = 24 + Math.random() * 22; // size (used as radius / half-size) - increased from 12-26 to 24-46
        const p = Math.random();
        let type = 'good';
        if(p < 0.6) type = 'good';
        else if(p < 0.9) type = 'bad';
        else type = 'bomb';

        // Get sprite for this item
        let sprite = null;
        if(type === 'good') sprite = getRandomGoodDrop();
        else if(type === 'bad') sprite = sprites.badDrop;
        else if(type === 'bomb') sprite = sprites.bomb;

        // per-item base vertical speed; global `fallSpeed` will be added each frame
        let vy = 0.8 + Math.random() * 1.8;
        if(type === 'bad') vy += 0.6;
        if(type === 'bomb') vy += 0.2;

        items.push({ x, y: -r - 10, r, type, sprite, vy });
    }

    // Start spawning (uses `spawnInterval` variable)
    function startSpawning(){
        if(spawnTimerId) clearInterval(spawnTimerId);
        spawnTimerId = setInterval(spawnItem, spawnInterval);
    }

    // Level tracking (no timer)
    let tickIntervalId = setInterval(()=>{
        if(gameOver || paused) return;
        levelElapsed += 1;

        // level up when enough seconds passed
        if(levelElapsed >= levelTime){
            level += 1;
            levelElapsed = 0;
            // increase fall speed (additive) and slightly speed up spawning
            // bigger increment to make levels noticeably faster
            fallSpeed += 1.6; // increases how much global speed affects items
            // tighten spawn interval a bit more to match faster pace
            spawnInterval = Math.max(250, Math.floor(spawnInterval * 0.90));
            // restart spawn interval with new speed
            startSpawning();
        }
    }, 1000);

    function endGame(){
        gameOver = true;
        if(spawnTimerId) clearInterval(spawnTimerId);
        // Check for highscore and show popup if needed
        if(isHighscore(score)) {
            setTimeout(() => showNameEntryPopup(score), 600);
        }
    }

    // Collision detection: approximate using item bounding circle
    function isCaught(item){
        const cx = item.x;
        const cy = item.y;
        const radius = item.r;

        // check vertical overlap with basket
        if(cy + radius >= basket.y && cy - radius <= basket.y + basket.height){
            if(cx >= basket.x && cx <= basket.x + basket.width) return true;
        }
        return false;
    }

    // Game loop
    function update(){
        if(gameOver || paused) return;

        // Move basket
        if(keys.left) basket.x -= basket.speed;
        if(keys.right) basket.x += basket.speed;
        // constrain (use logical width)
        if(basket.x < 0) basket.x = 0;
        if(basket.x + basket.width > LOGICAL_WIDTH) basket.x = LOGICAL_WIDTH - basket.width;

        // Update items
        for(let i = items.length - 1; i >= 0; i--){
            const it = items[i];
            // total falling speed combines per-item vy and global fallSpeed
            it.y += it.vy + fallSpeed * 0.16; // global fallSpeed influence increased for faster play

            // caught?
            if(isCaught(it)){
                // apply effects
                if(it.type === 'good'){
                    score += 5;
                } else if(it.type === 'bad'){
                    score = Math.max(0, score - 8);
                    // show a grey overlay briefly when player collects trash
                    triggerTrashOverlay();
                } else if(it.type === 'bomb'){
                    bombsCaught += 1;
                    // Flash canvas white for 1ms instead of minus points
                    triggerBombFlash();
                    if(bombsCaught >= maxBombs) endGame();
                }
                // remove
                items.splice(i,1);
                continue;
            }

            // missed (fell beyond bottom)
            if(it.y - it.r > LOGICAL_HEIGHT){
                if(it.type === 'good'){
                    // treat missing a good item like hitting a bomb: increment bomb count and heavy penalty
                    bombsCaught += 1;
                    score = Math.max(0, score - 20);
                    if(bombsCaught >= maxBombs) endGame();
                }
                items.splice(i,1);
            }
        }
    }

    // Pause / resume helpers
    function pauseGame(){
        if(gameOver) return;
        paused = true;
        // stop spawning while paused
        if(spawnTimerId) { clearInterval(spawnTimerId); spawnTimerId = null; }
        const pm = document.getElementById('pauseModal');
        if(pm) pm.style.display = 'flex';
    }

    function resumeGame(){
        if(gameOver) return;
        paused = false;
        // resume spawning
        if(!spawnTimerId) startSpawning();
        const pm = document.getElementById('pauseModal');
        if(pm) pm.style.display = 'none';
    }

    // Hook ESC to toggle pause
    window.addEventListener('keydown', (e) => {
        if(e.key === 'Escape'){
            e.preventDefault();
            if(!paused) pauseGame(); else resumeGame();
        }
    });

    // Pause modal button handlers
    const continueBtn = document.getElementById('continueBtn');
    const resetBtn = document.getElementById('resetBtn');
    const quitBtn = document.getElementById('quitBtn');
    if(continueBtn) continueBtn.addEventListener('click', resumeGame);
    if(resetBtn) resetBtn.addEventListener('click', () => window.location.reload());
    if(quitBtn) quitBtn.addEventListener('click', () => { window.location.href = '/'; });

    function draw(){
        // clear logical canvas area
        ctx.clearRect(0,0,LOGICAL_WIDTH,LOGICAL_HEIGHT);

        // If bomb flash is active, render white screen
        if(bombFlashing){
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
            return; // Skip drawing game objects while flashing
        }

        // Draw basket (placeholder rectangle)
        ctx.fillStyle = 'orange';
        ctx.fillRect(basket.x, basket.y, basket.width, basket.height);

        // Draw items (sprites)
        for(const it of items){
            if(it.sprite && it.sprite.complete){
                // Draw sprite centered at (it.x, it.y) with size 2*it.r
                const size = it.r * 2;
                ctx.drawImage(it.sprite, it.x - it.r, it.y - it.r, size, size);
            } else {
                // Fallback: colored circles if sprite not loaded
                if(it.type === 'good') ctx.fillStyle = '#ffd24a';
                else if(it.type === 'bad') ctx.fillStyle = '#9aa0a6';
                else if(it.type === 'bomb') ctx.fillStyle = '#ff5c5c';

                ctx.beginPath();
                ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // If trash overlay active, draw semi-opaque grey layer (50% opacity)
        if(trashOverlay){
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        }
    }

    // Flash canvas white when bomb is hit
    function triggerBombFlash(){
        bombFlashing = true;
        // play sound (best-effort)
        try {
            if(bombAudio){
                bombAudio.currentTime = 0;
                const p = bombAudio.play();
                if(p && typeof p.then === 'function') p.catch(()=>{});
            }
        } catch (e) {}

        // Reset after 1 second
        setTimeout(() => {
            bombFlashing = false;
        }, 1000);
    }

    // Show a brief grey overlay when collecting trash
    function triggerTrashOverlay(){
        trashOverlay = true;
        setTimeout(() => { trashOverlay = false; }, 3000);
    }

    // Update UI overlay (stats and game-over)
    function updateUI(){
        if(uiScore) uiScore.textContent = score;
        if(uiLevel) uiLevel.textContent = level;
        if(uiBombs) uiBombs.textContent = bombsCaught + '/' + maxBombs;
        if(uiSpeed) uiSpeed.textContent = fallSpeed.toFixed(2);
        if(gameOver && gameOverModal){
            if(finalScoreEl) finalScoreEl.textContent = score;
            gameOverModal.style.display = 'flex';
        }
    }

    // main loop
    function loop(){
        update();
        draw();
        updateUI();
        if(!gameOver) requestAnimationFrame(loop);
    }

    // initialize and start
    startSpawning();
    loop();
});