// THE ALIF EFFECT - Stable Final Build (robust start)
const config = {
  type: Phaser.AUTO,
  width: 960,
  height: 540,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
  scene: { preload, create, update },
  plugins: {
    scene: [{ key: 'rexvirtualjoystickplugin', plugin: rexvirtualjoystickplugin, mapping: 'rexVirtualJoystick' }]
  }
};

const game = new Phaser.Game(config);

let player, cursors, bullets, enemies, platforms;
let leftStick, rightStick;
let lastFired = 0, fireRate = 180;
let score = 0, scoreText, leaderboardDiv;
let healthBar;
let isPaused = false, highscore = 0;
let sounds = {};
let started = false;

function preload() {
  this.load.image('bg', 'https://labs.phaser.io/assets/skies/space3.png');
  this.load.image('player', 'https://labs.phaser.io/assets/sprites/phaser-dude.png');
  this.load.image('bullet', 'https://labs.phaser.io/assets/sprites/bullet.png');
  this.load.image('enemy', 'https://labs.phaser.io/assets/sprites/space-baddie.png');
  this.load.image('platform', 'https://labs.phaser.io/assets/sprites/platform.png');

  this.load.audio('shoot', 'https://actions.google.com/sounds/v1/weapons/medium_machine_gun.ogg');
  this.load.audio('enemyDie', 'https://actions.google.com/sounds/v1/cartoon/cartoon_boing.ogg');
}

function create() {
  this.add.image(480, 270, 'bg').setDisplaySize(960, 540);

  bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, runChildUpdate: false });
  enemies = this.physics.add.group();
  platforms = this.physics.add.staticGroup();
  platforms.create(480, 520, 'platform').setScale(3, 0.5).refreshBody();
  platforms.create(200, 360, 'platform').refreshBody();
  platforms.create(760, 240, 'platform').refreshBody();

  sounds.shoot = this.sound.add('shoot', { volume: 0.3 });
  sounds.enemyDie = this.sound.add('enemyDie', { volume: 0.5 });

  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  leaderboardDiv = document.getElementById('leaderboard');
  const restartDiv = document.getElementById('restartDiv');

  const startHandler = () => {
    if (started) return;
    started = true;
    overlay.style.display = 'none';
    pauseBtn.style.display = 'block';
    leaderboardDiv.style.display = 'block';
    // ensure pointer and input are ready
    try { this.input.activePointer; } catch(e) {}
    startGame.call(this);
  };

  // DOM events
  startBtn.addEventListener('click', startHandler);
  startBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startHandler(); });

  // Phaser pointer fallback (click anywhere)
  this.input.on('pointerdown', (pointer) => {
    if (!started) startHandler();
  });

  pauseBtn.addEventListener('click', () => {
    isPaused = !isPaused;
    this.physics.world.isPaused = isPaused;
    pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
  });

  highscore = parseInt(localStorage.getItem('alif_highscore') || '0', 10);
  leaderboardDiv.innerHTML = 'Highscore: ' + highscore;
}

function startGame() {
  const scene = this;
  enemies.clear(true, true);
  bullets.clear(true, true);

  player = this.physics.add.sprite(120, 400, 'player').setScale(0.6).setCollideWorldBounds(true);
  player.health = 100;

  this.cameras.main.startFollow(player);

  this.physics.add.collider(player, platforms);
  this.physics.add.collider(enemies, platforms);
  this.physics.add.overlap(bullets, enemies, onBulletHitEnemy, null, this);
  this.physics.add.overlap(player, enemies, onEnemyHitPlayer, null, this);

  cursors = this.input.keyboard.createCursorKeys();
  this.input.keyboard.addKeys('W,A,S,D');

  // joystick init with guard
  try {
    leftStick = this.rexVirtualJoystick.add(this, {
      x: 80, y: this.scale.height - 80, radius: 50,
      base: this.add.circle(0,0,50,0x888888,0.35),
      thumb: this.add.circle(0,0,25,0xcccccc,0.6)
    });
    rightStick = this.rexVirtualJoystick.add(this, {
      x: this.scale.width - 100, y: this.scale.height - 90, radius: 50,
      base: this.add.circle(0,0,50,0x444444,0.25),
      thumb: this.add.circle(0,0,25,0x999999,0.6)
    });
  } catch(e) {
    leftStick = null; rightStick = null;
    console.warn('Joystick plugin missing', e);
  }

  for (let i=0;i<3;i++) spawnEnemy(this);

  score = 0;
  scoreText = this.add.text(12,12,'Score: 0', { fontSize: '18px', fill: '#fff' }).setScrollFactor(0);
  updateHealthBar(this);
  document.getElementById('leaderboard').innerHTML = 'Highscore: ' + (localStorage.getItem('alif_highscore') || 0);
}

