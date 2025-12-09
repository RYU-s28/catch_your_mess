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
            li.setAttribute('data-rank', idx + 1);
            
            const playerInfo = document.createElement('div');
            playerInfo.className = 'player-info';
            
            const playerName = document.createElement('span');
            playerName.className = 'player-name';
            playerName.textContent = entry.name;
            
            const playerScore = document.createElement('span');
            playerScore.className = 'player-score';
            playerScore.textContent = entry.score.toLocaleString();
            
            playerInfo.appendChild(playerName);
            li.appendChild(playerInfo);
            li.appendChild(playerScore);
            
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
    const ASPECT_RATIO = LOGICAL_WIDTH / LOGICAL_HEIGHT;

    // Function to resize canvas responsively
    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        
        // Get the actual displayed size of the canvas
        const rect = canvas.getBoundingClientRect();
        const displayWidth = rect.width;
        const displayHeight = rect.height;
        
        // Calculate the best fit while maintaining aspect ratio
        let canvasWidth, canvasHeight;
        const viewportAspect = displayWidth / displayHeight;
        
        if (viewportAspect > ASPECT_RATIO) {
            // Viewport is wider - fit to height
            canvasHeight = displayHeight;
            canvasWidth = displayHeight * ASPECT_RATIO;
        } else {
            // Viewport is taller - fit to width
            canvasWidth = displayWidth;
            canvasHeight = displayWidth / ASPECT_RATIO;
        }
        
        // Set canvas CSS size
        canvas.style.width = canvasWidth + 'px';
        canvas.style.height = canvasHeight + 'px';
        
        // Set canvas physical resolution (for crisp rendering)
        canvas.width = LOGICAL_WIDTH * dpr;
        canvas.height = LOGICAL_HEIGHT * dpr;
        
        // Scale the context to match DPR
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Initial canvas setup
    resizeCanvas();
    
    // Resize canvas when window size changes
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(resizeCanvas, 100);
    });
    
    // Also handle orientation changes on mobile
    window.addEventListener('orientationchange', () => {
        setTimeout(resizeCanvas, 100);
    });

    // Sprite image assets
    const sprites = {
        basket: null,
        goodDrops: [], // array of good drop images (6 variants: bun, coin, corn, nacho, octopus, skewer)
        badDrop: null,  // rubish.png
        bomb: null,     // dynamite.png
        health: null,   // health.png (healing powerup)
        healthIcon: null,  // health.png (for HUD display)
        brokenHealthIcon: null  // broken_health.png (for HUD display)
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
        
        // Load health HUD icons
        sprites.healthIcon = new Image();
        sprites.healthIcon.src = baseUrl + 'health.png';
        
        sprites.brokenHealthIcon = new Image();
        sprites.brokenHealthIcon.src = baseUrl + 'broken_health.png';
    }

    // Helper to get random good drop sprite
    function getRandomGoodDrop(){
        return sprites.goodDrops[Math.floor(Math.random() * sprites.goodDrops.length)];
    }

    // UI DOM elements (we update these instead of drawing HUD on canvas)
    const scoreDisplay = document.getElementById('scoreDisplay');
    const scoreValue = document.getElementById('scoreValue');
    const uiScore = document.getElementById('uiScore');
    const uiLevel = document.getElementById('uiLevel');
    const uiBombs = document.getElementById('uiBombs');
    const uiSpeed = document.getElementById('uiSpeed');
    
    // Score add animation (for earning points)
    function animateScoreAdd() {
        if(scoreDisplay) {
            scoreDisplay.classList.remove('score-add');
            void scoreDisplay.offsetWidth; // trigger reflow
            scoreDisplay.classList.add('score-add');
        }
    }
    
    // Score pop animation (for bomb/trash damage)
    function animateScorePop() {
        if(scoreDisplay) {
            scoreDisplay.classList.remove('score-pop');
            void scoreDisplay.offsetWidth; // trigger reflow
            scoreDisplay.classList.add('score-pop');
        }
    }

    // Ayiee Character Dialogue System
    const ayieePopup = document.getElementById('ayieePopup');
    const dialogueText = document.getElementById('dialogueText');
    let currentDialogueTimeout = null;
    let lastDialogueTime = 0;
    const dialogueCooldown = 3000; // 3 seconds between dialogues - reduced for more frequent commenting

    // Dialogue library
    const dialogues = {
        welcome: [
            "Ayie! You made this mess! Now catch it all!",
            "You think this is a game? Clean up NOW!",
            "Listen up! Don't embarrass me in front of customers!"
        ],
        goodCatch: [
            "Hao! Finally doing something right! 好！",
            "About time you caught something!",
            "Hmph! Not bad... for once.",
            "Keep going! Don't mess it up!",
            "That's more like it! 還可以！"
        ],
        multipleCatch: [
            "Wah! Maybe you're not totally useless! 🔥",
            "Finally! A decent streak! 連續得分！",
            "Don't get cocky now!",
            "Okay okay, not bad! 還不錯！"
        ],
        bombHit: [
            "AIYAH! Are you BLIND?! 瞎了嗎？",
            "ARE YOU TRYING TO GET US KILLED?!",
            "What's WRONG with you?! 避開炸彈！",
            "My stall! MY STALL! You idiot!",
            "Do you have EYES?! 小心一點！",
            "Useless! Absolutely USELESS! 沒用！"
        ],
        trashCatch: [
            "STOP! You're ruining my merchandise! 髒東西！",
            "What are you DOING?! That's trash!",
            "You better get your act together! 壞東西！",
            "Are you STUPID?! Don't catch that!",
            "My inventory! You're destroying it! 笨蛋！",
            "This is why I can't have nice things!",
            "You're costing me money! 賠錢貨！"
        ],
        levelUp: [
            "Too slow! Let's see if you can handle THIS!",
            "Faster now! Try to keep up! 跟上！",
            "Getting too easy? Not anymore!",
            "Think you're good? Watch this!"
        ],
        lowHealth: [
            "Look at you! Almost dead! 快死了！",
            "Pathetic! Can't even stay alive! 沒用！",
            "You're FAILING! Get it together! 危險！",
            "One more mistake and you're DONE!"
        ],
        healthSpawned: [
            "HEALTH! Get it NOW! 快接！",
            "Green one! That's HEALTH! Catch it! 接住！",
            "DON'T MISS THE HEALTH! 別錯過！",
            "Health powerup! MOVE! 快動！",
            "That's your lifeline! GET IT! 救命的！"
        ],
        healthPickup: [
            "Lucky catch! Don't waste it! 別浪費！",
            "Finally! Maybe you'll last longer now.",
            "About time you got some health!"
        ],
        highScore: [
            "Hmph! Not bad... I guess. 還可以！",
            "Keep it up! Don't disappoint me!",
            "Finally earning your keep!",
            "Impressive... for a klutz! 厲害！"
        ],
        encouragement: [
            "Come on! Stop being useless! 加油！",
            "You can do BETTER than this!",
            "Is this really your best?! 繼續！",
            "Don't give up NOW! Keep going!"
        ],
        missedItem: [
            "You MISSED it! Are you sleeping?! 醒醒！",
            "WAKE UP! That was easy! 簡單的都接不到！",
            "How could you miss THAT?! 怎麼可能！",
            "My profits! Falling to the ground! 我的錢！",
            "Unbelievable! You let it drop! 不可思議！",
            "That was RIGHT THERE! Useless! 沒用！",
            "Are you BLIND?! 瞎了嗎！",
            "Stop daydreaming and FOCUS! 專心！"
        ],
        randomHarass: [
            "You call that catching? Pathetic!",
            "My grandmother moves faster than you!",
            "Are you even TRYING?! 認真點！",
            "This is embarrassing to watch!",
            "Focus! FOCUS! 專心！",
            "I've seen children do better!",
            "What a disaster! 糟糕透了！",
            "You're making me look bad!",
            "Speed up! You're too slow! 太慢了！",
            "Aiyah! So clumsy! 笨手笨腳！"
        ]
    };

    function showAyieeDialogue(category, duration = 4000) {
        const now = Date.now();
        
        // Don't show if on cooldown
        if (now - lastDialogueTime < dialogueCooldown) return;
        
        const messages = dialogues[category];
        if (!messages || messages.length === 0) return;
        
        // Pick random message from category
        const message = messages[Math.floor(Math.random() * messages.length)];
        
        // Update dialogue text
        if (dialogueText) {
            dialogueText.textContent = message;
        }
        
        // Show popup
        if (ayieePopup) {
            ayieePopup.classList.add('show');
        }
        
        lastDialogueTime = now;
        
        // Clear existing timeout
        if (currentDialogueTimeout) {
            clearTimeout(currentDialogueTimeout);
        }
        
        // Hide after duration
        currentDialogueTimeout = setTimeout(() => {
            if (ayieePopup) {
                ayieePopup.classList.remove('show');
            }
        }, duration);
    }

    // Show welcome message on load
    setTimeout(() => showAyieeDialogue('welcome', 5000), 500);

    // Random harassment timer - Ayiee will randomly harass the player
    setInterval(() => {
        if(!gameOver && !paused && Math.random() < 0.3) { // 30% chance every interval
            showAyieeDialogue('randomHarass', 3500);
        }
    }, 15000); // Every 15 seconds, check if she should harass

    const gameOverModal = document.getElementById('gameOverModal');
    const finalScoreEl = document.getElementById('finalScore');
    const restartBtn = document.getElementById('restartBtn');
    if(restartBtn) restartBtn.addEventListener('click', () => window.location.reload());

    // Pause button functionality
    const pauseBtn = document.getElementById('pauseBtn');
    if(pauseBtn) {
        pauseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if(!gameOver) {
                if(paused) {
                    resumeGame(true);
                } else {
                    pauseGame(true);
                }
            }
        });
    }

    // Leaderboard toggle functionality
    const leaderboardToggleBtn = document.getElementById('leaderboardToggleBtn');
    const leaderboardPanel = document.getElementById('leaderboardPanel');
    let leaderboardVisible = false;
    
    if(leaderboardToggleBtn && leaderboardPanel) {
        leaderboardToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            leaderboardVisible = !leaderboardVisible;
            if(leaderboardVisible) {
                leaderboardPanel.classList.add('visible');
            } else {
                leaderboardPanel.classList.remove('visible');
            }
        });
    }

    // Load sprites immediately
    loadSprites();

    // Preload bomb sound effect (flashbang)
    const bombAudio = new Audio('assets/audio/flashbang.mp3');
    bombAudio.volume = 0.7;

    // Preload heal sound effect
    const healAudio = new Audio('assets/audio/Heal.mp3');
    healAudio.volume = 0.6;

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
    let trashOverlays = []; // array to track active trash overlays with timestamps
    let isImmune = false; // flag to indicate immunity period after bomb hit
    let immunityEndTime = 0; // timestamp when immunity ends
    
    // Floating score animations
    let floatingScores = []; // array of {x, y, text, color, alpha, age}
    
    // Heart system: track which hearts are broken (true = broken, false = healthy)
    let hearts = [false, false, false]; // 3 hearts, all start healthy

    // Dialogue tracking variables
    let consecutiveGoodCatches = 0;
    let lastScore = 0;
    let lastLevel = 1;

    // Function to create floating score animation
    function createFloatingScore(points, x, y) {
        const isPositive = points > 0;
        floatingScores.push({
            x: x,
            y: y,
            text: (isPositive ? '+' : '') + points,
            color: isPositive ? '#00ff00' : '#ff0000', // green for positive, red for negative
            alpha: 1.0,
            age: 0,
            velocityY: -2 // float upward
        });
    }

    // Basket (original placeholder dimensions)
    const basket = {
        width: Math.max(80, Math.floor(LOGICAL_WIDTH * 0.12)),
        height: 48,
        x: 0,
        y: 0,
        speed: 12, // increased from 8 for better responsiveness
        velocityX: 0, // current velocity for smooth movement
        acceleration: 1.5, // acceleration rate
        friction: 0.85 // friction/deceleration factor
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
    let activePointerId = null;
    
    canvas.addEventListener('pointerdown', (e) => {
        if(paused || gameOver) return;
        // Track the first touch/pointer
        if(activePointerId === null) {
            activePointerId = e.pointerId;
            canvas.setPointerCapture(e.pointerId);
            updateBasketPosition(e);
        }
        e.preventDefault(); // prevent scrolling and other default behaviors
    });
    
    canvas.addEventListener('pointermove', (e) => {
        // Don't update basket position when paused or game over
        if(paused || gameOver) return;
        
        // Only respond to the active pointer (prevents multi-touch issues)
        if(activePointerId !== null && e.pointerId !== activePointerId) return;
        
        updateBasketPosition(e);
        e.preventDefault();
    });
    
    canvas.addEventListener('pointerup', (e) => {
        if(e.pointerId === activePointerId) {
            activePointerId = null;
        }
    });
    
    canvas.addEventListener('pointercancel', (e) => {
        if(e.pointerId === activePointerId) {
            activePointerId = null;
        }
    });
    
    function updateBasketPosition(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = LOGICAL_WIDTH / rect.width; // logical / css
        const xGame = (e.clientX - rect.left) * scaleX;
        basket.x = xGame - basket.width / 2;
        // constrain immediately in logical coords
        if(basket.x < 0) basket.x = 0;
        if(basket.x + basket.width > LOGICAL_WIDTH) basket.x = LOGICAL_WIDTH - basket.width;
    }

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
            // Check if we should spawn a health powerup (1% chance when player has strikes)
            // Only spawn if player has strikes AND no health powerup is currently on screen
            const hasHealthOnScreen = items.some(item => item.type === 'health');
            if(bombsCaught > 0 && !hasHealthOnScreen && Math.random() < 0.01){
                type = 'health';
                // Ayiee alerts player about health spawn!
                showAyieeDialogue('healthSpawned', 3500);
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
            
            // Dialogue for level up
            if(level > lastLevel && Math.random() < 0.7){
                showAyieeDialogue('levelUp');
                lastLevel = level;
            }
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

        // Move basket with smooth acceleration
        if(keys.left) {
            basket.velocityX -= basket.acceleration;
            if(basket.velocityX < -basket.speed) basket.velocityX = -basket.speed;
        } else if(keys.right) {
            basket.velocityX += basket.acceleration;
            if(basket.velocityX > basket.speed) basket.velocityX = basket.speed;
        } else {
            // Apply friction when no keys are pressed
            basket.velocityX *= basket.friction;
            if(Math.abs(basket.velocityX) < 0.1) basket.velocityX = 0;
        }
        
        // Update position based on velocity
        basket.x += basket.velocityX;
        
        // constrain (use logical width)
        if(basket.x < 0) {
            basket.x = 0;
            basket.velocityX = 0; // stop velocity at boundary
        }
        if(basket.x + basket.width > LOGICAL_WIDTH) {
            basket.x = LOGICAL_WIDTH - basket.width;
            basket.velocityX = 0; // stop velocity at boundary
        }

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
                    animateScoreAdd();
                    createFloatingScore(5, basket.x + basket.width / 2, basket.y - 10);
                    
                    // Dialogue triggers for good catches
                    consecutiveGoodCatches++;
                    if(consecutiveGoodCatches >= 5 && Math.random() < 0.4){
                        showAyieeDialogue('multipleCatch');
                    } else if(Math.random() < 0.15){
                        showAyieeDialogue('goodCatch');
                    }
                    
                    // High score comment
                    if(score > 200 && score - lastScore >= 50 && Math.random() < 0.2){
                        showAyieeDialogue('highScore');
                        lastScore = score;
                    }
                } else if(it.type === 'bad'){
                    score = Math.max(0, score - 8);
                    consecutiveGoodCatches = 0; // reset streak
                    // show a grey overlay briefly when player collects trash
                    triggerTrashOverlay();
                    animateScorePop();
                    createFloatingScore(-8, basket.x + basket.width / 2, basket.y - 10);
                    
                    // Dialogue for trash catch - ALWAYS COMMENT
                    showAyieeDialogue('trashCatch');
                } else if(it.type === 'bomb'){
                    // Only apply bomb damage if not immune
                    if(!isImmune){
                        bombsCaught += 1;
                        consecutiveGoodCatches = 0; // reset streak
                        // Mark the rightmost healthy heart as broken
                        for(let h = hearts.length - 1; h >= 0; h--){
                            if(!hearts[h]){
                                hearts[h] = true; // mark as broken
                                break;
                            }
                        }
                        // Flash canvas white for 1ms instead of minus points
                        triggerBombFlash();
                        animateScorePop();
                        
                        // Dialogue for bomb hit - ALWAYS COMMENT
                        showAyieeDialogue('bombHit');
                        
                        // Grant immunity for 2 seconds (2000ms)
                        isImmune = true;
                        immunityEndTime = Date.now() + 2000;
                        if(bombsCaught >= maxBombs) endGame();
                    }
                } else if(it.type === 'health'){
                    // Health powerup: reduce strikes by 1 (cannot go below 0)
                    bombsCaught = Math.max(0, bombsCaught - 1);
                    // Heal the leftmost broken heart
                    for(let h = 0; h < hearts.length; h++){
                        if(hearts[h]){
                            hearts[h] = false; // mark as healthy
                            break;
                        }
                    }
                    // Play heal sound
                    try {
                        if(healAudio){
                            healAudio.currentTime = 0;
                            const p = healAudio.play();
                            if(p && typeof p.then === 'function') p.catch(()=>{});
                        }
                    } catch (e) {}
                    score += 10; // bonus points for catching health
                    createFloatingScore(10, basket.x + basket.width / 2, basket.y - 10);
                    
                    // Dialogue for health pickup
                    if(Math.random() < 0.6){
                        showAyieeDialogue('healthPickup');
                    }
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
                    consecutiveGoodCatches = 0; // reset streak
                    // Mark the rightmost healthy heart as broken
                    for(let h = hearts.length - 1; h >= 0; h--){
                        if(!hearts[h]){
                            hearts[h] = true; // mark as broken
                            break;
                        }
                    }
                    score = Math.max(0, score - 20);
                    createFloatingScore(-20, basket.x + basket.width / 2, basket.y - 10);
                    
                    // Ayiee comments on EVERY missed item
                    showAyieeDialogue('missedItem');
                    
                    if(bombsCaught >= maxBombs) endGame();
                }
                items.splice(i,1);
            }
        }

        // Update floating score animations
        for(let i = floatingScores.length - 1; i >= 0; i--){
            const fs = floatingScores[i];
            fs.y += fs.velocityY; // move upward
            fs.age += 1;
            fs.alpha = Math.max(0, 1.0 - (fs.age / 60)); // fade out over 60 frames (~1 second)
            
            // Remove when fully faded
            if(fs.alpha <= 0) {
                floatingScores.splice(i, 1);
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

        // If trash overlays active, draw grey layer (25% opacity per trash caught)
        if(trashOverlays.length > 0){
            const opacity = Math.min(trashOverlays.length * 0.25, 1.0); // 25% per trash, max 100%
            ctx.fillStyle = `rgba(0,0,0,${opacity})`;
            ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        }
        
        // Draw hearts HUD (centered at top)
        const heartSize = 80; // increased from 40 to 80 (2x)
        const heartSpacing = 20; // increased from 10 to 20 (2x)
        const totalHeartsWidth = (heartSize * hearts.length) + (heartSpacing * (hearts.length - 1));
        const heartStartX = (LOGICAL_WIDTH - totalHeartsWidth) / 2; // centered
        const heartStartY = 20;
        
        for(let i = 0; i < hearts.length; i++){
            const heartX = heartStartX + (i * (heartSize + heartSpacing));
            const heartY = heartStartY;
            
            if(hearts[i]){
                // Draw broken heart
                if(sprites.brokenHealthIcon && sprites.brokenHealthIcon.complete){
                    ctx.drawImage(sprites.brokenHealthIcon, heartX, heartY, heartSize, heartSize);
                } else {
                    // Fallback: draw red X
                    ctx.fillStyle = 'rgba(255,0,0,0.7)';
                    ctx.fillRect(heartX, heartY, heartSize, heartSize);
                }
            } else {
                // Draw healthy heart
                if(sprites.healthIcon && sprites.healthIcon.complete){
                    ctx.drawImage(sprites.healthIcon, heartX, heartY, heartSize, heartSize);
                } else {
                    // Fallback: draw green square
                    ctx.fillStyle = 'rgba(0,255,0,0.7)';
                    ctx.fillRect(heartX, heartY, heartSize, heartSize);
                }
            }
        }

        // Draw floating score animations
        ctx.save();
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        for(const fs of floatingScores){
            ctx.globalAlpha = fs.alpha;
            ctx.fillStyle = fs.color;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            
            // Outline for visibility
            ctx.strokeText(fs.text, fs.x, fs.y);
            ctx.fillText(fs.text, fs.x, fs.y);
        }
        
        ctx.restore();
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

    // Show a brief grey overlay when collecting trash (stackable)
    function triggerTrashOverlay(){
        const overlayId = Date.now() + Math.random();
        trashOverlays.push(overlayId);
        setTimeout(() => {
            const index = trashOverlays.indexOf(overlayId);
            if(index > -1) trashOverlays.splice(index, 1);
        }, 3000);
    }

    // Update UI overlay (stats and game-over)
    function updateUI(){
        if(scoreValue) {
            scoreValue.textContent = score;
        }
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