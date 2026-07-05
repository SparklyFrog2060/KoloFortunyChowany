export interface Player {
  id: string;
  name: string;
  acceptedPool: string[]; // List of names of other players this player accepts
  createdAt: number;
}

export interface GameSettings {
  seekerPool: string[]; // List of player names eligible to be drawn as seeker
  activePlayers: string[]; // Players checked in attendance
  seeker: string | null;
  drawnPlayers: string[]; // Players drawn as hiders
  gameInProgress: boolean;
  lastDrawTime: number | null;
  pairs?: string[]; // Array of strings representing matched pairs/trios (e.g., "Ania, Bartek")
  currentLeader?: string | null; // The player currently drawn who is waiting for a partner
}

export interface HistoryEntry {
  id: string;
  seeker: string;
  drawnPlayers: string[];
  timestamp: number;
}
