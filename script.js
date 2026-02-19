// --- CONFIG & GLOBAL STATE ---
let scene, camera, renderer, player, playerLight;
let score = 0, highScore = localStorage.getItem('galactic_high_prod') || 0;
let currentLevel = 1, bossActive = false;
let gameActive = false, isPaused = false;
let obstacles = [], bullets = [], particles = [], powerups = [], nebulae = [], enemyBullets = [];
let boss = null;
let starsMesh, clock = new THREE.Clock();
let keys = {}, mouseX = 0, mouseY = 0, isTouching = false;
let spawnTimer = 0, pUpTimer = 0, shakeIntensity = 0;

const BASE_SPEED = 160; 
const POINTS_PER_LEVEL = 5000;
const SCORE_EL = document.getElementById('score-display');
const HIGH_SCORE_EL = document.getElementById('high-score-display');
const LEVEL_EL = document.getElementById('level-display');
const HEALTH_BAR = document.getElementById('health-bar');
const BOSS_UI = document.getElementById('boss-ui');
const BOSS_HEALTH_FILL = document.getElementById('boss-health-fill');

HIGH_SCORE_EL.textContent = highScore.toString().padStart(4, '0');

// --- INITIALIZATION ---
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010108);
    scene.fog = new THREE.FogExp2(0x010108, 0.0035);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 4000);
    camera.position.set(0, 5, 20);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.body.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const sun = new THREE.DirectionalLight(0x818cf8, 1.5);
    sun.position.set(20, 40, 20);
    scene.add(sun);

    playerLight = new THREE.PointLight(0x00ffff, 0, 20);
    scene.add(playerLight);

    createStarfield();
    createNebulae();

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
        if (e.key.toLowerCase() === 'p') togglePause();
    });
    window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
    window.addEventListener('mousemove', (e) => {
        mouseX = (e.clientX / window.innerWidth) * 2 - 1;
        mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    });
    window.addEventListener('mousedown', () => isTouching = true);
    window.addEventListener('mouseup', () => isTouching = false);
    window.addEventListener('touchstart', (e) => { isTouching = true; handleInput(e); }, {passive:false});
    window.addEventListener('touchmove', (e) => { handleInput(e); e.preventDefault(); }, {passive:false});
    window.addEventListener('touchend', () => isTouching = false);
}

function createStarfield() {
    const geom = new THREE.BufferGeometry();
    const pos = [], colors = [];
    for (let i = 0; i < 20000; i++) {
        pos.push(THREE.MathUtils.randFloatSpread(2500), THREE.MathUtils.randFloatSpread(2500), THREE.MathUtils.randFloatSpread(5000));
        const c = new THREE.Color().setHSL(Math.random() * 0.2 + 0.5, 0.8, 0.8);
        colors.push(c.r, c.g, c.b);
    }
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    starsMesh = new THREE.Points(geom, new THREE.PointsMaterial({ size: 0.8, vertexColors: true, transparent: true, opacity: 0.8 }));
    scene.add(starsMesh);
}

function createNebulae() {
    const colors = [0x4f46e5, 0x7c3aed, 0x06b6d4, 0xef4444, 0x3b82f6];
    for(let i=0; i<15; i++) {
        const nebula = new THREE.Mesh(
            new THREE.SphereGeometry(280, 16, 16),
            new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true, opacity: 0.04, side: THREE.BackSide })
        );
        nebula.position.set(THREE.MathUtils.randFloatSpread(1500), THREE.MathUtils.randFloatSpread(1200), THREE.MathUtils.randFloatSpread(4000));
        nebula.scale.set(1.6, 0.7, 3.5);
        scene.add(nebula);
        nebulae.push(nebula);
    }
}

