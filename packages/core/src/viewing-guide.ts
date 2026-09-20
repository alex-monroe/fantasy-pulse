import { createPlayerAggregationKey } from './matchups';
import { getGamePhase } from './player-status';
import type { Player, Team } from './types';

/** A starter with a stake in a game, and which side of which matchups they're on. */
export interface ViewingGuidePlayer {
  key: string;
  name: string;
  position: string;
  realTeam: string;
  /** Whether the player's game is being played right now. */
  live: boolean;
  /** Names of the user's teams that start the player. */
  mine: string[];
  /** Names of the user's teams whose opponent starts the player. */
  opponents: string[];
}

/** One NFL game that still matters to at least one of the user's matchups. */
export interface ViewingGuideGame {
  id: string;
  label: string;
  startTime: string | null;
  live: boolean;
  /** Distinct starters in the game across every matchup, both sides. */
  playerCount: number;
  players: ViewingGuidePlayer[];
  /** Whether this game has the most players in its time slot. */
  isTopPick: boolean;
}

/** Games kicking off together, most-watchable first. */
export interface ViewingGuideSlot {
  /** ISO kickoff time shared by the slot, or `null` for games without one. */
  startTime: string | null;
  games: ViewingGuideGame[];
}

/**
 * Builds the "what should I put on the TV" guide: every game that still
 * has a starter to play (live or not yet started) across all matchups,
 * bucketed by kickoff time. Within a slot, games are ordered by how many
 * distinct players — mine and my opponents' combined — are in them, and
 * the game(s) with the most are flagged as the top pick.
 *
 * @param teams - The user's teams with their opponents.
 * @returns Slots in chronological order.
 */
export const buildViewingGuide = (teams: Team[]): ViewingGuideSlot[] => {
  const games = new Map<string, ViewingGuideGame>();
  const rosters = new Map<string, Map<string, ViewingGuidePlayer>>();

  const add = (player: Player, teamName: string, side: 'mine' | 'opponents') => {
    if (!player || player.onBench) return;
    const phase = getGamePhase(player);
    if (phase !== 'pregame' && phase !== 'live') return;
    const key = createPlayerAggregationKey(player);
    if (!key) return;

    const id =
      player.gameId ?? `${player.gameStartTime ?? 'tbd'}|${player.realTeam.toUpperCase()}`;
    let game = games.get(id);
    if (!game) {
      game = {
        id,
        label: player.gameLabel ?? player.realTeam.toUpperCase(),
        startTime: player.gameStartTime ?? null,
        live: phase === 'live',
        playerCount: 0,
        players: [],
        isTopPick: false,
      };
      games.set(id, game);
      rosters.set(id, new Map());
    }

    const roster = rosters.get(id)!;
    let entry = roster.get(key);
    if (!entry) {
      entry = {
        key,
        name: player.name,
        position: player.position,
        realTeam: player.realTeam,
        live: phase === 'live',
        mine: [],
        opponents: [],
      };
      roster.set(key, entry);
      game.players.push(entry);
    }
    if (!entry[side].includes(teamName)) entry[side].push(teamName);
  };

  teams.forEach((team) => {
    const name = team.name ?? 'My team';
    team.players?.forEach((p) => add(p, name, 'mine'));
    team.opponent?.players?.forEach((p) => add(p, name, 'opponents'));
  });

  const slots = new Map<string, ViewingGuideSlot>();
  games.forEach((game) => {
    game.playerCount = game.players.length;
    game.players.sort(
      (a, b) => b.mine.length + b.opponents.length - (a.mine.length + a.opponents.length),
    );
    const slotKey = game.startTime ?? '';
    const slot = slots.get(slotKey) ?? { startTime: game.startTime, games: [] };
    slot.games.push(game);
    slots.set(slotKey, slot);
  });

  return Array.from(slots.values())
    .sort((a, b) => {
      if (a.startTime === b.startTime) return 0;
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return Date.parse(a.startTime) - Date.parse(b.startTime);
    })
    .map((slot) => {
      slot.games.sort((a, b) => b.playerCount - a.playerCount || a.label.localeCompare(b.label));
      const top = slot.games[0].playerCount;
      slot.games.forEach((g) => {
        g.isTopPick = g.playerCount === top;
      });
      return slot;
    });
};
