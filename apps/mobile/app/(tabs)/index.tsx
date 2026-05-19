import type { Player, Team } from '@roster-loom/core';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { fetchTeams } from '@/lib/api';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function ScoreboardScreen() {
  const { session } = useSession();
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setError(null);
    const result = await fetchTeams();
    if ('error' in result) setError(result.error);
    else setTeams(result.teams);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const toggle = (teamId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(teamId) ? next.delete(teamId) : next.add(teamId);
      return next;
    });
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">Matchups</ThemedText>
        <ThemedText style={styles.subtle}>{session?.user.email}</ThemedText>
      </View>

      {error && (
        <ThemedText style={styles.error} testID="scoreboard-error">
          {error}
        </ThemedText>
      )}

      {!error && teams === null && <ActivityIndicator style={styles.loading} />}

      {teams && teams.length === 0 && (
        <ThemedText style={styles.empty}>
          No teams yet. Connect Sleeper, Yahoo, or Ottoneu from the web app.
        </ThemedText>
      )}

      {teams && teams.length > 0 && (
        <FlatList
          data={teams}
          keyExtractor={(t) => String(t.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TeamRow team={item} expanded={expanded.has(item.id)} onToggle={() => toggle(item.id)} />
          )}
        />
      )}

      <View style={styles.signOut}>
        <Button title="Sign out" onPress={() => supabase.auth.signOut()} />
      </View>
    </ThemedView>
  );
}

function TeamRow({
  team,
  expanded,
  onToggle,
}: {
  team: Team;
  expanded: boolean;
  onToggle: () => void;
}) {
  const winning = team.totalScore >= team.opponent.totalScore;
  return (
    <View style={styles.card}>
      <Pressable onPress={onToggle} style={styles.cardHeader} accessibilityRole="button">
        <View style={styles.teamLine}>
          <ThemedText
            type="defaultSemiBold"
            style={[styles.teamName, winning && styles.winning]}
            numberOfLines={1}>
            {team.name}
          </ThemedText>
          <ThemedText
            type="defaultSemiBold"
            style={[styles.score, winning && styles.winning]}>
            {team.totalScore.toFixed(1)}
          </ThemedText>
        </View>
        <View style={styles.teamLine}>
          <ThemedText style={[styles.teamName, styles.opponent]} numberOfLines={1}>
            {team.opponent.name}
          </ThemedText>
          <ThemedText style={[styles.score, styles.opponent]}>
            {team.opponent.totalScore.toFixed(1)}
          </ThemedText>
        </View>
        <ThemedText style={styles.expandHint}>
          {expanded ? 'Tap to collapse' : 'Tap for players'}
        </ThemedText>
      </Pressable>

      {expanded && (
        <View style={styles.players}>
          {team.players.length === 0 ? (
            <ThemedText style={styles.subtle}>No players.</ThemedText>
          ) : (
            team.players.map((p) => <PlayerRow key={p.id} player={p} />)
          )}
        </View>
      )}
    </View>
  );
}

function PlayerRow({ player }: { player: Player }) {
  return (
    <View style={styles.playerRow}>
      <View style={styles.playerLeft}>
        <ThemedText style={styles.position}>{player.position || '—'}</ThemedText>
        <View style={styles.playerNameWrap}>
          <ThemedText numberOfLines={1}>{player.name}</ThemedText>
          <ThemedText style={styles.realTeam} numberOfLines={1}>
            {[player.realTeam, player.gameStatus].filter(Boolean).join(' · ')}
          </ThemedText>
        </View>
      </View>
      <ThemedText type="defaultSemiBold">{player.score.toFixed(1)}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 8 },
  header: { paddingHorizontal: 16, paddingVertical: 8 },
  subtle: { opacity: 0.6, fontSize: 13 },
  error: { color: '#c0392b', paddingHorizontal: 16, marginTop: 12 },
  loading: { marginTop: 24 },
  empty: { marginTop: 24, marginHorizontal: 16, opacity: 0.7 },
  list: { paddingHorizontal: 12, paddingBottom: 12 },
  card: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    marginVertical: 6,
    overflow: 'hidden',
  },
  cardHeader: { padding: 12 },
  teamLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 2,
  },
  teamName: { flex: 1 },
  opponent: { opacity: 0.7 },
  winning: { color: '#0a7d2f' },
  score: { minWidth: 56, textAlign: 'right' },
  expandHint: { marginTop: 6, fontSize: 11, opacity: 0.5 },
  players: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#888' },
  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
  },
  playerLeft: { flexDirection: 'row', flex: 1, alignItems: 'center', gap: 10 },
  position: {
    minWidth: 36,
    fontVariant: ['tabular-nums'],
    fontSize: 12,
    opacity: 0.7,
  },
  playerNameWrap: { flex: 1 },
  realTeam: { fontSize: 11, opacity: 0.6 },
  signOut: { paddingHorizontal: 16, paddingBottom: 16, marginTop: 8 },
});
