import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { colors } from '../lib/theme';

export type SheetOption = { label: string; onPress?(): void; destructive?: boolean };
type Sheet = { title?: string; message?: string; options: SheetOption[]; cancelLabel?: string };

// `sheet` outlives `open` so the content stays put while the sheet animates away.
const useSheet = create<{ sheet: Sheet | null; open: boolean }>(() => ({
  sheet: null,
  open: false,
}));

/**
 * Menus and confirmations that work on iOS, Android and web alike
 * (`Alert` with buttons is a no-op on web). An option may open another sheet.
 */
export const showSheet = (sheet: Sheet) => useSheet.setState({ sheet, open: true });

/** A message with a single OK button. */
export const notify = (title: string, message?: string) =>
  showSheet({ title, message, options: [], cancelLabel: 'OK' });

/** Rendered once, in the root layout. */
export function ActionSheetHost() {
  const { sheet, open } = useSheet();
  const close = () => useSheet.setState({ open: false });
  const choose = (option: SheetOption) => {
    close();
    option.onPress?.();
  };

  return (
    <Modal
      visible={open}
      transparent
      // react-native-web's fade can leave the closed modal painted on screen.
      animationType={Platform.OS === 'web' ? 'none' : 'fade'}
      onRequestClose={close}
    >
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close menu">
        <SafeAreaView edges={['bottom']} style={styles.wrap}>
          {/* Swallow taps on the sheet itself so they don't close it. */}
          <Pressable style={styles.sheet} onPress={() => {}} accessibilityRole="menu">
            {(sheet?.title || sheet?.message) && (
              <View style={styles.head}>
                {!!sheet.title && <Text style={styles.title}>{sheet.title}</Text>}
                {!!sheet.message && <Text style={styles.message}>{sheet.message}</Text>}
              </View>
            )}
            {sheet?.options.map((option) => (
              <Pressable
                key={option.label}
                style={styles.option}
                onPress={() => choose(option)}
                accessibilityRole="menuitem"
              >
                <Text style={[styles.optionText, option.destructive && styles.destructive]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </Pressable>
          <Pressable
            style={[styles.sheet, styles.cancel]}
            onPress={close}
            accessibilityRole="button"
          >
            <Text style={[styles.optionText, styles.cancelText]}>
              {sheet?.cancelLabel ?? 'Cancel'}
            </Text>
          </Pressable>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  wrap: { padding: 10, gap: 8, width: '100%', maxWidth: 500, alignSelf: 'center' },
  sheet: { backgroundColor: colors.bg, borderRadius: 14, overflow: 'hidden' },
  head: {
    padding: 14,
    gap: 4,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  title: { fontSize: 14, fontWeight: '600', color: colors.muted, textAlign: 'center' },
  message: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  option: {
    paddingVertical: 15,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  optionText: { fontSize: 17, color: colors.accent },
  destructive: { color: colors.danger },
  cancel: { paddingVertical: 15, alignItems: 'center' },
  cancelText: { fontWeight: '600' },
});
