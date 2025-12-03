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
        bomb: null,     // dynamite.png
        health: null    // health.png (healing powerup)
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
        
        // Load health powerup
        sprites.health = new Image();
        sprites.health.src = baseUrl + 'health.png';
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

    // Preload background music
    const backgroundMusic = new Audio('assets/audio/matsuri_background.mp3');
    backgroundMusic.volume = 0.5;
    backgroundMusic.loop = true;
    let backgroundMusicStarted = false;

    // Game state (aligned with user's requested variables)
    let items = [];           // list of active falling objects
    let firstObjectSpawned = false; // track if first object has been spawned
    let gameStartTime = null; // track when game started for 7.5 second intro
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
    let isImmune = false; // flag to indicate immunity period after bomb hit
    let immunityEndTime = 0; // timestamp when immunity ends

    // Basket (original placeholder dimensions)
    const basket = {
        width: Math.max(80, Math.floor(LOGICAL_WIDTH * 0.12)),
        height: 48,
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

        // Don't spawn more items during the first 9.5 seconds (intro phase)
        if(gameStartTime !== null){
            const elapsedTime = Date.now() - gameStartTime;
            if(elapsedTime < 9500 && firstObjectSpawned){
                // Still in intro phase and we've already spawned the first item
                return;
            }
        }

        const x = Math.random() * (LOGICAL_WIDTH - 60) + 30;
        const r = 24 + Math.random() * 22; // size (used as radius / half-size) - increased from 12-26 to 24-46
        
        // First object is always good
        let type = 'good';
        if(firstObjectSpawned){
            // Check if we should spawn a health powerup (2% chance when player has strikes)
            // Only spawn if player has strikes AND no health powerup is currently on screen
            const hasHealthOnScreen = items.some(item => item.type === 'health');
            if(bombsCaught > 0 && !hasHealthOnScreen && Math.random() < 0.02){
                type = 'health';
            } else {
                const p = Math.random();
                if(p < 0.6) type = 'good';
                else if(p < 0.9) type = 'bad';
                else type = 'bomb';
            }
        }
        
        // Get sprite for this item
        let sprite = null;
        if(type === 'good') sprite = getRandomGoodDrop();
        else if(type === 'bad') sprite = sprites.badDrop;
        else if(type === 'bomb') sprite = sprites.bomb;
        else if(type === 'health') sprite = sprites.health;

        // per-item base vertical speed; global `fallSpeed` will be added each frame
        let vy = 0.8 + Math.random() * 1.8;
        if(type === 'bad') vy += 0.6;
        if(type === 'bomb') vy += 0.2;
        if(type === 'health') vy += 0.4; // health falls at moderate speed

        let initialY = -r - 10;
        
        // First item takes 9.5 seconds to fall
        if(!firstObjectSpawned){
            // We need to calculate initial Y so item is caught at exactly 9.5 seconds
            // Physics: y(t) = initialY + vy*t + fallSpeed*0.16*t (summed over frames)
            // At t=570 frames (9.5s): y = basket.y (collision point)
            // Basket collision happens when: item.y + item.r >= basket.y
            // Basket.y = LOGICAL_HEIGHT - basket.height - 30
            // We want: initialY + (vy + fallSpeed*0.16) * 570 = basket.y + r

            const basketCollisionY = (LOGICAL_HEIGHT - basket.height - 30) + r;
            const avgVelocityPerFrame = vy + (fallSpeed * 0.16);
            const framesFor9_5Seconds = 570; // 9.5 * 60
            const distanceNeeded = avgVelocityPerFrame * framesFor9_5Seconds;

            // initialY + distanceNeeded = basketCollisionY
            initialY = basketCollisionY - distanceNeeded;
        }
        
        items.push({ x, y: initialY, r, type, sprite, vy });
        firstObjectSpawned = true;
    }

    // Start spawning (uses `spawnInterval` variable)
    function startSpawning(){
        if(spawnTimerId) clearInterval(spawnTimerId);
        // Spawn first item immediately, then wait 7.5 seconds before spawning more
        spawnItem();
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
        // Stop background music
        backgroundMusic.pause();
        backgroundMusic.currentTime = 0;
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

        // Check if immunity period has expired
        if(isImmune && Date.now() >= immunityEndTime){
            isImmune = false;
        }

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
                    // Only apply bomb damage if not immune
                    if(!isImmune){
                        bombsCaught += 1;
                        // Flash canvas white for 1ms instead of minus points
                        triggerBombFlash();
                        // Grant immunity for 2 seconds (2000ms)
                        isImmune = true;
                        immunityEndTime = Date.now() + 2000;
                        if(bombsCaught >= maxBombs) endGame();
                    }
                } else if(it.type === 'health'){
                    // Health powerup: reduce strikes by 1 (cannot go below 0)
                    bombsCaught = Math.max(0, bombsCaught - 1);
                    score += 10; // bonus points for catching health
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
    // `isUser` indicates the pause/resume was initiated by the player (true)
    // or automatically by the page visibility/focus handlers (false).
    let autoPaused = false;
    let userPaused = false;

    function pauseGame(isUser = true){
        if(gameOver) return;
        paused = true;
        if(isUser) userPaused = true; else autoPaused = true;
        // stop spawning while paused
        if(spawnTimerId) { clearInterval(spawnTimerId); spawnTimerId = null; }
        // pause background music
        if(backgroundMusicStarted) backgroundMusic.pause();
        const pm = document.getElementById('pauseModal');
        if(pm) pm.style.display = 'flex';
    }

    function resumeGame(isUser = true){
        if(gameOver) return;
        paused = false;
        if(isUser) userPaused = false; else autoPaused = false;
        // resume spawning
        if(!spawnTimerId) startSpawning();
        // resume background music
        if(backgroundMusicStarted) backgroundMusic.play().catch(()=>{});
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

    // Auto pause when tab/window is not active. Respect user's manual pause.
    document.addEventListener('visibilitychange', () => {
        if(document.hidden){
            if(!paused) pauseGame(false);
        } else {
            // only auto-resume if we auto-paused (and user hasn't manually paused)
            if(autoPaused && !userPaused) resumeGame(false);
        }
    });

    window.addEventListener('blur', () => {
        if(!paused) pauseGame(false);
    });

    window.addEventListener('focus', () => {
        if(autoPaused && !userPaused) resumeGame(false);
    });

    function draw(){
        // clear logical canvas area
        ctx.clearRect(0,0,LOGICAL_WIDTH,LOGICAL_HEIGHT);

        // If bomb flash is active, render white screen
        if(bombFlashing){
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
            return; // Skip drawing game objects while flashing
        }

        // Draw basket sprite (fallback to placeholder if not yet loaded)
        if (sprites.basket && sprites.basket.complete) {
            ctx.drawImage(sprites.basket, basket.x, basket.y, basket.width, basket.height);
        } else {
            ctx.fillStyle = 'orange';
            ctx.fillRect(basket.x, basket.y, basket.width, basket.height);
        }

        // Draw items (sprites) with glow to improve visibility
        for(const it of items){
            const size = it.r * 2;

            // Choose glow color per item type
            let glowColor = 'rgba(255,255,255,0.9)';
            if(it.type === 'good') glowColor = 'rgba(255,214,74,0.95)';
            else if(it.type === 'bad') glowColor = 'rgba(154,160,166,0.85)';
            else if(it.type === 'bomb') glowColor = 'rgba(255,92,92,0.95)';
            else if(it.type === 'health') glowColor = 'rgba(74,255,144,0.95)'; // green glow for health

            // Glow strength scaled to item size
            const glowRadius = Math.max(10, it.r * 0.9);

            ctx.save();
            ctx.shadowBlur = glowRadius;
            ctx.shadowColor = glowColor;

            if(it.sprite && it.sprite.complete){
                // Draw sprite centered at (it.x, it.y) with size 2*it.r
                ctx.drawImage(it.sprite, it.x - it.r, it.y - it.r, size, size);
            } else {
                // Fallback: colored circles if sprite not loaded
                if(it.type === 'good') ctx.fillStyle = '#ffd24a';
                else if(it.type === 'bad') ctx.fillStyle = '#9aa0a6';
                else if(it.type === 'bomb') ctx.fillStyle = '#ff5c5c';
                else if(it.type === 'health') ctx.fillStyle = '#4aff90'; // green for health

                ctx.beginPath();
                ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
                ctx.fill();
            }

            // Optional soft outer ring to emphasize the glow (non-shadow)
            ctx.shadowColor = 'transparent';
            ctx.globalCompositeOperation = 'lighter';
            ctx.beginPath();
            ctx.fillStyle = glowColor;
            ctx.globalAlpha = 0.12;
            ctx.arc(it.x, it.y, it.r + glowRadius * 0.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = 'source-over';

            ctx.restore();
        }

        // If trash overlay active, draw semi-opaque grey layer (30% opacity)
        if(trashOverlay){
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
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
    // Set game start time for 7.5 second intro phase
    gameStartTime = Date.now();
    
    // Start background music immediately
    backgroundMusic.play().then(() => {
        console.log('Music started');
        backgroundMusicStarted = true;
    }).catch((err) => {
        console.warn('Music autoplay failed:', err);
        // Try again on user interaction
        document.addEventListener('click', () => {
            if(!backgroundMusicStarted){
                backgroundMusic.play();
                backgroundMusicStarted = true;
            }
        }, { once: true });
    });
    
    startSpawning();
    loop();
});