function togglePause() {
    if (!gameActive) return;
    isPaused = !isPaused;
    document.getElementById('pause-screen').style.display = isPaused ? 'block' : 'none';
    document.getElementById('pause-indicator').style.display = isPaused ? 'block' : 'none';
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function handleInput(e) {
    if (e.touches.length > 0) {
        mouseX = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
        mouseY = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
    }
}

// --- GAME OBJECT CLASSES ---

class PlayerShip {
    constructor() {
        this.mesh = new THREE.Group();
        const mat = new THREE.MeshPhongMaterial({ color: 0x4f46e5, shininess: 150 });
        
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 3.2), mat);
        const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), new THREE.MeshPhongMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 }));
        cockpit.position.set(0, 0.35, 0.8); cockpit.scale.z = 1.8;
        
        const wing = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.1, 1.6), mat);
        wing.position.z = 0.5;
        
        this.mesh.add(body, cockpit, wing);

        this.shield = new THREE.Mesh(
            new THREE.SphereGeometry(3.2, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0, wireframe: true })
        );
        this.mesh.add(this.shield);

        this.health = 100;
        this.shieldTime = 0;
        this.hyperTime = 0;
        this.lastFire = 0;
        scene.add(this.mesh);
    }

    update(delta, time) {
        const targetX = mouseX * 24;
        const targetY = mouseY * 18;
        this.mesh.position.x += (targetX - this.mesh.position.x) * 0.15;
        this.mesh.position.y += (targetY - this.mesh.position.y) * 0.15;
        this.mesh.rotation.z = -(targetX - this.mesh.position.x) * 0.15;
        this.mesh.rotation.x = (targetY - this.mesh.position.y) * 0.1;

        playerLight.position.copy(this.mesh.position);
        playerLight.intensity = Math.max(0, playerLight.intensity - delta * 25);

        if (this.shieldTime > 0) {
            this.shieldTime -= delta;
            this.shield.material.opacity = 0.3 + Math.sin(time * 10) * 0.1;
            document.getElementById('icon-shield').classList.add('active');
        } else {
            this.shield.material.opacity = 0;
            document.getElementById('icon-shield').classList.remove('active');
        }

        if (this.hyperTime > 0) {
            this.hyperTime -= delta;
            document.getElementById('icon-hyper').classList.add('active');
        } else {
            document.getElementById('icon-hyper').classList.remove('active');
        }

        const fireRate = this.hyperTime > 0 ? 0.07 : 0.14;
        if ((isTouching || keys[' '] || keys['control']) && time - this.lastFire > fireRate) {
            this.fire();
            this.lastFire = time;
        }
    }

    fire() {
        const count = this.hyperTime > 0 ? 4 : 2;
        for(let i=0; i<count; i++) {
            const offset = (i - (count-1)/2) * 1.2;
            bullets.push(new Projectile(this.mesh.position.clone().add(new THREE.Vector3(offset, 0, 0)), 0x00ffff, -550));
        }
        playerLight.intensity = 8;
    }
}

class Projectile {
    constructor(pos, color, speed) {
        this.mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 5), new THREE.MeshBasicMaterial({ color }));
        this.mesh.position.copy(pos);
        this.speed = speed;
        this.alive = true;
        this.radius = 1.5; // Effective hit radius for faster speed
        scene.add(this.mesh);
    }
    update(delta) {
        this.mesh.position.z += this.speed * delta;
        if (Math.abs(this.mesh.position.z) > 1800) this.die();
    }
    die() { this.alive = false; scene.remove(this.mesh); }
}

