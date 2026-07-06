export type Lang = 'es' | 'en';
export interface Localized { es: string; en: string; }
export type PieceId = 'cap' | 'visor' | 'shield' | 'backpack' | 'boots';
export type Role = 'player' | 'staff' | 'admin';
export interface Activity { id: string; name: Localized; tickets: number; special?: boolean; }
export interface Piece { id: PieceId; sprite: string; slot: Localized; name: Localized; color: string; }
export interface Stand {
  id: string; icon: string; color: string; accent: string;
  name: Localized; tag: Localized; blurb: Localized;
  piece: PieceId; map: { x: number; y: number }; activities: Activity[];
}
export interface Progress {
  doneActivities: string[]; pieces: PieceId[]; badges: string[]; claimed: string[];
  visitedStands: string[]; tickets: number; lastPiece: PieceId | null;
}
export interface Badge { id: string; icon: string; name: Localized; desc: Localized; check: (p: Progress) => boolean; }
export interface Prize { id: string; sprite: string; name: Localized; cost: number; stock: number; raffle?: boolean; }
export interface Player { id: string; name: string; baseId: string; role?: Role; standId?: string; qrToken?: string; }
export interface GameState { player: Player | null; progress: Progress; }
export type Nav = (screen: string, params?: Record<string, unknown>) => void;
export interface Actions {
  claim: (prizeId: string) => void;
}
