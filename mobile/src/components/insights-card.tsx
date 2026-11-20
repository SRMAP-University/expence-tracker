import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Font } from '@/constants/theme';
import { buildInsightsPayload } from '@/lib/analytics';
import { useApiKey } from '@/lib/api-key';
import { buildLedger } from '@/lib/money';
import { generateInsights } from '@/lib/openai';
import { getApiKey } from '@/lib/secret-store';
import { useStore } from '@/lib/store';

import { Icon } from './icon';
import { NotchCard } from './notch-card';
import { AppText, Banner, Button, IconBubble, IconButton } from './ui';

/** Lime card holding the AI's read of a month. Generated on demand, then kept per month. */
export function InsightsCard({ month, hasTransactions }: { month: string; hasTransactions: boolean }) {
  const insights = useStore((s) => s.insights[month]);
  const setInsights = useStore((s) => s.setInsights);
  const hasKey = useApiKey((s) => s.hasKey);
  const [state, setState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });

  async function generate() {
    setState({ loading: true, error: null });
    try {
      const apiKey = await getApiKey();
      if (!apiKey) throw new Error('Add your OpenAI API key in Settings first.');
      const state = useStore.getState();
      const { settings } = state;
      const ledger = buildLedger(state);
      const payload = buildInsightsPayload(ledger.transactions, month, ledger.currency);
      const result = await generateInsights(payload, { apiKey, model: settings.model });
      setInsights({ month, generatedAt: Date.now(), headline: result.headline, insights: result.insights });
      setState({ loading: false, error: null });
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <NotchCard color={Colors.lime} style={styles.card}>
      <View style={styles.header}>
        <IconBubble name="sparkle" tone="white" size={38} />
        <View style={styles.fill}>
          <AppText variant="label" color="onLime">AI insights</AppText>
          <Text style={styles.muted}>
            {insights
              ? `Generated ${new Date(insights.generatedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`
              : 'A quick read of this month, with ideas to save'}
          </Text>
        </View>
        {insights && (
          <IconButton
            icon="sync"
            label="Regenerate insights"
            size={38}
            onPress={generate}
            loading={state.loading}
            disabled={!hasTransactions}
          />
        )}
      </View>

      {insights ? (
        <View style={styles.list}>
          <AppText variant="heading" color="onLime">{insights.headline}</AppText>
          {insights.insights.map((item, i) => (
            <View key={i} style={styles.item}>
              <Icon
                name={item.tone === 'warning' ? 'warning' : item.tone === 'positive' ? 'check' : 'info'}
                size={18}
                color={Colors.onLime}
                style={styles.itemIcon}
              />
              <View style={styles.fill}>
                <AppText variant="label" color="onLime">{item.title}</AppText>
                <Text style={styles.muted}>{item.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Button
          label={hasKey ? 'Generate insights' : 'Add OpenAI key to unlock'}
          icon={hasKey ? 'sparkle' : 'key'}
          loading={state.loading}
          disabled={!hasTransactions}
          onPress={hasKey ? generate : () => router.navigate('/settings')}
        />
      )}
      {state.error && <Banner tone="error" message={state.error} />}
    </NotchCard>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Top padding clears the notch recess.
  card: { paddingTop: 24, paddingHorizontal: 16, paddingBottom: 16, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  muted: { fontFamily: Font.medium, fontSize: 13, lineHeight: 18, color: Colors.onLimeMuted },
  list: { gap: 12 },
  item: { flexDirection: 'row', gap: 10 },
  itemIcon: { marginTop: 1 },
});