class BossShip {
    constructor() {
        this.mesh = new THREE.Group();
        const mat = new THREE.MeshPhongMaterial({ color: 0xef4444, shininess: 50 });
        
        const mainBody = new THREE.Mesh(new THREE.BoxGeometry(18, 5, 12), mat);
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 5), mat);
        bridge.position.y = 3.5; bridge.position.z = -2;
        
        const lSponson = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 8), mat);
        lSponson.position.x = -11;
        const rSponson = lSponson.clone();
        rSponson.position.x = 11;

        this.mesh.add(mainBody, bridge, lSponson, rSponson);
        this.mesh.position.set(0, 0, -600);
        
        this.maxHealth = 60 + (currentLevel * 40);
        this.health = this.maxHealth;
        this.lastFire = 0;
        this.targetZ = -120;
        this.speed = 12 + currentLevel * 6;
        this.active = true;
        
        BOSS_UI.style.display = 'block';
        this.updateUI();
        scene.add(this.mesh);
    }

    update(delta, time) {
        if (this.mesh.position.z < this.targetZ) {
            this.mesh.position.z += 60 * delta;
        } else {
            this.mesh.position.x = Math.sin(time * 0.6) * 25;
            this.mesh.position.y = 6 + Math.cos(time * 0.9) * 6;
            
            if (time - this.lastFire > 1.4 - (currentLevel * 0.1)) {
                this.fire();
                this.lastFire = time;
            }
        }
    }

    fire() {
        enemyBullets.push(new Projectile(this.mesh.position.clone().add(new THREE.Vector3(-11, 0, 0)), 0xff0000, 250));
        enemyBullets.push(new Projectile(this.mesh.position.clone().add(new THREE.Vector3(11, 0, 0)), 0xff0000, 250));
    }

    updateUI() {
        const pct = (this.health / this.maxHealth) * 100;
        BOSS_HEALTH_FILL.style.width = pct + '%';
    }

    die() {
        this.active = false;
        explode(this.mesh.position, 0xef4444, 200);
        scene.remove(this.mesh);
        BOSS_UI.style.display = 'none';
        bossActive = false;
        boss = null;
        currentLevel++;
        LEVEL_EL.textContent = currentLevel;
        score += 3000;
        SCORE_EL.textContent = score.toString().padStart(4, '0');
    }
}

class Obstacle {
    constructor(playerPos) {
        this.mesh = new THREE.Group();
        const type = Math.floor(Math.random() * 3);
        const mat = new THREE.MeshPhongMaterial({ color: 0x444444 });
        
        let geom = type === 0 ? new THREE.IcosahedronGeometry(2.8, 1) : 
                   type === 1 ? new THREE.OctahedronGeometry(3.5, 0) : 
                   new THREE.BoxGeometry(4.5, 4.5, 4.5);
        
        const m = new THREE.Mesh(geom, mat);
        this.mesh.add(m);
        if(type === 1) m.material.color.set(0x7c3aed); 

        this.mesh.position.set(THREE.MathUtils.randFloatSpread(150), THREE.MathUtils.randFloatSpread(120), -1200);
        
        const target = playerPos.clone().add(new THREE.Vector3(THREE.MathUtils.randFloatSpread(25), THREE.MathUtils.randFloatSpread(25), 150));
        const dir = target.sub(this.mesh.position).normalize();
        this.vel = dir.multiplyScalar(BASE_SPEED + (score/18) + (currentLevel * 12));
        this.rot = new THREE.Vector3(Math.random()*0.07, Math.random()*0.07, Math.random()*0.07);
        this.radius = 4.5;
        this.hp = 2 + Math.floor(currentLevel/1.5);
        this.alive = true;
        scene.add(this.mesh);
    }
    update(delta) {
        this.mesh.position.add(this.vel.clone().multiplyScalar(delta));
        this.mesh.rotation.x += this.rot.x;
        this.mesh.rotation.y += this.rot.y;
        if (this.mesh.position.z > 180) this.die();
    }
    die() { this.alive = false; scene.remove(this.mesh); }
}

class PowerUp {
    constructor() {
        this.pType = Math.floor(Math.random() * 3);
        const colors = [0x22c55e, 0x7c3aed, 0xeab308];
        this.mesh = new THREE.Mesh(
            new THREE.TorusGeometry(1.4, 0.4, 8, 20),
            new THREE.MeshBasicMaterial({ color: colors[this.pType] })
        );
        this.mesh.position.set(THREE.MathUtils.randFloatSpread(60), THREE.MathUtils.randFloatSpread(50), -1000);
        this.alive = true;
        scene.add(this.mesh);
    }
    update(delta) {
        this.mesh.position.z += BASE_SPEED * delta;
        this.mesh.rotation.y += delta * 7;
        if (this.mesh.position.z > 120) this.die();
    }
    die() { this.alive = false; scene.remove(this.mesh); }
}

