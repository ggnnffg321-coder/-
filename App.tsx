import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, Point, BikePhysics, BikeConfig, BikeStyle } from './types';
import { Play, Pause, RotateCcw, Home, Map, ArrowRight, ArrowLeft, Lock, ShoppingBag, Zap, Volume2, VolumeX, Coins, Users, FileText, Settings } from 'lucide-react';

// --- Constants ---
const GRAVITY = 0.22;
const ACCELERATION = 0.25;
const NITRO_ACCELERATION = 0.8; 
const BRAKE_FORCE = 0.4;
const FRICTION = 0.96;
const MAX_SPEED = 28;
const MAX_NITRO_SPEED = 60; 
const ROTATION_SPEED = 0.04;
const AIR_ROTATION_BOOST = 2.0; // Increased for easier 360s
const ANGULAR_DAMPING = 0.92;
const WHEEL_BASE = 70;
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

// --- Assets / Color Palette ---
const COLORS = {
  skyTop: '#6E9EFF', 
  skyBottom: '#FFCF96', 
  mountainFar: '#D99276',
  mountainNear: '#A65D57',
  groundTop: '#F4D03F', 
  groundBody: '#C0392B', 
  uiBg: '#4A2328', 
  uiBorder: '#F9E79F', 
  uiButton: '#E6B0AA',
};

// --- Data: Bikes (Unique, No Duplicates) ---
const BIKES: BikeConfig[] = [
  { 
      id: 0, 
      name: 'The Viking', 
      style: BikeStyle.CHOPPER, 
      price: 0, 
      colors: { body: '#C0392B', detail: '#F1C40F', seat: '#111' } 
  },
  { 
      id: 1, 
      name: 'Nana Cruiser', 
      style: BikeStyle.SCOOTER, 
      price: 500, 
      colors: { body: '#1ABC9C', detail: '#ECF0F1', seat: '#D35400' } 
  },
  { 
      id: 2, 
      name: 'Police Interceptor', 
      style: BikeStyle.POLICE, 
      price: 1500, 
      colors: { body: '#2C3E50', detail: '#FFF', seat: '#34495E' } 
  },
  { 
      id: 3, 
      name: 'Pro Racer X', 
      style: BikeStyle.SPORT, 
      price: 3000, 
      colors: { body: '#E74C3C', detail: '#FFF', seat: '#2C3E50' } 
  },
];

const DEVELOPERS = [
    "Ahmed Jalal",
    "Mohamed Jalal",
    "Youssef Ibrahim",
    "Omar Khaled",
    "Ali Hassan",
    "Mostafa Tarek",
    "Mahmoud Adel",
    "Kareem Nabil",
    "Hassan Sameh",
    "Amr Diab"
];

// --- Helper Functions ---

const generateTerrain = (length: number, seed: number): Point[] => {
  const points: Point[] = [];
  const segmentLength = 50;
  const totalSegments = Math.ceil(length / segmentLength);
  
  let currentY = CANVAS_HEIGHT * 0.6;
  
  for (let i = 0; i <= totalSegments; i++) {
    const x = i * segmentLength;
    
    // EXTREME RAMP GENERATION LOGIC
    // We create massive sharp peaks for launching
    const rampFrequency = 0.12;
    const rampHeight = 450; // Taller ramps
    
    // Base rolling hills
    const noise1 = Math.sin((i * 0.1) + seed) * 80;
    
    // Sharp Launch Ramps
    const rampPhase = (i * rampFrequency) + seed * 3;
    // Using a sharper power curve to create "launch" shapes
    const rampRaw = Math.sin(rampPhase);
    const ramp = rampRaw > 0 ? Math.pow(rampRaw, 4) : 0; 
    
    const noise2 = ramp * rampHeight;
    
    let noise = noise1 + noise2;
    
    // Flatten start area
    if (i < 20) noise *= (i / 20); 
    if (i > totalSegments - 20) noise *= ((totalSegments - i) / 20);

    currentY = (CANVAS_HEIGHT * 0.7) - noise;
    
    // Clamp to keep within screen bounds roughly
    if (currentY > CANVAS_HEIGHT - 50) currentY = CANVAS_HEIGHT - 50;
    if (currentY < 100) currentY = 100;

    points.push({ x, y: currentY });
  }
  return points;
};

const getTerrainHeight = (x: number, terrain: Point[]): number => {
  if (x < 0) return terrain[0].y;
  const segmentLength = 50;
  const index = Math.floor(x / segmentLength);
  if (index >= terrain.length - 1) return terrain[terrain.length - 1].y;

  const p1 = terrain[index];
  const p2 = terrain[index + 1];
  const t = (x - p1.x) / segmentLength;
  
  return p1.y + (p2.y - p1.y) * t;
};

// --- Components ---

const Button: React.FC<{ 
  onClick?: () => void; 
  children: React.ReactNode; 
  className?: string;
  onTouchStart?: () => void;
  onTouchEnd?: () => void;
  disabled?: boolean;
}> = ({ onClick, children, className = "", onTouchStart, onTouchEnd, disabled }) => (
  <button 
    className={`bg-[#E6B0AA] border-4 border-[#4A2328] text-[#4A2328] rounded-full p-4 active:scale-95 transition-transform shadow-lg select-none disabled:opacity-50 disabled:grayscale ${className}`}
    onClick={onClick}
    disabled={disabled}
    onTouchStart={onTouchStart}
    onTouchEnd={onTouchEnd}
    onMouseDown={onTouchStart}
    onMouseUp={onTouchEnd}
    onMouseLeave={onTouchEnd}
  >
    {children}
  </button>
);

