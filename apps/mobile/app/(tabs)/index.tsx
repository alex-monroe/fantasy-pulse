import type { GroupedPlayer, Team } from '@roster-loom/core';
import {
  assignTeamColors,
  groupMatchupPlayers,
  groupPlayersByPosition,
  PLAYER_POSITIONS,
} from '@roster-loom/core';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Button,
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

export default function OverviewScreen() {
  const { session } = useSession();
  const { teams, error, refreshing, refresh } = useTeams();

  const teamColors = useMemo(() => assignTeamColors(teams ?? []), [teams]);
  const { myPlayers, opponentPlayers } = useMemo(
    () => groupMatchupPlayers(teams ?? []),
    [teams],
  );

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
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.scoreboard}
            contentContainerStyle={styles.scoreboardContent}
          >
            {teams.map((team) => (
              <MatchupScore
                key={team.id}
                team={team}
                color={teamColors.get(team.id) ?? '#888'}
              />
            ))}
          </ScrollView>

          <ScrollView
            contentContainerStyle={styles.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          >
            <RosterColumn title="My Players" players={myPlayers} />
            <RosterColumn title="Opponent Players" players={opponentPlayers} />
          </ScrollView>
        </>
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

function MatchupScore({ team, color }: { team: Team; color: string }) {
  const winning = team.totalScore >= team.opponent.totalScore;
  return (
    <View style={styles.matchupCard}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={styles.matchupNames}>
        <View style={styles.matchupRow}>
          <ThemedText style={styles.matchupName} numberOfLines={1}>
            {team.name}
          </ThemedText>
          <ThemedText
            type="defaultSemiBold"
            style={[styles.matchupScore, winning ? styles.winning : undefined]}
          >
            {team.totalScore.toFixed(1)}
          </ThemedText>
        </View>
        <View style={styles.matchupRow}>
          <ThemedText style={[styles.matchupName, styles.subtle]} numberOfLines={1}>
            {team.opponent.name}
          </ThemedText>
          <ThemedText type="defaultSemiBold" style={[styles.matchupScore, styles.subtle]}>
            {team.opponent.totalScore.toFixed(1)}
          </ThemedText>
        </View>
      </View>
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
  header: { paddingHorizontal: 16, paddingVertical: 6 },
  subtle: { opacity: 0.6, fontSize: 13 },
  error: { color: '#c0392b', paddingHorizontal: 16, marginTop: 12 },
  loading: { marginTop: 24 },
  empty: { marginTop: 24, marginHorizontal: 16, opacity: 0.7 },
  scoreboard: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#8886' },
  scoreboardContent: { paddingHorizontal: 10, paddingVertical: 8, gap: 8 },
  scroll: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 24 },
  section: { marginTop: 10 },
  sectionTitle: { marginBottom: 4, marginHorizontal: 4 },
  matchupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 170,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#8886',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  matchupNames: { flex: 1, minWidth: 0, gap: 1 },
  matchupRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 },
  matchupName: { flexShrink: 1, fontSize: 12 },
  matchupScore: { fontSize: 15 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  winning: { color: '#0a7d2f' },
  positionGroup: { marginBottom: 6, gap: 4 },
  positionLabel: { fontSize: 11, fontWeight: '700', opacity: 0.7, marginHorizontal: 4 },
  signOut: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 },
});
