import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Backdrop,
  Button,
  Card,
  Chip,
  IconBubble,
  IconButton,
  ScreenTitle,
  useTabBarClearance,
} from '@/components/ui';
import { Icon } from '@/components/icon';
import { Colors, Font, MaxContentWidth, Radius, Shadow, Spacing } from '@/constants/theme';
import { useKeyboardVisible } from '@/hooks/use-keyboard-visible';
import { agentInstructions, AGENT_TOOLS, runAgentTool } from '@/lib/agent';
import { buildChatContext } from '@/lib/analytics';
import { buildLedger } from '@/lib/money';
import { useApiKey } from '@/lib/api-key';
import { runAgentReply } from '@/lib/openai';
import { getApiKey } from '@/lib/secret-store';
import { useStore, type DataSnapshot } from '@/lib/store';
import type { ChatMessage } from '@/lib/types';

const SUGGESTIONS = [
  'How much did I spend on food this month?',
  'Move all my Uber rides to Transport',
  'Add a $12 lunch for today',
  'What was my biggest expense recently?',
];

/**
 * The data as it was before each reply that changed something, keyed by that reply's id, so its
 * Undo can put it back. Kept in memory only: after the app restarts, past changes stay.
 */
const undoSnapshots = new Map<string, DataSnapshot>();

let idCounter = 0;

function makeMessage(role: ChatMessage['role'], content: string, error?: boolean): ChatMessage {
  const now = Date.now();
  return { id: `${now}-${idCounter++}`, role, content, createdAt: now, ...(error ? { error } : null) };
}

