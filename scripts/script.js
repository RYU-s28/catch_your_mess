window.addEventListener('load', function(){
    // --- Highscore Leaderboard Logic ---
    const LEADERBOARD_SIZE = 10;
    const LEADERBOARD_FILE = 'data/highscores.json';
    let leaderboard = [];

    // Helper: load leaderboard from server; fall back to localStorage if server unreachable
    async function loadLeaderboard() {
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

    // Helper: add new highscore (posts to server; falls back to localStorage)
    async function addHighscore(name, score) {
        // try server
        try {
            const res = await fetch('/api/highscores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.slice(0,8), score: Number(score) })
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

        // fallback: update locally
        const now = new Date();
        const dateStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        leaderboard.push({ name: name.slice(0,8), score, date: dateStr });
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
        popup.appendChild(input);

        // Blinking cursor effect via placeholder and CSS

        const submitBtn = document.createElement('button');
        submitBtn.textContent = 'SUBMIT';
        submitBtn.style.marginTop = '18px';
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
    // canvas setup (portrait-first logical resolution)
    const canvas = document.getElementById('gameCanvas') || document.getElementById('canvas1');
    const ctx = canvas.getContext('2d');

    // Logical resolution used for drawing. CSS controls display size and scaling.
    const LOGICAL_WIDTH = 480;
    const LOGICAL_HEIGHT = 800;
    canvas.width = LOGICAL_WIDTH;
    canvas.height = LOGICAL_HEIGHT;

    // side-panel stat elements (optional - present in desktop layout)
    const statScoreEl = document.getElementById('statScore');
    const statBombsEl = document.getElementById('statBombs');
    const statLevelEl = document.getElementById('statLevel');
    const statSpeedEl = document.getElementById('statSpeed');

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

    // Basket (orange rectangle)
    const basket = {
        width: Math.max(80, Math.floor(canvas.width * 0.12)),
        height: 28,
        x: 0,
        y: 0,
        speed: 8
    };

    function resetBasketPosition(){
        basket.x = (canvas.width - basket.width) / 2;
        basket.y = canvas.height - basket.height - 30;
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
        const scaleX = canvas.width / rect.width;
        const xCanvas = (e.clientX - rect.left) * scaleX;
        basket.x = xCanvas - basket.width / 2;
        // constrain immediately
        if(basket.x < 0) basket.x = 0;
        if(basket.x + basket.width > canvas.width) basket.x = canvas.width - basket.width;
    });

    // Spawn settings
    let spawnTimerId = null;

    function spawnItem(){
        if(gameOver) return;
        // enforce max items
        if(items.length >= maxItems) return;

        const x = Math.random() * (canvas.width - 60) + 30;
        const r = 12 + Math.random() * 14; // size (used as radius / half-size)
        const p = Math.random();
        let type = 'good';
        if(p < 0.6) type = 'good';
        else if(p < 0.9) type = 'bad';
        else type = 'bomb';

        // map types to shapes (geometric placeholders)
        let shape = 'circle';
        if(type === 'good') shape = 'circle';
        else if(type === 'bad') shape = 'square';
        else if(type === 'bomb') shape = 'triangle';

        // per-item base vertical speed; global `fallSpeed` will be added each frame
        let vy = 0.8 + Math.random() * 1.8;
        if(type === 'bad') vy += 0.6;
        if(type === 'bomb') vy += 0.2;

        items.push({ x, y: -r - 10, r, type, shape, vy });
    }

    // Start spawning (uses `spawnInterval` variable)
    function startSpawning(){
        if(spawnTimerId) clearInterval(spawnTimerId);
        spawnTimerId = setInterval(spawnItem, spawnInterval);
    }

    // Level tracking (no timer)
    let tickIntervalId = setInterval(()=>{
        if(gameOver) return;
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
        if(gameOver) return;

        // Move basket
        if(keys.left) basket.x -= basket.speed;
        if(keys.right) basket.x += basket.speed;
        // constrain
        if(basket.x < 0) basket.x = 0;
        if(basket.x + basket.width > canvas.width) basket.x = canvas.width - basket.width;

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
                } else if(it.type === 'bomb'){
                    bombsCaught += 1;
                    // penalty for bombs
                    score = Math.max(0, score - 20);
                    if(bombsCaught >= maxBombs) endGame();
                }
                // remove
                items.splice(i,1);
                continue;
            }

            // missed (fell beyond bottom)
            if(it.y - it.r > canvas.height){
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

    function draw(){
        // clear
        ctx.clearRect(0,0,canvas.width,canvas.height);

        // background (canvas CSS sets color but draw a rect too to be consistent)
        ctx.fillStyle = '#4d79bc';
        ctx.fillRect(0,0,canvas.width,canvas.height);

        // draw basket
        ctx.fillStyle = 'orange';
        ctx.fillRect(basket.x, basket.y, basket.width, basket.height);

        // draw items (geometric shapes)
        for(const it of items){
            if(it.type === 'good') ctx.fillStyle = '#ffd24a';
            else if(it.type === 'bad') ctx.fillStyle = '#9aa0a6';
            else if(it.type === 'bomb') ctx.fillStyle = '#ff5c5c';

            if(it.shape === 'circle'){
                ctx.beginPath();
                ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
                ctx.fill();
            } else if(it.shape === 'square'){
                ctx.fillRect(it.x - it.r, it.y - it.r, it.r * 2, it.r * 2);
            } else if(it.shape === 'triangle'){
                ctx.beginPath();
                ctx.moveTo(it.x, it.y - it.r);
                ctx.lineTo(it.x - it.r, it.y + it.r);
                ctx.lineTo(it.x + it.r, it.y + it.r);
                ctx.closePath();
                ctx.fill();
            } else {
                // fallback: circle
                ctx.beginPath();
                ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // HUD
        ctx.fillStyle = 'white';
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'left';
    ctx.fillText('Score: ' + score, 18, 28);
    ctx.fillText('Bombs: ' + bombsCaught + ' / ' + maxBombs, 18, 56);
    ctx.fillText('Level: ' + level, 18, 84);
    ctx.fillText('Fall speed: ' + fallSpeed.toFixed(2), 18, 112);

    // update side-panel stats if present
    if(statScoreEl) statScoreEl.textContent = 'Score: ' + score;
    if(statBombsEl) statBombsEl.textContent = 'Bombs: ' + bombsCaught + ' / ' + maxBombs;
    if(statLevelEl) statLevelEl.textContent = 'Level: ' + level;
    if(statSpeedEl) statSpeedEl.textContent = 'Speed: ' + fallSpeed.toFixed(2);

        if(gameOver){
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(0,0,canvas.width,canvas.height);
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.font = '48px sans-serif';
            ctx.fillText('GAME OVER', canvas.width/2, canvas.height/2 - 20);
            ctx.font = '28px sans-serif';
            ctx.fillText('Final Score: ' + score, canvas.width/2, canvas.height/2 + 30);
            ctx.font = '20px sans-serif';
            ctx.fillText('Press F5 to play again', canvas.width/2, canvas.height/2 + 70);
        }
    }

    // main loop
    function loop(){
        update();
        draw();
        if(!gameOver) requestAnimationFrame(loop);
    }

    // initialize and start
    startSpawning();
    loop();
});