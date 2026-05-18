import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, FlatList, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type League = {
  id: number;
  name: string | null;
  season: string | null;
  status: string | null;
  total_rosters: number | null;
};

export default function LeaguesScreen() {
  const { session } = useSession();
  const [leagues, setLeagues] = useState<League[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('fp_leagues')
      .select('id, name, season, status, total_rosters')
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setLeagues(data ?? []);
      });
  }, []);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.heading}>
        Your leagues
      </ThemedText>
      <ThemedText style={styles.subtle}>Signed in as {session?.user.email}</ThemedText>

      {error && (
        <ThemedText style={styles.error} testID="leagues-error">
          {error}
        </ThemedText>
      )}

      {!error && leagues === null && <ActivityIndicator style={styles.loading} />}

      {leagues?.length === 0 && (
        <ThemedText style={styles.empty}>
          No leagues yet — connect a provider from the web app.
        </ThemedText>
      )}

      {leagues && leagues.length > 0 && (
        <FlatList
          data={leagues}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <ThemedText type="defaultSemiBold">{item.name ?? 'Untitled league'}</ThemedText>
              <ThemedText style={styles.subtle}>
                {[item.season, item.status, item.total_rosters && `${item.total_rosters} teams`]
                  .filter(Boolean)
                  .join(' · ')}
              </ThemedText>
            </View>
          )}
        />
      )}

      <View style={styles.signOut}>
        <Button title="Sign out" onPress={() => supabase.auth.signOut()} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 8 },
  heading: { marginTop: 8 },
  subtle: { opacity: 0.7 },
  error: { color: '#c0392b', marginTop: 12 },
  loading: { marginTop: 24 },
  empty: { marginTop: 24, opacity: 0.7 },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#888' },
  signOut: { marginTop: 24 },
});
