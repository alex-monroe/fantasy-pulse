import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const router = useRouter();
  const { session, loading: sessionLoading } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sessionLoading) return null;
  if (session) return <Redirect href="/" />;

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace('/');
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.heading}>
        Sign in
      </ThemedText>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#888"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        editable={!submitting}
        testID="login-email"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#888"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        value={password}
        onChangeText={setPassword}
        editable={!submitting}
        testID="login-password"
      />

      {error && (
        <ThemedText style={styles.error} testID="login-error">
          {error}
        </ThemedText>
      )}

      <View style={styles.button}>
        {submitting ? (
          <ActivityIndicator />
        ) : (
          <Button title="Sign in" onPress={onSubmit} disabled={!email || !password} />
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, justifyContent: 'center' },
  heading: { marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#888',
    borderRadius: 6,
    padding: 12,
    color: '#000',
    backgroundColor: '#fff',
  },
  error: { color: '#c0392b' },
  button: { marginTop: 12 },
});
