import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { Drawer, type DrawerHandle } from '@/components/drawer';
import { AppText, Banner, Button } from '@/components/ui';
import { Colors, Font, Radius } from '@/constants/theme';
import { useSync } from '@/hooks/use-sync';
import { useApiKey } from '@/lib/api-key';
import { splitPastedText } from '@/lib/sync';

const EXAMPLE = `Rs.486 spent on HDFC Bank Card x4421 at SWIGGY on 12-Nov-26. Avl bal: Rs.48,210

INR 85,000 credited to A/c XX3381 on 01-Nov-26 by NEFT from ACME CORP`;

export default function ImportScreen() {
  const [text, setText] = useState('');
  const { running, progress, runPaste } = useSync();
  const hasKey = useApiKey((s) => s.hasKey);
  const [result, setResult] = useState<{ tone: 'success' | 'warning' | 'error'; message: string } | null>(null);
  const drawer = useRef<DrawerHandle>(null);

  const count = text.trim() ? splitPastedText(text).length : 0;
  const busy = running === 'paste';
  const done = result?.tone === 'success';

  async function handleAnalyse() {
    setResult(null);
    const outcome = await runPaste(text);
    setResult(outcome);
    if (outcome.tone === 'success') setText('');
  }

  const footer =
    hasKey === false ? (
      <Button
        label="Add OpenAI key first"
        icon="key"
        onPress={() => drawer.current?.close(() => router.push('/settings'))}
      />
    ) : done ? (
      <Button label="Done" icon="check" onPress={() => drawer.current?.close()} />
    ) : (
      <Button
        label={busy ? `${progress?.label ?? 'Working'}…` : count ? `Analyse ${count}` : 'Analyse'}
        icon="sparkle"
        onPress={handleAnalyse}
        loading={busy}
        disabled={!count || !!running}
      />
    );

  return (
    <Drawer ref={drawer} title="Paste messages" subtitle="Leave a blank line between alerts" footer={footer}>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
        placeholder={EXAMPLE}
        placeholderTextColor={Colors.textTertiary}
        textAlignVertical="top"
        style={styles.input}
        accessibilityLabel="Bank messages"
      />
      <AppText variant="caption" color="textTertiary">
        OTPs are skipped and long numbers are masked before the AI reads them.
      </AppText>
      {result && <Banner tone={result.tone} message={result.message} />}
    </Drawer>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 180,
    maxHeight: 320,
    borderRadius: Radius.lg,
    backgroundColor: Colors.card,
    padding: 16,
    fontFamily: Font.medium,
    fontSize: 15,
    lineHeight: 21,
    color: Colors.text,
  },
});
