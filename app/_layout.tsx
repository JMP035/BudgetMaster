import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, StyleSheet } from 'react-native';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <View style={s.root}>
        <StatusBar style="light" backgroundColor="#080808" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#080808' } }} />
      </View>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
});