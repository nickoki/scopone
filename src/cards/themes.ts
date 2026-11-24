import type { Suit } from '../engine/cards';

export type CardStyle = 'napoletane' | 'piacentine' | 'siciliane';

export const CARD_STYLES: readonly CardStyle[] = ['napoletane', 'piacentine', 'siciliane'];

/** Every card is drawn in a 100 x 170 box. */
export const CARD_W = 100;
export const CARD_H = 170;

export interface Theme {
  id: CardStyle;
  /** Card stock and the hairline around it. */
  paper: string;
  edge: string;
  /** Outline colour used for every drawing. */
  ink: string;
  gold: string;
  yellow: string;
  red: string;
  redDeep: string;
  blue: string;
  blueLight: string;
  green: string;
  greenLight: string;
  brown: string;
  skin: string;
  white: string;
  steel: string;
  /** Outline width (card units) for pips and for court figures. */
  pipLine: number;
  figLine: number;
  /** Relative size of the pips on number cards. */
  pipScale: number;
  /** Court cards mirrored top/bottom. */
  doubleHeaded: boolean;
  frame: 'none' | 'line' | 'band';
  frameColor: string;
  /** How much the art is shrunk to sit inside the frame. */
  artScale: number;
  headScale: number;
  /** Horizontal stretch of the standing figures. */
  figStretch: number;
  limb: number;
  back: { field: string; fieldDeep: string; motif: string; accent: string };
  /** Readable ink colour per suit, used for the corner index. */
  suitInk: Record<Suit, string>;
}

export const THEMES: Record<CardStyle, Theme> = {
  napoletane: {
    id: 'napoletane',
    paper: '#fbf2da',
    edge: '#8c7a55',
    ink: '#17110c',
    gold: '#f2ae14',
    yellow: '#ffd748',
    red: '#d9261c',
    redDeep: '#9c1510',
    blue: '#1d59b8',
    blueLight: '#86b9f0',
    green: '#2c9a47',
    greenLight: '#7ccb5f',
    brown: '#8b5a2b',
    skin: '#f7cba2',
    white: '#fffaf0',
    steel: '#dfe9f5',
    pipLine: 1.35,
    figLine: 1.4,
    pipScale: 1,
    doubleHeaded: false,
    frame: 'none',
    frameColor: '#17110c',
    artScale: 1,
    headScale: 1,
    figStretch: 1,
    limb: 7.4,
    back: { field: '#1c3f94', fieldDeep: '#122a68', motif: '#f6ecd2', accent: '#f2ae14' },
    suitInk: { denari: '#a86a00', coppe: '#c21a12', spade: '#174a9c', bastoni: '#1c7a36' },
  },
  piacentine: {
    id: 'piacentine',
    paper: '#f6f1e6',
    edge: '#7d7a72',
    ink: '#151a2e',
    gold: '#e8a92a',
    yellow: '#f7d657',
    red: '#c9301f',
    redDeep: '#8e1d13',
    blue: '#27509f',
    blueLight: '#8fb0e2',
    green: '#2f7d55',
    greenLight: '#79b383',
    brown: '#7a4a26',
    skin: '#f3d2b3',
    white: '#fdfbf5',
    steel: '#e4ebf4',
    pipLine: 1.15,
    figLine: 1.15,
    pipScale: 0.97,
    doubleHeaded: true,
    frame: 'line',
    frameColor: '#151a2e',
    artScale: 0.93,
    headScale: 1,
    figStretch: 1,
    limb: 7,
    back: { field: '#a62f1e', fieldDeep: '#74190f', motif: '#f6e9cf', accent: '#f0c04a' },
    suitInk: { denari: '#a06a08', coppe: '#b72617', spade: '#234a96', bastoni: '#256b47' },
  },
  siciliane: {
    id: 'siciliane',
    paper: '#fff3d0',
    edge: '#8a6a3a',
    ink: '#2b1707',
    gold: '#ffb000',
    yellow: '#ffd535',
    red: '#e8491b',
    redDeep: '#a82c0c',
    blue: '#1f78c4',
    blueLight: '#8cc7ee',
    green: '#1f9d52',
    greenLight: '#8fd05a',
    brown: '#9a5a1e',
    skin: '#f5c292',
    white: '#fffbee',
    steel: '#e0eef6',
    pipLine: 1.5,
    figLine: 1.7,
    pipScale: 0.94,
    doubleHeaded: false,
    frame: 'band',
    frameColor: '#1f9d52',
    artScale: 0.93,
    headScale: 1.2,
    figStretch: 1.1,
    limb: 8.6,
    back: { field: '#147a48', fieldDeep: '#0a5230', motif: '#ffd535', accent: '#e8491b' },
    suitInk: { denari: '#b06c00', coppe: '#cf3a10', spade: '#1763a8', bastoni: '#177a3e' },
  },
};