function update(time) {
  if (!player || isPaused) return;
  const speed = 220;
  player.setVelocity(0);

  if (leftStick && leftStick.force > 10) {
    player.setVelocity(leftStick.forceX * speed, leftStick.forceY * speed);
  } else {
    if (this.input.keyboard.addKey('A').isDown || this.input.keyboard.addKey('LEFT').isDown || this.input.keyboard.addKey('ArrowLeft').isDown) {
      player.setVelocityX(-speed);
    } else if (this.input.keyboard.addKey('D').isDown || this.input.keyboard.addKey('RIGHT').isDown || this.input.keyboard.addKey('ArrowRight').isDown) {
      player.setVelocityX(speed);
    }
    if (this.input.keyboard.addKey('W').isDown || this.input.keyboard.addKey('UP').isDown || this.input.keyboard.addKey('ArrowUp').isDown) {
      player.setVelocityY(-speed);
    } else if (this.input.keyboard.addKey('S').isDown || this.input.keyboard.addKey('DOWN').isDown || this.input.keyboard.addKey('ArrowDown').isDown) {
      player.setVelocityY(speed);
    }
  }

  const now = time || this.time.now;
  let fired = false;
  if (rightStick && rightStick.force > 10) {
    if (now - lastFired > fireRate) {
      const tx = player.x + rightStick.forceX * 120;
      const ty = player.y + rightStick.forceY * 120;
      shootFromTo(this, player.x, player.y, tx, ty);
      lastFired = now; fired = true;
    }
  }

  if (!fired && this.input.activePointer.isDown) {
    if (now - lastFired > fireRate) {
      shootFromTo(this, player.x, player.y, this.input.activePointer.worldX, this.input.activePointer.worldY);
      lastFired = now;
    }
  }

  enemies.getChildren().forEach(enemy => {
    if (!enemy.active) return;
    this.physics.moveToObject(enemy, player, 80);
  });

  bullets.getChildren().forEach(b => {
    if (!b.active) return;
    if (b.x < -50 || b.x > this.scale.width + 50 || b.y < -50 || b.y > this.scale.height + 50) {
      try { b.destroy(); } catch(e) {}
    }
  });
}

function shootFromTo(scene, sx, sy, tx, ty) {
  const b = scene.physics.add.image(sx, sy, 'bullet').setScale(0.6);
  b.body.allowGravity = false;
  scene.physics.moveTo(b, tx, ty, 700);
  bullets.add(b);
  if (sounds.shoot) sounds.shoot.play();
  scene.time.delayedCall(3000, () => { try { b.destroy(); } catch(e){} });
}

function onBulletHitEnemy(bullet, enemy) {
  try { bullet.destroy(); } catch(e) {}
  if (!enemy || !enemy.active) return;
  enemy.health -= 10;
  if (enemy.health <= 0) {
    if (sounds.enemyDie) sounds.enemyDie.play();
    try { enemy.destroy(); } catch(e) {}
    score += 10;
    if (scoreText) scoreText.setText('Score: ' + score);
    this.time.delayedCall(2000, () => { spawnEnemy(this); spawnEnemy(this); });
    if (score > highscore) {
      highscore = score;
      localStorage.setItem('alif_highscore', highscore);
      const lb = document.getElementById('leaderboard'); if (lb) lb.innerHTML = 'Highscore: ' + highscore;
    }
  }
}

function onEnemyHitPlayer(playerObj, enemy) {
  if (!player || player.health <= 0) return;
  player.health -= 5;
  updateHealthBar(this);
  if (player.health <= 0) {
    player.setTint(0xff0000);
    this.physics.pause();
    const restartDiv = document.getElementById('restartDiv');
    restartDiv.innerHTML = '<div style="font-size:20px;color:#fff;background:#000;padding:12px;border-radius:8px;cursor:pointer">Game Over - Click to Restart</div>';
    restartDiv.style.display = 'block';
    restartDiv.onclick = () => { location.reload(); };
  }
}

function spawnEnemy(scene) {
  const x = Phaser.Math.Between(50, scene.scale.width - 50);
  const y = Phaser.Math.Between(50, scene.scale.height - 50);
  const enemy = scene.physics.add.sprite(x, y, 'enemy').setScale(0.6).setCollideWorldBounds(true);
  enemy.health = 30;
  enemies.add(enemy);
  enemy.setVelocity(Phaser.Math.Between(-30,30), Phaser.Math.Between(-30,30));
}

function updateHealthBar(scene) {
  if (!player) return;
  if (!healthBar) {
    if (scene && scene.add) healthBar = scene.add.graphics().setScrollFactor(0);
    else return;
  }
  healthBar.clear();
  healthBar.fillStyle(0xff0000);
  healthBar.fillRect(12, 36, Math.max(0, player.health) * 2, 14);
  healthBar.lineStyle(2, 0xffffff);
  healthBar.strokeRect(12, 36, 200, 14);
}
