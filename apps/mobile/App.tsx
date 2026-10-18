import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '@fyh/shared';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>Find Your Home</Text>
      <Text style={styles.title}>The app is being built.</Text>
      <Text style={styles.body}>Search, listings and accounts arrive in Phase 3.</Text>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.surfaceMuted,
    justifyContent: 'center',
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  eyebrow: {
    color: tokens.colors.brand,
    fontSize: tokens.fontSize.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  title: {
    color: tokens.colors.text,
    fontSize: tokens.fontSize.xxl,
    fontWeight: '600',
  },
  body: {
    color: tokens.colors.textMuted,
    fontSize: tokens.fontSize.md,
  },
});
