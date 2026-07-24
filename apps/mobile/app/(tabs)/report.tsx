import type {
  DoubleAgentPlayer,
  GroupedPlayer,
  MatchupReportPlayer,
  Player,
} from '@roster-loom/core';
import { processMatchups } from '@roster-loom/core';
import { useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { GroupedPlayerRow } from '@/components/player-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTeams } from '@/lib/teams';

const asGrouped = (player: Player): GroupedPlayer => ({
  ...player,
  count: 1,
  matchupColors: [],
});

const byBenchThenScore = (a: Player, b: Player) =>
  Number(a.onBench) - Number(b.onBench) || b.score - a.score;

export default function ReportScreen() {
  const { teams, error, refreshing, refresh } = useTeams();

  const { fantasyHeroes, publicEnemies, doubleAgents } = useMemo(
    () => processMatchups(teams ?? []),
    [teams],
  );

  const hasReport =
    fantasyHeroes.length > 0 || publicEnemies.length > 0 || doubleAgents.length > 0;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">Matchup Report</ThemedText>
        <ThemedText style={styles.subtle}>Players you share across your leagues</ThemedText>
      </View>

      {error && (
        <ThemedText style={styles.error} testID="report-error">
          {error}
        </ThemedText>
      )}

      {!error && teams === null && <ActivityIndicator style={styles.loading} />}

      {teams && !hasReport && (
        <ThemedText style={styles.empty}>
          No shared players yet. This report highlights players who appear on more than one of
          your matchups.
        </ThemedText>
      )}

      {teams && hasReport && (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          <ReportSection title="🦸 Fantasy Heroes">
            {[...fantasyHeroes].sort(byBenchThenScore).map((player) => (
              <ReportRow key={player.id} player={player} label="On teams" teams={player.matchups} />
            ))}
          </ReportSection>

          <ReportSection title="😈 Public Enemies">
            {[...publicEnemies].sort(byBenchThenScore).map((player) => (
              <ReportRow key={player.id} player={player} label="On teams" teams={player.matchups} />
            ))}
          </ReportSection>

          <ReportSection title="🕵️ Double Agents">
            {[...doubleAgents].sort(byBenchThenScore).map((player) => (
              <DoubleAgentRow key={player.id} player={player} />
            ))}
          </ReportSection>
        </ScrollView>
      )}
    </ThemedView>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  const isEmpty = Array.isArray(items) && items.length === 0;
  return (
    <View style={styles.section}>
      <ThemedText type="subtitle" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      {isEmpty ? <ThemedText style={styles.subtle}>None this week.</ThemedText> : items}
    </View>
  );
}

function ReportRow({
  player,
  label,
  teams,
}: {
  player: MatchupReportPlayer;
  label: string;
  teams: string[];
}) {
  return (
    <View style={styles.reportRow}>
      <GroupedPlayerRow player={asGrouped(player)} />
      <ThemedText style={styles.teamsLine}>
        <ThemedText style={styles.teamsLabel}>{label}: </ThemedText>
        {teams.join(', ')}
      </ThemedText>
    </View>
  );
}

function DoubleAgentRow({ player }: { player: DoubleAgentPlayer }) {
  return (
    <View style={styles.reportRow}>
      <GroupedPlayerRow player={asGrouped(player)} />
      <ThemedText style={styles.teamsLine}>
        <ThemedText style={[styles.teamsLabel, styles.forYou]}>Your teams: </ThemedText>
        {player.userMatchups.join(', ')}
      </ThemedText>
      <ThemedText style={styles.teamsLine}>
        <ThemedText style={[styles.teamsLabel, styles.against]}>Opponent teams: </ThemedText>
        {player.opponentMatchups.join(', ')}
      </ThemedText>
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
  scroll: { paddingHorizontal: 12, paddingBottom: 24 },
  section: { marginTop: 16 },
  sectionTitle: { marginBottom: 8, marginHorizontal: 4 },
  reportRow: { marginBottom: 10 },
  teamsLine: { fontSize: 12, opacity: 0.75, marginTop: 4, marginHorizontal: 4 },
  teamsLabel: { fontWeight: '700', opacity: 0.9 },
  forYou: { color: '#0a7d2f' },
  against: { color: '#c0392b' },
});