export default function AssistantScreen() {
  const chat = useStore((s) => s.chat);
  const appendChat = useStore((s) => s.appendChat);
  const clearChat = useStore((s) => s.clearChat);
  const hasKey = useApiKey((s) => s.hasKey);
  const clearance = useTabBarClearance();
  const keyboardVisible = useKeyboardVisible();
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  async function send(text: string) {
    const content = text.trim();
    if (!content || thinking) return;
    setDraft('');
    appendChat(makeMessage('user', content));
    setThinking(true);
    const state = useStore.getState();
    const before: DataSnapshot = {
      transactions: state.transactions,
      accounts: state.accounts,
      settings: state.settings,
      processed: state.processed,
    };
    const actions: string[] = [];
    // Keeps what changed, and lets it be undone, even when the reply itself fails part way.
    const finish = (message: ChatMessage) => {
      if (actions.length) {
        message.actions = actions;
        undoSnapshots.set(message.id, before);
      }
      appendChat(message);
    };
    try {
      const apiKey = await getApiKey();
      if (!apiKey) throw new Error('Add your OpenAI API key in Settings to chat.');
      // Read again: the question was just added to the chat.
      const { settings, chat: history } = useStore.getState();
      // The assistant reasons over the same converted figures the screens show.
      const ledger = buildLedger(state);
      const context = buildChatContext(ledger.transactions, ledger.currency, ledger.accounts);
      const reply = await runAgentReply({
        apiKey,
        model: settings.model,
        instructions: agentInstructions({ currency: settings.currency, financeContext: context }),
        history,
        tools: AGENT_TOOLS,
        execute: async (name, args) => {
          const outcome = await runAgentTool(name, args);
          if (outcome.action) actions.push(outcome.action);
          return outcome.result;
        },
      });
      finish(makeMessage('assistant', reply.trim()));
    } catch (e) {
      finish(makeMessage('assistant', e instanceof Error ? e.message : String(e), true));
    } finally {
      setThinking(false);
    }
  }

  function undo(message: ChatMessage) {
    const snapshot = undoSnapshots.get(message.id);
    if (!snapshot) return;
    useStore.getState().restoreData(snapshot);
    undoSnapshots.delete(message.id);
    useStore.getState().updateChatMessage(message.id, { undone: true });
  }

  // Only the latest set of changes can be undone: undoing an older one would also wipe the newer.
  const undoableId = [...chat].reverse().find((m) => m.actions?.length && !m.undone)?.id;

  const canChat = !!hasKey;
  const canSend = canChat && !!draft.trim() && !thinking;

  return (
    <View style={styles.screen}>
      <Backdrop />
      <SafeAreaView edges={['top']} style={styles.fill}>
        <KeyboardAvoidingView style={styles.fill} behavior="padding">
          <View style={styles.header}>
            <ScreenTitle
              title="Ask AI"
              subtitle="Ask about your money, or tell it what to change"
              right={
                chat.length > 0 ? (
                  <IconButton icon="plus" label="New chat" onPress={clearChat} disabled={thinking} />
                ) : undefined
              }
            />
          </View>

          <FlatList
            ref={listRef}
            data={chat}
            keyExtractor={(m) => m.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Bubble
                message={item}
                onUndo={item.id === undoableId && undoSnapshots.has(item.id) ? () => undo(item) : undefined}
              />
            )}
            ListEmptyComponent={
              <View style={styles.intro}>
                <Card style={styles.introCard}>
                  <IconBubble name="sparkle" tone="lime" size={52} />
                  <AppText variant="heading" style={styles.center}>
                    Ask, or tell it what to do
                  </AppText>
                  <AppText variant="caption" color="textSecondary" style={styles.center}>
                    It answers questions and can add, edit or delete transactions and accounts for you. Every
                    change can be undone. Your messages and a summary of your data are sent to OpenAI.
                  </AppText>
                  {!hasKey && <Button label="Add OpenAI key" icon="key" onPress={() => router.navigate('/settings')} />}
                </Card>
                {canChat && (
                  <View style={styles.suggestions}>
                    {SUGGESTIONS.map((s) => (
                      <Chip key={s} label={s} onPress={() => send(s)} />
                    ))}
                  </View>
                )}
              </View>
            }
            ListFooterComponent={
              thinking ? (
                <View style={[styles.bubble, styles.assistantBubble]}>
                  <ActivityIndicator size="small" color={Colors.textSecondary} />
                </View>
              ) : undefined
            }
          />

          {/* While typing, the tab bar hides and the composer sits on the keyboard. */}
          <View style={[styles.composer, { paddingBottom: keyboardVisible ? Spacing.two : clearance - Spacing.three }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={canChat ? 'Ask, or say what to change…' : 'Add a key to start chatting'}
              placeholderTextColor={Colors.textTertiary}
              editable={canChat}
              multiline
              style={styles.input}
              onSubmitEditing={() => send(draft)}
              submitBehavior="submit"
              returnKeyType="send"
              accessibilityLabel="Message"
            />
            <IconButton icon="send" label="Send" tone="forest" size={50} onPress={() => send(draft)} disabled={!canSend} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function Bubble({ message, onUndo }: { message: ChatMessage; onUndo?: () => void }) {
  const isUser = message.role === 'user';
  return (
    <View
      style={[
        styles.bubble,
        isUser ? styles.userBubble : styles.assistantBubble,
        message.error && styles.errorBubble,
      ]}>
      <Text
        selectable
        style={[styles.bubbleText, isUser && styles.userText, message.error && styles.errorText]}>
        {message.content}
      </Text>
      {!!message.actions?.length && (
        <View style={styles.actions}>
          {message.actions.map((a, i) => (
            <View key={i} style={styles.actionRow}>
              <Icon name="check" size={14} color={message.undone ? Colors.textTertiary : Colors.accent} />
              <Text style={[styles.actionText, message.undone && styles.undoneText]}>{a}</Text>
            </View>
          ))}
          {message.undone ? (
            <Text style={styles.undoneLabel}>Undone</Text>
          ) : (
            onUndo && <Button label="Undo" icon="back" variant="secondary" compact onPress={onUndo} style={styles.undo} />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  header: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  list: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  listContent: { padding: Spacing.three, gap: 10, flexGrow: 1 },
  intro: { gap: Spacing.three },
  introCard: { alignItems: 'center', gap: 12, paddingVertical: Spacing.four },
  suggestions: { gap: 8, alignItems: 'flex-start' },
  bubble: { maxWidth: '86%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: Radius.lg },
  userBubble: { alignSelf: 'flex-end', backgroundColor: Colors.forest, borderBottomRightRadius: 6 },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.card,
    borderBottomLeftRadius: 6,
    ...Shadow.card,
  },
  errorBubble: { backgroundColor: Colors.negativeSoft },
  bubbleText: { fontFamily: Font.medium, fontSize: 15, lineHeight: 21, color: Colors.text },
  userText: { color: Colors.onForest },
  errorText: { color: Colors.negative },
  actions: {
    marginTop: 10,
    paddingTop: 10,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  actionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  actionText: { flex: 1, fontFamily: Font.semibold, fontSize: 13, lineHeight: 18, color: Colors.text },
  undoneText: { color: Colors.textTertiary, textDecorationLine: 'line-through' },
  undoneLabel: { fontFamily: Font.semibold, fontSize: 12, color: Colors.textTertiary },
  undo: { alignSelf: 'flex-start', marginTop: 2 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  input: {
    flex: 1,
    minHeight: 50,
    maxHeight: 120,
    borderRadius: 25,
    backgroundColor: Colors.card,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    fontFamily: Font.medium,
    fontSize: 15,
    color: Colors.text,
    ...Shadow.card,
  },
});
