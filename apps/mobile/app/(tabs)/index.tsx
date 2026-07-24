import type { GroupedPlayer, Player, Team } from '@roster-loom/core';
import {
  assignTeamColors,
  groupMatchupPlayers,
  groupPlayersByPosition,
  PLAYER_POSITIONS,
} from '@roster-loom/core';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { GroupedPlayerRow } from '@/components/player-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useTeams } from '@/lib/teams';

const asGrouped = (player: Player): GroupedPlayer => ({
  ...player,
  count: 1,
  matchupColors: [],
});

export default function OverviewScreen() {
  const { session } = useSession();
  const { teams, error, refreshing, refresh } = useTeams();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const teamColors = useMemo(() => assignTeamColors(teams ?? []), [teams]);
  const { myPlayers, opponentPlayers } = useMemo(
    () => groupMatchupPlayers(teams ?? []),
    [teams],
  );

  const toggle = (teamId: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">Overview</ThemedText>
        <ThemedText style={styles.subtle}>{session?.user.email}</ThemedText>
      </View>

      {error && (
        <ThemedText style={styles.error} testID="overview-error">
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
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          <Section title="Weekly Matchups">
            {teams.map((team) => (
              <MatchupSummary
                key={team.id}
                team={team}
                color={teamColors.get(team.id) ?? '#888'}
                expanded={expanded.has(team.id)}
                onToggle={() => toggle(team.id)}
              />
            ))}
          </Section>

          <RosterColumn title="My Players" players={myPlayers} />
          <RosterColumn title="Opponent Players" players={opponentPlayers} />
        </ScrollView>
      )}

      <View style={styles.signOut}>
        <Button title="Sign out" onPress={() => supabase.auth.signOut()} />
      </View>
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="subtitle" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

function MatchupSummary({
  team,
  color,
  expanded,
  onToggle,
}: {
  team: Team;
  color: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const winning = team.totalScore >= team.opponent.totalScore;
  return (
    <View style={styles.matchupCard}>
      <Pressable onPress={onToggle} accessibilityRole="button">
        <View style={styles.matchupTop}>
          <View style={styles.matchupNames}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <View style={styles.flexShrink}>
              <ThemedText type="defaultSemiBold" numberOfLines={1}>
                {team.name}
              </ThemedText>
              <ThemedText style={styles.subtle} numberOfLines={1}>
                vs {team.opponent.name}
              </ThemedText>
            </View>
          </View>
          <View style={styles.matchupScores}>
            <ThemedText type="defaultSemiBold" style={winning ? styles.winning : undefined}>
              {team.totalScore.toFixed(1)}
            </ThemedText>
            <ThemedText style={styles.subtle}>{team.opponent.totalScore.toFixed(1)}</ThemedText>
          </View>
        </View>
        <ThemedText style={styles.expandHint}>
          {expanded ? 'Tap to collapse' : 'Tap for players'}
        </ThemedText>
      </Pressable>
      {expanded && (
        <View style={styles.rosterList}>
          {team.players.length === 0 ? (
            <ThemedText style={styles.subtle}>No players.</ThemedText>
          ) : (
            [...team.players]
              .sort((a, b) => b.score - a.score)
              .map((player) => <GroupedPlayerRow key={player.id} player={asGrouped(player)} />)
          )}
        </View>
      )}
    </View>
  );
}

function RosterColumn({ title, players }: { title: string; players: GroupedPlayer[] }) {
  const starters = players.filter((player) => !player.onBench);
  const bench = players.filter((player) => player.onBench);
  const byPosition = groupPlayersByPosition(starters);

  return (
    <Section title={`${title} (${players.length})`}>
      {PLAYER_POSITIONS.map((position) => {
        const group = byPosition[position];
        if (!group || group.length === 0) return null;
        return (
          <View key={position} style={styles.positionGroup}>
            <ThemedText style={styles.positionLabel}>{position}</ThemedText>
            {[...group]
              .sort((a, b) => b.score - a.score)
              .map((player) => (
                <GroupedPlayerRow key={`${player.id}-${player.name}`} player={player} />
              ))}
          </View>
        );
      })}
      {bench.length > 0 && (
        <View style={styles.positionGroup}>
          <ThemedText style={styles.positionLabel}>Bench</ThemedText>
          {[...bench]
            .sort((a, b) => b.score - a.score)
            .map((player) => (
              <GroupedPlayerRow key={`bench-${player.id}-${player.name}`} player={player} />
            ))}
        </View>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 8 },
  header: { paddingHorizontal: 16, paddingVertical: 8 },
  subtle: { opacity: 0.6, fontSize: 13 },
  error: { color: '#c0392b', paddingHorizontal: 16, marginTop: 12 },
  loading: { marginTop: 24 },
  empty: { marginTop: 24, marginHorizontal: 16, opacity: 0.7 },
  scroll: { paddingHorizontal: 12, paddingBottom: 24 },
  section: { marginTop: 16 },
  sectionTitle: { marginBottom: 8, marginHorizontal: 4 },
  matchupCard: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#8886',
    padding: 12,
    marginBottom: 8,
  },
  matchupTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  matchupNames: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  flexShrink: { flexShrink: 1, minWidth: 0 },
  matchupScores: { alignItems: 'flex-end' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  winning: { color: '#0a7d2f' },
  expandHint: { marginTop: 6, fontSize: 11, opacity: 0.5 },
  rosterList: { marginTop: 10, gap: 6 },
  positionGroup: { marginBottom: 10, gap: 6 },
  positionLabel: { fontSize: 13, fontWeight: '700', opacity: 0.7, marginHorizontal: 4 },
  signOut: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 },
});
