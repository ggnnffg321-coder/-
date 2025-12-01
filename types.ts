export enum GameState {
  MENU = 'MENU',
  LEVEL_SELECT = 'LEVEL_SELECT',
  SHOP = 'SHOP',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  WON = 'WON',
  CRASHED = 'CRASHED',
  CREDITS = 'CREDITS',
  POLICY = 'POLICY'
}

export enum BikeStyle {
  CHOPPER = 'CHOPPER',
  SPORT = 'SPORT',
  POLICE = 'POLICE',
  SCOOTER = 'SCOOTER'
}

export interface Point {
  x: number;
  y: number;
}

export interface LevelData {
  id: number;
  length: number;
  difficulty: number;
  terrainSeed: number;
}

export interface BikePhysics {
  x: number;
  y: number;
  velocity: number;
  angle: number; // in radians
  angularVelocity: number;
  lean: number; // rider lean offset
}

export interface BikeConfig {
  id: number;
  name: string;
  style: BikeStyle;
  price: number;
  colors: {
    body: string;
    detail: string;
    seat: string;
  };
}