class Particle {
    constructor(pos, color) {
        this.mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7,0.7,0.7), new THREE.MeshBasicMaterial({ color }));
        this.mesh.position.copy(pos);
        this.vel = new THREE.Vector3(THREE.MathUtils.randFloatSpread(60), THREE.MathUtils.randFloatSpread(60), THREE.MathUtils.randFloatSpread(60));
        this.life = 1.0;
        scene.add(this.mesh);
    }
    update(delta) {
        this.mesh.position.add(this.vel.clone().multiplyScalar(delta));
        this.life -= delta * 2.8;
        this.mesh.scale.setScalar(Math.max(0, this.life));
        if (this.life <= 0) scene.remove(this.mesh);
    }
}

// --- GAME CORE LOGIC ---

function startGame() {
    score = 0;
    currentLevel = 1;
    bossActive = false;
    boss = null;
    SCORE_EL.textContent = "0000";
    LEVEL_EL.textContent = "1";
    BOSS_UI.style.display = 'none';
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('game-over-screen').style.display = 'none';
    
    // Cleanup previous entities
    obstacles.forEach(o => scene.remove(o.mesh));
    bullets.forEach(b => scene.remove(b.mesh));
    particles.forEach(p => scene.remove(p.mesh));
    powerups.forEach(p => scene.remove(p.mesh));
    enemyBullets.forEach(b => scene.remove(b.mesh));
    if(boss) scene.remove(boss.mesh);
    
    obstacles = []; bullets = []; particles = []; powerups = []; enemyBullets = [];
    
    // Intensive cleanup of orphans
    const toPurge = [];
    scene.children.forEach(c => {
        if(c.isGroup || (c.isMesh && !nebulae.includes(c) && c !== starsMesh)) {
            toPurge.push(c);
        }
    });
    toPurge.forEach(p => scene.remove(p));

    player = new PlayerShip();
    HEALTH_BAR.style.width = '100%';
    HEALTH_BAR.classList.remove('from-red-600');

    gameActive = true;
    isPaused = false;
    clock.start();
}

function endGame() {
    gameActive = false;
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('galactic_high_prod', highScore);
        HIGH_SCORE_EL.textContent = highScore.toString().padStart(4, '0');
    }
    document.getElementById('final-score').textContent = score;
    document.getElementById('game-over-screen').style.display = 'block';
    explode(player.mesh.position, 0x4f46e5, 100);
    scene.remove(player.mesh);
    if(boss) {
        scene.remove(boss.mesh);
        boss = null;
        BOSS_UI.style.display = 'none';
    }
}

function explode(pos, color, count=40) {
    for(let i=0; i<count; i++) particles.push(new Particle(pos, color));
    shakeIntensity = Math.min(2.5, shakeIntensity + 0.8);
}

