import type { GroupedPlayer } from '@roster-loom/core';
import { getGameStatusLabel } from '@roster-loom/core';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

/**
 * A single aggregated player row: avatar, name, position/team, live game
 * status, matchup color dots, a bench badge, and the fantasy score.
 *
 * Mirrors the web `PlayerCard`. Benched players are dimmed; matchup dots
 * for benched slots are hidden unless the player is benched everywhere.
 */
export function GroupedPlayerRow({ player }: { player: GroupedPlayer }) {
  const statusLabel = getGameStatusLabel(player);
  const dots = player.onBench
    ? player.matchupColors
    : player.matchupColors.filter((matchup) => !matchup.onBench);

  return (
    <View style={[styles.row, player.onBench && styles.benched]}>
      {player.imageUrl ? (
        <Image source={player.imageUrl} style={styles.avatar} contentFit="cover" />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]} />
      )}
      <View style={styles.info}>
        <View style={styles.nameLine}>
          <ThemedText type="defaultSemiBold" numberOfLines={1} style={styles.name}>
            {player.name}
          </ThemedText>
          {player.onBench && <ThemedText style={styles.benchBadge}>BN</ThemedText>}
          {dots.map((matchup, index) => (
            <View
              key={`${matchup.color}-${index}`}
              style={[styles.dot, { backgroundColor: matchup.color }]}
            />
          ))}
        </View>
        <ThemedText style={styles.meta} numberOfLines={1}>
          {[player.position, player.realTeam].filter(Boolean).join(' · ')}
        </ThemedText>
        {statusLabel && (
          <ThemedText style={styles.status} numberOfLines={1}>
            {statusLabel}
          </ThemedText>
        )}
      </View>
      <ThemedText type="defaultSemiBold" style={styles.score}>
        {player.score.toFixed(1)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#8886',
  },
  benched: { opacity: 0.5 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { backgroundColor: '#8883' },
  info: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 14 },
  benchBadge: {
    fontSize: 10,
    fontWeight: '700',
    opacity: 0.6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: '#8883',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  meta: { fontSize: 12, opacity: 0.6 },
  status: { fontSize: 11, opacity: 0.5, marginTop: 1 },
  score: { fontSize: 18, minWidth: 52, textAlign: 'right' },
});