const App: React.FC = () => {
  // --- Persistent State ---
  const [unlockedLevels, setUnlockedLevels] = useState<number>(1);
  const [coins, setCoins] = useState<number>(0);
  const [ownedBikes, setOwnedBikes] = useState<number[]>([0]);
  const [selectedBikeId, setSelectedBikeId] = useState<number>(0);

  // --- Game State ---
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [currentLevel, setCurrentLevel] = useState<number>(1);
  const [time, setTime] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  
  // Physics State
  const bikeRef = useRef<BikePhysics>({ x: 100, y: 0, velocity: 0, angle: 0, angularVelocity: 0, lean: 0 });
  const inputsRef = useRef({ throttle: false, brake: false, left: false, right: false, nitro: false });
  const terrainRef = useRef<Point[]>([]);
  const requestRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load Data on Mount
  useEffect(() => {
    const savedData = localStorage.getItem('jalalBikerData_v3');
    if (savedData) {
        try {
            const parsed = JSON.parse(savedData);
            setUnlockedLevels(parsed.unlockedLevels || 1);
            setCoins(parsed.coins || 0);
            setOwnedBikes(parsed.ownedBikes || [0]);
            setSelectedBikeId(parsed.selectedBikeId || 0);
        } catch (e) {
            console.error("Failed to load save", e);
        }
    }
    
    // Setup Audio
    const audio = new Audio("https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112591.mp3");
    audio.loop = true;
    audio.volume = 0.3;
    audioRef.current = audio;

    return () => {
        if(audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
    }
  }, []);

  // Save Data helper
  const saveData = (newLevel: number, newCoins: number, newBikes: number[], newSelected: number) => {
    const data = {
        unlockedLevels: newLevel,
        coins: newCoins,
        ownedBikes: newBikes,
        selectedBikeId: newSelected
    };
    localStorage.setItem('jalalBikerData_v3', JSON.stringify(data));
    setUnlockedLevels(newLevel);
    setCoins(newCoins);
    setOwnedBikes(newBikes);
    setSelectedBikeId(newSelected);
  };

  // Toggle Music
  const toggleAudio = () => {
      if (!audioRef.current) return;
      if (isMuted) {
          audioRef.current.play().catch(e => console.log("Audio play failed", e));
          setIsMuted(false);
      } else {
          audioRef.current.pause();
          setIsMuted(true);
      }
  };

  // Initialize Level
  const startLevel = useCallback((levelId: number) => {
    if (levelId > unlockedLevels) return; // Anti-cheat

    const seed = levelId * 999;
    const length = 4000 + (levelId * 1500); 
    terrainRef.current = generateTerrain(length, seed);
    
    bikeRef.current = {
      x: 100,
      y: getTerrainHeight(100, terrainRef.current),
      velocity: 0,
      angle: 0,
      angularVelocity: 0,
      lean: 0
    };
    
    inputsRef.current = { throttle: false, brake: false, left: false, right: false, nitro: false };
    setTime(0);
    startTimeRef.current = Date.now();
    setCurrentLevel(levelId);
    setGameState(GameState.PLAYING);

    if (!isMuted && audioRef.current && audioRef.current.paused) {
        audioRef.current.play().catch(e => console.log("Auto play prevented", e));
    }
  }, [unlockedLevels, isMuted]);

  // Main Game Loop
  const gameLoop = useCallback(() => {
    if (gameState !== GameState.PLAYING) return;

    const bike = bikeRef.current;
    const terrain = terrainRef.current;
    const inputs = inputsRef.current;

    // 1. Terrain Interaction
    const rearX = bike.x;
    const frontX = bike.x + (Math.cos(bike.angle) * WHEEL_BASE);
    
    const groundRearY = getTerrainHeight(rearX, terrain);
    const groundFrontY = getTerrainHeight(frontX, terrain);
    
    // Check if airborne (distance from ground > threshold)
    const isAirborne = Math.abs(bike.y - groundRearY) > 15;

    const targetAngle = Math.atan2(groundFrontY - groundRearY, frontX - rearX);
    
    // 2. Physics Update
    bike.velocity += Math.sin(bike.angle) * GRAVITY;
    
    // Normal Throttle
    if (inputs.throttle) bike.velocity += ACCELERATION;
    
    // NITRO
    const currentMaxSpeed = inputs.nitro ? MAX_NITRO_SPEED : MAX_SPEED;
    if (inputs.nitro) {
        bike.velocity += NITRO_ACCELERATION;
        if (isAirborne) {
             bike.angularVelocity -= 0.03; // Auto flip with nitro in air
        }
    }

    if (inputs.brake) bike.velocity -= BRAKE_FORCE;
    bike.velocity *= FRICTION;
    
    if (bike.velocity > currentMaxSpeed) bike.velocity = currentMaxSpeed;
    if (bike.velocity < -MAX_SPEED) bike.velocity = -MAX_SPEED;

    bike.x += Math.cos(bike.angle) * bike.velocity;
    
    // Y Position / Gravity Logic
    if (!isAirborne && bike.y > groundRearY - 5) {
         bike.y = groundRearY;
    } else {
        bike.y = groundRearY; // In this 2.5D projection, Y follows terrain curve for simplicity
    }

    // Angular Physics
    const angleDiff = targetAngle - bike.angle;
    
    // Stability logic
    const stability = inputs.nitro ? 0.05 : 0.15;
    bike.angularVelocity += angleDiff * stability;
    
    // Rotation Controls
    let rotationForce = ROTATION_SPEED;
    
    // *** SUPER SPIN IN AIR ***
    // If angle difference is large (jumping off a ramp), boost rotation significantly
    if (Math.abs(angleDiff) > 0.4) {
         rotationForce *= AIR_ROTATION_BOOST;
    }
    
    if (inputs.left) bike.angularVelocity -= rotationForce; 
    if (inputs.right) bike.angularVelocity += rotationForce; 
    
    bike.angularVelocity *= ANGULAR_DAMPING;
    bike.angle += bike.angularVelocity;

    // 3. Crash Detection
    const normalizedAngle = Math.abs(bike.angle % (Math.PI * 2));
    // Head collision window
    if (normalizedAngle > Math.PI / 1.8 && normalizedAngle < Math.PI * 1.5) {
       setGameState(GameState.CRASHED);
    }

    // 4. Win Detection
    const finishLine = terrain[terrain.length - 20].x;
    if (bike.x >= finishLine) {
        const reward = 50 + (currentLevel * 25);
        const nextLevel = Math.max(unlockedLevels, currentLevel + 1);
        saveData(nextLevel, coins + reward, ownedBikes, selectedBikeId);
        setGameState(GameState.WON);
    }

    setTime((Date.now() - startTimeRef.current) / 1000);
    drawFrame(bike, currentLevel);
    requestRef.current = requestAnimationFrame(gameLoop);
  }, [gameState, coins, unlockedLevels, ownedBikes, selectedBikeId]);

  // --- DRAWING FUNCTIONS ---

  const drawWheel = (ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, color: string, speed: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(speed * 0.05);
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#333';
    ctx.stroke();
    // Rim
    ctx.beginPath();
    ctx.arc(0, 0, rad * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = '#444';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    // Spokes
    ctx.beginPath();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    for(let i=0; i<6; i++) {
        ctx.moveTo(0,0);
        ctx.lineTo(Math.cos(i)*rad*0.6, Math.sin(i)*rad*0.6);
    }
    ctx.stroke();
    ctx.restore();
  };

  const drawChopper = (ctx: CanvasRenderingContext2D, bikeConfig: BikeConfig, nitro: boolean) => {
      const { body, detail, seat } = bikeConfig.colors;
      drawWheel(ctx, -35, 0, 22, detail, Date.now());
      drawWheel(ctx, 45, 0, 22, detail, Date.now());

      // Frame
      ctx.beginPath(); ctx.moveTo(45, 0); ctx.lineTo(10, -50); 
      ctx.lineWidth = 4; ctx.strokeStyle = '#BDC3C7'; ctx.stroke(); // Forks

      ctx.beginPath(); ctx.moveTo(-35, 0); ctx.lineTo(-10, -20); ctx.lineTo(10, -45); ctx.lineTo(-20, -10);
      ctx.fillStyle = '#222'; ctx.fill(); // Chassis

      ctx.beginPath(); ctx.moveTo(12, -48); ctx.quadraticCurveTo(0, -60, -20, -35); ctx.lineTo(8, -35);
      ctx.fillStyle = body; ctx.fill(); // Tank

      ctx.beginPath(); ctx.moveTo(-15, -35); ctx.quadraticCurveTo(-25, -35, -35, -45); ctx.lineTo(-15, -35);
      ctx.lineWidth = 6; ctx.strokeStyle = seat; ctx.stroke(); // Seat

      // Rider (Viking)
      ctx.beginPath(); ctx.moveTo(-15, -35); ctx.lineTo(-5, -25); ctx.lineTo(0, -10);
      ctx.lineWidth = 5; ctx.strokeStyle = '#2980B9'; ctx.stroke(); // Leg
      ctx.beginPath(); ctx.moveTo(-15, -35); ctx.lineTo(-20, -65);
      ctx.lineWidth = 9; ctx.strokeStyle = '#2C3E50'; ctx.stroke(); // Body
      ctx.beginPath(); ctx.moveTo(-20, -60); ctx.lineTo(5, -65);
      ctx.lineWidth = 4; ctx.strokeStyle = '#F5CBA7'; ctx.stroke(); // Arms

      // Head
      ctx.fillStyle = '#F5CBA7'; ctx.beginPath(); ctx.arc(-20, -75, 7, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#5D4037'; ctx.beginPath(); ctx.arc(-20, -75, 7, 0, Math.PI); ctx.fill(); // Beard
      ctx.fillStyle = '#95A5A6'; ctx.beginPath(); ctx.arc(-20, -77, 8, Math.PI, 0); ctx.fill(); // Helmet
      // Horns
      ctx.fillStyle = '#ECF0F1'; 
      ctx.beginPath(); ctx.moveTo(-26, -80); ctx.lineTo(-32, -90); ctx.lineTo(-24, -83); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-14, -80); ctx.lineTo(-8, -90); ctx.lineTo(-16, -83); ctx.fill();
      
      if (nitro) {
          ctx.beginPath(); ctx.moveTo(-45, -5); ctx.lineTo(-80, -10); ctx.lineTo(-45, 0);
          ctx.fillStyle = '#00BFFF'; ctx.fill();
      }
  };

  const drawSport = (ctx: CanvasRenderingContext2D, bikeConfig: BikeConfig, nitro: boolean) => {
      const { body, detail, seat } = bikeConfig.colors;
      drawWheel(ctx, -30, 0, 20, detail, Date.now());
      drawWheel(ctx, 30, 0, 20, detail, Date.now());

      ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(15, -35); ctx.lineTo(-15, -35); ctx.lineTo(-30, 0);
      ctx.fillStyle = body; ctx.fill();
      
      ctx.beginPath(); ctx.moveTo(15, -35); ctx.lineTo(25, -50); ctx.lineTo(10, -35);
      ctx.fillStyle = '#3498DB'; ctx.fill();

      // Rider
      ctx.beginPath(); ctx.moveTo(-10, -35); ctx.lineTo(-5, -20); ctx.lineTo(5, -10);
      ctx.lineWidth = 5; ctx.strokeStyle = '#222'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10, -35); ctx.lineTo(5, -55);
      ctx.lineWidth = 8; ctx.strokeStyle = detail; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(5, -50); ctx.lineTo(20, -40);
      ctx.lineWidth = 4; ctx.strokeStyle = '#222'; ctx.stroke();

      ctx.fillStyle = seat; ctx.beginPath(); ctx.arc(5, -60, 8, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.fillRect(5, -62, 6, 4);

      if (nitro) {
          ctx.beginPath(); ctx.moveTo(-30, -10); ctx.lineTo(-60, -15); ctx.lineTo(-30, -5);
          ctx.fillStyle = '#E74C3C'; ctx.fill();
      }
  };

  const drawPolice = (ctx: CanvasRenderingContext2D, bikeConfig: BikeConfig, nitro: boolean) => {
      const { body, detail } = bikeConfig.colors;
      drawWheel(ctx, -35, 0, 22, '#ECF0F1', Date.now());
      drawWheel(ctx, 40, 0, 22, '#ECF0F1', Date.now());

      ctx.fillStyle = body; ctx.fillRect(-25, -30, 50, 20);
      ctx.fillStyle = '#2C3E50'; ctx.fillRect(-35, -20, 20, 15);

      const blink = Math.floor(Date.now() / 200) % 2 === 0;
      ctx.fillStyle = blink ? '#E74C3C' : '#3498DB';
      ctx.fillRect(-35, -35, 5, 10);

      // Rider
      ctx.beginPath(); ctx.moveTo(-10, -30); ctx.lineTo(-5, -15); ctx.lineTo(5, -5);
      ctx.lineWidth = 5; ctx.strokeStyle = '#2C3E50'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10, -30); ctx.lineTo(-5, -60);
      ctx.lineWidth = 9; ctx.strokeStyle = '#3498DB'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-5, -55); ctx.lineTo(20, -45);
      ctx.lineWidth = 4; ctx.strokeStyle = '#F5CBA7'; ctx.stroke();

      ctx.fillStyle = '#F5CBA7'; ctx.beginPath(); ctx.arc(-5, -65, 7, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#2C3E50'; ctx.fillRect(-12, -72, 14, 5);
      ctx.beginPath(); ctx.arc(-5, -72, 8, Math.PI, 0); ctx.fill();

      if (nitro) {
          ctx.beginPath(); ctx.moveTo(-35, -10); ctx.lineTo(-70, -10); ctx.lineTo(-35, -5);
          ctx.fillStyle = '#3498DB'; ctx.fill();
      }
  };

  const drawScooter = (ctx: CanvasRenderingContext2D, bikeConfig: BikeConfig, nitro: boolean) => {
      const { body, seat } = bikeConfig.colors;
      drawWheel(ctx, -25, 10, 12, '#FFF', Date.now());
      drawWheel(ctx, 25, 10, 12, '#FFF', Date.now());

      ctx.beginPath(); ctx.moveTo(25, 10); ctx.quadraticCurveTo(20, -30, 0, -30); ctx.lineTo(-25, -10);
      ctx.fillStyle = body; ctx.fill();
      ctx.fillStyle = seat; ctx.fillRect(-15, -32, 20, 5);

      // Rider
      ctx.beginPath(); ctx.moveTo(-5, -30); ctx.lineTo(0, -15); ctx.lineTo(5, 0);
      ctx.lineWidth = 4; ctx.strokeStyle = '#E91E63'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-5, -30); ctx.lineTo(-10, -55);
      ctx.lineWidth = 8; ctx.strokeStyle = '#F1948A'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10, -50); ctx.lineTo(15, -45);
      ctx.lineWidth = 3; ctx.strokeStyle = '#F5CBA7'; ctx.stroke();

      ctx.fillStyle = '#F5CBA7'; ctx.beginPath(); ctx.arc(-10, -60, 6, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.strokeRect(-8, -62, 6, 2);
      ctx.fillStyle = '#BDC3C7'; ctx.beginPath(); ctx.arc(-12, -63, 7, 0, Math.PI*2); ctx.fill();

      if (nitro) {
          ctx.beginPath(); ctx.moveTo(-25, -5); ctx.lineTo(-40, 0); ctx.lineTo(-25, 5);
          ctx.fillStyle = '#E91E63'; ctx.fill();
      }
  };

  const drawFrame = (bikeOverride?: BikePhysics, levelOverride?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bike = bikeOverride || bikeRef.current;
    const isPreview = !levelOverride && !bikeOverride;

    const width = CANVAS_WIDTH;
    const height = CANVAS_HEIGHT;
    canvas.width = width;
    canvas.height = height;

    if (!isPreview) {
        // --- GAME MODE ---
        const cameraX = bike.x - width * 0.3;
        
        ctx.save();
        ctx.translate(-cameraX, 0); 

        // Background
        const gradient = ctx.createLinearGradient(cameraX, 0, cameraX, height);
        gradient.addColorStop(0, COLORS.skyTop);
        gradient.addColorStop(1, COLORS.skyBottom);
        ctx.fillStyle = gradient;
        ctx.fillRect(cameraX, 0, width, height);

        // Terrain
        ctx.fillStyle = COLORS.mountainFar;
        ctx.beginPath();
        ctx.moveTo(cameraX, height);
        for (let i = 0; i <= width; i+=100) {
            const mx = cameraX + i;
            const my = height * 0.5 - Math.sin((mx + cameraX * 0.5) * 0.002) * 200;
            ctx.lineTo(mx, my);
        }
        ctx.lineTo(cameraX + width, height);
        ctx.fill();

        ctx.fillStyle = COLORS.groundBody;
        ctx.beginPath();
        const terrain = terrainRef.current;
        const startIndex = Math.max(0, Math.floor(cameraX / 50));
        const endIndex = Math.min(terrain.length - 1, Math.ceil((cameraX + width) / 50));
        
        if (terrain.length > 0) {
            ctx.moveTo(terrain[startIndex].x, height);
            ctx.lineTo(terrain[startIndex].x, terrain[startIndex].y);
            for (let i = startIndex; i <= endIndex; i++) {
                ctx.lineTo(terrain[i].x, terrain[i].y);
            }
            ctx.lineTo(terrain[endIndex].x, height);
            ctx.closePath();
            ctx.fill();

            // Top Strip
            ctx.strokeStyle = COLORS.groundTop;
            ctx.lineWidth = 20;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            for (let i = startIndex; i <= endIndex; i++) {
                if(i === startIndex) ctx.moveTo(terrain[i].x, terrain[i].y);
                else ctx.lineTo(terrain[i].x, terrain[i].y);
            }
            ctx.stroke();

            // Finish Line
            const finishLineX = terrain[terrain.length - 20].x;
            const finishLineY = terrain[terrain.length - 20].y;
            ctx.save();
            ctx.translate(finishLineX, finishLineY);
            ctx.fillStyle = 'white';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(0, -150); ctx.stroke();
            for(let r=0; r<4; r++) {
                for(let c=0; c<4; c++) {
                    ctx.fillStyle = (r+c)%2===0 ? 'black' : 'white';
                    ctx.fillRect(c*20, -150 + (r*20), 20, 20);
                }
            }
            ctx.restore();
        }

        ctx.translate(bike.x, bike.y);
        ctx.rotate(bike.angle);
        const scale = 1.3;
        ctx.scale(scale, scale);
    } else {
        // --- PREVIEW MODE (SHOP) ---
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#2C3E50');
        gradient.addColorStop(1, '#000000');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        
        // Spotlight effect
        ctx.beginPath();
        ctx.ellipse(width/2, height/2 + 200, 400, 100, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fill();
        
        ctx.translate(width/2, height/2);
        ctx.scale(3, 3);
    }

    const config = BIKES.find(b => b.id === (isPreview ? selectedBikeId : selectedBikeId)) || BIKES[0];
    const isNitro = inputsRef.current.nitro;

    switch(config.style) {
        case BikeStyle.SPORT: drawSport(ctx, config, isNitro); break;
        case BikeStyle.POLICE: drawPolice(ctx, config, isNitro); break;
        case BikeStyle.SCOOTER: drawScooter(ctx, config, isNitro); break;
        case BikeStyle.CHOPPER: default: drawChopper(ctx, config, isNitro); break;
    }

    ctx.restore();
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(() => gameLoop());
    return () => cancelAnimationFrame(requestRef.current!);
  }, [gameLoop]);

  const handleInput = (type: 'throttle' | 'brake' | 'left' | 'right' | 'nitro', active: boolean) => {
    inputsRef.current[type] = active;
  };
  
  // Keyboard Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'ArrowUp' || e.key === 'w') inputsRef.current.throttle = true;
        if (e.key === 'ArrowDown' || e.key === 's') inputsRef.current.brake = true;
        if (e.key === 'ArrowLeft' || e.key === 'a') inputsRef.current.left = true;
        if (e.key === 'ArrowRight' || e.key === 'd') inputsRef.current.right = true;
        if (e.key === 'Shift' || e.key === ' ') inputsRef.current.nitro = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'ArrowUp' || e.key === 'w') inputsRef.current.throttle = false;
        if (e.key === 'ArrowDown' || e.key === 's') inputsRef.current.brake = false;
        if (e.key === 'ArrowLeft' || e.key === 'a') inputsRef.current.left = false;
        if (e.key === 'ArrowRight' || e.key === 'd') inputsRef.current.right = false;
        if (e.key === 'Shift' || e.key === ' ') inputsRef.current.nitro = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const buyBike = (id: number, price: number) => {
      if (coins >= price && !ownedBikes.includes(id)) {
          saveData(unlockedLevels, coins - price, [...ownedBikes, id], id);
      }
  };

  const selectBike = (id: number) => {
      if (ownedBikes.includes(id)) {
          saveData(unlockedLevels, coins, ownedBikes, id);
      }
  };

  // --- UI Screens ---

  const renderMainMenu = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-blue-400 via-orange-300 to-orange-500">
      <div className="absolute top-4 right-4 flex gap-4">
          <Button onClick={toggleAudio} className="w-12 h-12 p-2">
            {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </Button>
      </div>

      <div className="bg-[#4A2328] text-[#F9E79F] p-8 rounded-3xl border-8 border-[#F9E79F] shadow-2xl transform rotate-1 text-center max-w-lg w-full">
        <h1 className="text-6xl font-black mb-4 tracking-tighter drop-shadow-lg" style={{ fontFamily: 'Russo One' }}>
          BIKER LANE
        </h1>
        <div className="w-full h-2 bg-[#F9E79F] my-6 rounded-full"></div>
        
        <div className="bg-[#3a1a1e] rounded-xl p-2 mb-6 flex items-center justify-center gap-2">
            <Coins className="text-yellow-400" />
            <span className="text-2xl font-bold">{coins}</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
           <button 
             onClick={() => {
                 setGameState(GameState.LEVEL_SELECT);
                 if (!isMuted && audioRef.current) audioRef.current.play().catch(()=>{});
             }}
             className="col-span-2 bg-[#E6B0AA] border-4 border-[#F9E79F] text-[#4A2328] text-2xl font-bold py-4 rounded-xl hover:scale-105 transition-transform shadow-lg flex items-center justify-center gap-2"
           >
             <Play size={24} /> PLAY
           </button>
           <button 
             onClick={() => setGameState(GameState.SHOP)}
             className="bg-[#3498DB] border-4 border-[#2980B9] text-white text-lg font-bold py-3 rounded-xl hover:scale-105 transition-transform shadow-lg flex flex-col items-center justify-center gap-1"
           >
             <ShoppingBag size={24} /> المتجر
           </button>
           <button 
             onClick={() => setGameState(GameState.CREDITS)}
             className="bg-[#2ECC71] border-4 border-[#27AE60] text-white text-lg font-bold py-3 rounded-xl hover:scale-105 transition-transform shadow-lg flex flex-col items-center justify-center gap-1"
           >
             <Users size={24} /> المطورين
           </button>
           <button 
             onClick={() => setGameState(GameState.POLICY)}
             className="col-span-2 bg-[#9B59B6] border-4 border-[#8E44AD] text-white text-lg font-bold py-3 rounded-xl hover:scale-105 transition-transform shadow-lg flex items-center justify-center gap-2"
           >
             <FileText size={24} /> سياسة اللعبة
           </button>
        </div>
      </div>
    </div>
  );

  const renderCredits = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-50 animate-in fade-in duration-300">
        <div className="bg-[#4A2328] w-full max-w-lg p-6 rounded-3xl border-4 border-[#F9E79F]">
           <div className="flex justify-between items-center mb-6">
               <button onClick={() => setGameState(GameState.MENU)} className="bg-[#E6B0AA] p-2 rounded-lg border-2 border-[#F9E79F]">
                   <ArrowLeft size={32} color="#4A2328" />
               </button>
               <h2 className="text-3xl text-[#F9E79F] font-black arabic-text">المطورين</h2>
               <div className="w-12"></div>
           </div>
           
           <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
               {DEVELOPERS.map((dev, i) => (
                   <div key={i} className="bg-[#3a1a1e] p-3 rounded-lg border border-[#A65D57] flex items-center gap-3">
                       <div className="bg-[#F9E79F] w-10 h-10 rounded-full flex items-center justify-center text-[#4A2328] font-bold">
                           {i + 1}
                       </div>
                       <span className="text-white text-xl font-bold arabic-text">{dev}</span>
                   </div>
               ))}
           </div>
        </div>
    </div>
  );

  const renderPolicy = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-50 animate-in fade-in duration-300">
        <div className="bg-[#4A2328] w-full max-w-2xl p-6 rounded-3xl border-4 border-[#F9E79F]">
           <div className="flex justify-between items-center mb-6">
               <button onClick={() => setGameState(GameState.MENU)} className="bg-[#E6B0AA] p-2 rounded-lg border-2 border-[#F9E79F]">
                   <ArrowLeft size={32} color="#4A2328" />
               </button>
               <h2 className="text-3xl text-[#F9E79F] font-black arabic-text">سياسة اللعبة</h2>
               <div className="w-12"></div>
           </div>
           
           <div className="bg-[#3a1a1e] p-6 rounded-xl border border-[#A65D57] text-white text-right leading-relaxed h-[60vh] overflow-y-auto arabic-text custom-scrollbar">
               <h3 className="text-[#F9E79F] text-xl font-bold mb-2">شروط الاستخدام</h3>
               <p className="mb-4 text-gray-300">
                   مرحباً بكم في لعبة Biker Lane. باستخدامك لهذه اللعبة، فإنك توافق على شروط الاستخدام هذه. اللعبة مخصصة لأغراض الترفيه فقط.
               </p>
               
               <h3 className="text-[#F9E79F] text-xl font-bold mb-2">سياسة الخصوصية</h3>
               <p className="mb-4 text-gray-300">
                   نحن نحترم خصوصيتك. هذه اللعبة لا تقوم بجمع أو تخزين أي بيانات شخصية أو معلومات حساسة من جهازك. يتم حفظ تقدم اللعبة محلياً على جهازك فقط.
               </p>

               <h3 className="text-[#F9E79F] text-xl font-bold mb-2">حقوق الملكية</h3>
               <p className="mb-4 text-gray-300">
                   جميع الحقوق محفوظة للمطورين. يمنع نسخ أو تعديل أو إعادة توزيع اللعبة دون إذن مسبق.
               </p>
           </div>
        </div>
    </div>
  );

  const renderShop = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm z-50">
       <div className="bg-[#4A2328] w-full max-w-6xl h-[90vh] p-6 rounded-3xl border-4 border-[#F9E79F] flex flex-col lg:flex-row gap-6">
           
           {/* LEFT: Preview */}
           <div className="lg:w-1/2 flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <button onClick={() => setGameState(GameState.MENU)} className="bg-[#E6B0AA] p-2 rounded-lg border-2 border-[#F9E79F]">
                        <ArrowLeft size={32} color="#4A2328" />
                    </button>
                    <div className="bg-[#3a1a1e] px-4 py-2 rounded-lg border border-[#F9E79F] flex items-center gap-2">
                        <Coins className="text-yellow-400" />
                        <span className="text-[#F9E79F] text-2xl font-bold">{coins}</span>
                    </div>
                </div>
                
                <div className="flex-1 bg-black rounded-2xl border-4 border-[#F9E79F] overflow-hidden relative shadow-inner">
                    {/* Live Preview of Selected Bike */}
                     <canvas 
                        ref={(canvas) => {
                            if(canvas) {
                                const ctx = canvas.getContext('2d');
                                if(ctx) {
                                    canvas.width = canvas.offsetWidth;
                                    canvas.height = canvas.offsetHeight;
                                    const config = BIKES.find(b => b.id === selectedBikeId) || BIKES[0];
                                    
                                    // Draw Simple Preview
                                    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
                                    gradient.addColorStop(0, '#2C3E50');
                                    gradient.addColorStop(1, '#111');
                                    ctx.fillStyle = gradient;
                                    ctx.fillRect(0,0, canvas.width, canvas.height);
                                    
                                    ctx.save();
                                    ctx.translate(canvas.width/2, canvas.height/2);
                                    ctx.scale(3,3);
                                    
                                    if(config.style === BikeStyle.SPORT) drawSport(ctx, config, false);
                                    else if(config.style === BikeStyle.POLICE) drawPolice(ctx, config, false);
                                    else if(config.style === BikeStyle.SCOOTER) drawScooter(ctx, config, false);
                                    else drawChopper(ctx, config, false);
                                    
                                    ctx.restore();
                                }
                            }
                        }} 
                        className="w-full h-full"
                     />
                     <div className="absolute bottom-4 left-0 right-0 text-center">
                         <h3 className="text-4xl text-white font-black drop-shadow-lg">
                             {BIKES.find(b => b.id === selectedBikeId)?.name}
                         </h3>
                     </div>
                </div>
           </div>

           {/* RIGHT: List */}
           <div className="lg:w-1/2 flex flex-col bg-[#3a1a1e] rounded-2xl border-4 border-[#A65D57] p-4 overflow-hidden">
                <h2 className="text-4xl text-[#F9E79F] font-black arabic-text text-center mb-4">الدراجات النارية</h2>
                
                <div className="grid grid-cols-2 gap-4 overflow-y-auto custom-scrollbar p-2">
                    {BIKES.map((bike) => {
                        const owned = ownedBikes.includes(bike.id);
                        const selected = selectedBikeId === bike.id;
                        
                        return (
                        <button 
                            key={bike.id}
                            onClick={() => owned ? selectBike(bike.id) : buyBike(bike.id, bike.price)}
                            disabled={!owned && coins < bike.price}
                            className={`relative aspect-square rounded-xl p-2 border-4 transition-all flex flex-col items-center justify-between group 
                                ${selected ? 'border-[#2ECC71] bg-[#1a1a1a]' : 'border-[#E6B0AA] bg-[#4A2328] hover:bg-[#5d3237]'}
                                ${!owned && coins < bike.price ? 'opacity-50 grayscale' : ''}
                            `}
                        >
                            <div className="text-[#F9E79F] font-bold text-center text-sm">{bike.name}</div>
                            
                            <div className="text-5xl my-2 transform group-hover:scale-110 transition-transform">
                                {bike.style === BikeStyle.POLICE && '👮'}
                                {bike.style === BikeStyle.SCOOTER && '👵'}
                                {bike.style === BikeStyle.SPORT && '🏍️'}
                                {bike.style === BikeStyle.CHOPPER && '🛵'}
                            </div>
                            
                            {owned ? (
                                <div className={`w-full py-1 rounded text-xs font-bold ${selected ? 'bg-[#2ECC71] text-white' : 'bg-[#E6B0AA] text-[#4A2328]'}`}>
                                    {selected ? 'EQUIPPED' : 'OWNED'}
                                </div>
                            ) : (
                                <div className="w-full bg-[#F1C40F] py-1 rounded text-[#4A2328] font-bold flex items-center justify-center gap-1">
                                    <Coins size={12}/> {bike.price}
                                </div>
                            )}
                        </button>
                    )})}
                </div>
           </div>
       </div>
    </div>
  );

  const renderLevelSelect = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-50">
       <div className="bg-[#4A2328] w-full max-w-2xl p-6 rounded-3xl border-4 border-[#F9E79F]">
           <div className="flex justify-between items-center mb-8">
               <button onClick={() => setGameState(GameState.MENU)} className="bg-[#E6B0AA] p-2 rounded-lg border-2 border-[#F9E79F]">
                   <ArrowLeft size={32} color="#4A2328" />
               </button>
               <h2 className="text-4xl text-[#F9E79F] font-black">SELECT LEVEL</h2>
               <div className="w-12"></div>
           </div>
           
           <div className="grid grid-cols-4 gap-4">
               {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((lvl) => {
                   const locked = lvl > unlockedLevels;
                   return (
                   <button 
                    key={lvl}
                    disabled={locked}
                    onClick={() => startLevel(lvl)}
                    className={`aspect-square rounded-xl flex items-center justify-center border-4 transition-all group relative overflow-hidden ${locked ? 'bg-[#2c1518] border-[#5d3237] cursor-not-allowed' : 'bg-[#F9E79F] border-[#E6B0AA] hover:scale-105'}`}
                   >
                       {locked && <Lock className="absolute opacity-50 text-[#F9E79F]" size={40} />}
                       <span className={`text-4xl font-black ${locked ? 'opacity-20 text-[#E6B0AA]' : 'text-[#4A2328]'}`}>{lvl}</span>
                   </button>
               )})}
           </div>
       </div>
    </div>
  );

  const renderWinScreen = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-50 backdrop-blur-md animate-in fade-in zoom-in duration-300">
      <div className="bg-[#4A2328] border-8 border-[#F9E79F] p-8 rounded-[3rem] text-center shadow-[0_0_50px_rgba(255,200,100,0.5)] relative overflow-visible max-w-md w-full">
         
         <div className="absolute top-10 -left-16 w-16 h-32 bg-[#F9E79F] -skew-y-12 rounded-l-full border-4 border-[#4A2328] shadow-lg"></div>
         <div className="absolute top-10 -right-16 w-16 h-32 bg-[#F9E79F] skew-y-12 rounded-r-full border-4 border-[#4A2328] shadow-lg"></div>

         <h2 className="text-5xl text-[#F9E79F] font-black mb-2 uppercase tracking-widest drop-shadow-md">YOU WIN</h2>
         
         <div className="flex justify-center space-x-2 my-4">
             {[1, 2, 3].map(s => <div key={s} className="text-6xl text-yellow-400 drop-shadow-lg">★</div>)}
         </div>

         <div className="bg-[#3a1a1e] rounded-xl p-4 mb-6 border-2 border-[#A65D57]">
             <p className="text-[#E6B0AA] text-lg font-bold">Time: {time.toFixed(2)}s</p>
             <p className="text-[#2ECC71] text-lg font-bold mt-1 flex justify-center items-center gap-1">
                 + {50 + currentLevel * 25} <Coins size={16} />
             </p>

             <div className="mt-4 pt-4 border-t-2 border-[#A65D57] flex flex-col items-center">
                {currentLevel === 1 ? (
                    <>
                        <p className="text-[#F9E79F] text-xl font-bold arabic-text mb-2">مبروك لتعديه الليفل الاول</p>
                        <h1 className="text-4xl text-white font-bold my-2 arabic-text drop-shadow-[0_4px_0_#000] z-10 relative">
                            احمد جلال محمد جلال
                        </h1>
                    </>
                ) : (
                    <>
                        <p className="text-[#F9E79F] text-xl font-bold arabic-text mb-2">البطل</p>
                        <h1 className="text-6xl text-white font-bold my-2 arabic-text drop-shadow-[0_4px_0_#000] z-10 relative">
                            جلال
                        </h1>
                    </>
                )}
             </div>
         </div>

         <div className="flex justify-center space-x-4">
            <Button onClick={() => setGameState(GameState.MENU)}><Home size={32} /></Button>
            <Button onClick={() => startLevel(currentLevel)}><RotateCcw size={32} /></Button>
            <Button onClick={() => startLevel(currentLevel + 1)}><ArrowRight size={32} /></Button>
         </div>
      </div>
    </div>
  );
  
  const renderCrashScreen = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-50 backdrop-blur-sm animate-in zoom-in duration-200">
      <div className="bg-[#4A2328] border-8 border-red-600 p-10 rounded-[2rem] text-center shadow-2xl max-w-sm w-full relative">
         <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-red-600 rounded-full p-4 border-4 border-[#4A2328]">
            <div className="text-4xl">☠️</div>
         </div>
         <h2 className="text-5xl text-red-500 font-black mb-2 mt-4">CRASHED!</h2>
         <p className="text-[#E6B0AA] mb-8 font-bold">Watch your head!</p>
         <div className="flex justify-center space-x-4">
            <Button onClick={() => setGameState(GameState.MENU)}><Home size={32} /></Button>
            <Button onClick={() => startLevel(currentLevel)} className="bg-green-500 !border-green-800 text-white w-24"><RotateCcw size={32} /></Button>
         </div>
      </div>
    </div>
  );

  return (
    <div className="relative w-full h-screen bg-gray-900 overflow-hidden select-none">
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* HUD */}
      {gameState === GameState.PLAYING && (
          <>
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start pointer-events-none">
                <div className="flex flex-col space-y-1">
                    <span className="text-2xl font-bold text-white drop-shadow-md">Level: {currentLevel}</span>
                    <span className="text-xl font-bold text-yellow-400 drop-shadow-md flex items-center gap-1">
                         <Coins size={20} /> {coins}
                    </span>
                    <span className="text-lg font-bold text-white/80 drop-shadow-md">
                         Time: {time.toFixed(2)}s
                    </span>
                </div>
                <div className="pointer-events-auto flex gap-2">
                    <Button className="!p-2 w-12 h-12 flex items-center justify-center" onClick={toggleAudio}>
                        {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                    </Button>
                    <Button className="!p-2 w-12 h-12 flex items-center justify-center" onClick={() => setGameState(GameState.PAUSED)}>
                        <Pause size={24} />
                    </Button>
                </div>
            </div>

            <div className="absolute inset-0 pointer-events-none flex flex-col justify-end p-4 sm:p-8 pb-8 sm:pb-12">
                <div className="flex justify-between items-end w-full max-w-7xl mx-auto pointer-events-auto">
                    <div className="flex gap-4">
                        <Button 
                            className="w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center !bg-[#F9E79F] !border-[#4A2328]"
                            onTouchStart={() => handleInput('left', true)} 
                            onTouchEnd={() => handleInput('left', false)}
                        >
                            <RotateCcw size={40} className="transform -scale-x-100" />
                        </Button>
                        <Button 
                            className="w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center !bg-[#F9E79F] !border-[#4A2328]"
                            onTouchStart={() => handleInput('right', true)} 
                            onTouchEnd={() => handleInput('right', false)}
                        >
                            <RotateCcw size={40} />
                        </Button>
                    </div>

                    <div className="flex gap-4 items-end">
                        <div className="flex flex-col gap-2">
                            <Button 
                                className="w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center !bg-blue-600 !border-blue-900 !text-white shadow-[0_0_15px_#00BFFF]"
                                onTouchStart={() => handleInput('nitro', true)} 
                                onTouchEnd={() => handleInput('nitro', false)}
                            >
                                <Zap size={32} />
                            </Button>
                            <Button 
                                className="w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center !bg-red-400 !text-white"
                                onTouchStart={() => handleInput('brake', true)} 
                                onTouchEnd={() => handleInput('brake', false)}
                            >
                            <span className="font-bold text-xs sm:text-sm">BRAKE</span>
                            </Button>
                        </div>
                        <Button 
                            className="w-24 h-24 sm:w-32 sm:h-32 flex items-center justify-center !bg-green-500 !text-white transform translate-y-[-10px]"
                            onTouchStart={() => handleInput('throttle', true)} 
                            onTouchEnd={() => handleInput('throttle', false)}
                        >
                           <span className="font-bold text-xl">GAS</span>
                        </Button>
                    </div>
                </div>
            </div>
          </>
      )}

      {gameState === GameState.MENU && renderMainMenu()}
      {gameState === GameState.LEVEL_SELECT && renderLevelSelect()}
      {gameState === GameState.SHOP && renderShop()}
      {gameState === GameState.WON && renderWinScreen()}
      {gameState === GameState.CRASHED && renderCrashScreen()}
      {gameState === GameState.CREDITS && renderCredits()}
      {gameState === GameState.POLICY && renderPolicy()}
      
      {gameState === GameState.PAUSED && (
           <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-50 backdrop-blur-sm">
           <div className="bg-[#4A2328] border-4 border-[#F9E79F] p-8 rounded-2xl text-center">
              <h2 className="text-4xl text-[#F9E79F] font-bold mb-6">PAUSED</h2>
              <div className="space-y-4">
                 <button onClick={() => setGameState(GameState.PLAYING)} className="block w-full bg-[#E6B0AA] p-3 rounded-lg font-bold">RESUME</button>
                 <button onClick={() => setGameState(GameState.MENU)} className="block w-full bg-red-400 p-3 rounded-lg font-bold text-white">QUIT</button>
              </div>
           </div>
         </div>
      )}

    </div>
  );
};

export default App;