function animate() {
    requestAnimationFrame(animate);
    if (!gameActive || isPaused) {
        renderer.render(scene, camera);
        return;
    }

    let delta = clock.getDelta();
    if (delta > 0.1) delta = 0.1;
    const elapsedTime = clock.getElapsedTime();

    player.update(delta, elapsedTime);

    // Spawning Logic
    if (!bossActive) {
        spawnTimer += delta;
        if (spawnTimer > Math.max(0.1, 0.42 - (score/18000))) {
            obstacles.push(new Obstacle(player.mesh.position));
            spawnTimer = 0;
        }
        
        // Trigger Boss
        if (score >= currentLevel * POINTS_PER_LEVEL) {
            bossActive = true;
            boss = new BossShip();
        }
    } else if (boss) {
        boss.update(delta, elapsedTime);
    }

    pUpTimer += delta;
    if (pUpTimer > 12) {
        powerups.push(new PowerUp());
        pUpTimer = 0;
    }

    // Environment Updates
    const starData = starsMesh.geometry.attributes.position.array;
    for (let i = 0; i < starData.length; i += 3) {
        starData[i + 2] += (BASE_SPEED + 300) * delta;
        if (starData[i + 2] > 1000) starData[i + 2] = -3500;
    }
    starsMesh.geometry.attributes.position.needsUpdate = true;
    
    nebulae.forEach(n => {
        n.position.z += BASE_SPEED * delta;
        if(n.position.z > 2000) n.position.z = -2500;
        n.rotation.y += 0.002;
    });

    // Projectile Management
    updateProjectiles(bullets, delta, true);
    updateProjectiles(enemyBullets, delta, false);

    // Powerup Loop
    for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i];
        p.update(delta);
        if (p.mesh.position.distanceTo(player.mesh.position) < 6) {
            if (p.pType === 0) player.health = Math.min(100, player.health + 40);
            if (p.pType === 1) player.shieldTime = 12;
            if (p.pType === 2) player.hyperTime = 10;
            HEALTH_BAR.style.width = player.health + '%';
            p.die();
        }
        if (!p.alive) powerups.splice(i, 1);
    }

    // Obstacle Loop
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        o.update(delta);

        // Obstacle vs Player Projectiles
        for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            // Using combined radius for high-speed collision robustness
            if (o.mesh.position.distanceTo(b.mesh.position) < (o.radius + b.radius)) {
                o.hp--;
                b.die();
                if (o.hp <= 0) {
                    score += 400;
                    SCORE_EL.textContent = score.toString().padStart(4, '0');
                    explode(o.mesh.position, 0xcccccc, 15);
                    o.die();
                }
                break;
            }
        }

        // Obstacle vs Player Ship
        if (o.alive && o.mesh.position.distanceTo(player.mesh.position) < o.radius + 1.8) {
            if (player.shieldTime <= 0) {
                player.health -= 25;
                HEALTH_BAR.style.width = player.health + '%';
                if (player.health < 40) HEALTH_BAR.classList.add('from-red-600');
                if (player.health <= 0) endGame();
            }
            explode(o.mesh.position, 0xff9900, 30);
            o.die();
        }
        if (!o.alive) obstacles.splice(i, 1);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(delta);
        if (particles[i].life <= 0) particles.splice(i, 1);
    }

    // Camera Feedback
    shakeIntensity *= 0.93;
    camera.position.x = (player.mesh.position.x - camera.position.x) * 0.12 + (Math.random()-0.5) * shakeIntensity;
    camera.position.y = (player.mesh.position.y + 7 - camera.position.y) * 0.12 + (Math.random()-0.5) * shakeIntensity;
    camera.lookAt(player.mesh.position.x * 0.1, player.mesh.position.y * 0.1, -100);

    renderer.render(scene, camera);
}

function updateProjectiles(arr, delta, isPlayer) {
    for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i];
        p.update(delta);
        
        if (isPlayer) {
            // Check against Boss
            if (bossActive && boss && p.mesh.position.distanceTo(boss.mesh.position) < 12) {
                boss.health--;
                boss.updateUI();
                explode(p.mesh.position, 0xffffff, 8);
                p.die();
                if(boss.health <= 0) boss.die();
            }
        } else {
            // Check against Player
            if (p.mesh.position.distanceTo(player.mesh.position) < 5) {
                if (player.shieldTime <= 0) {
                    player.health -= 30;
                    HEALTH_BAR.style.width = player.health + '%';
                    if (player.health <= 0) endGame();
                }
                explode(p.mesh.position, 0xff3333, 25);
                p.die();
            }
        }

        if (!p.alive) arr.splice(i, 1);
    }
}

window.onload = () => {
    init();
    animate();
};
