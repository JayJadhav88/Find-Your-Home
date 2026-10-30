import { tokens } from "@fyh/shared";
import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

const { colors, spacing, radius, fontSize } = tokens;

// Minimum touch target recommended by both platforms.
const TOUCH = 48;

type Variant = "primary" | "secondary" | "danger" | "ghost" | "accent";

export function Button({
  label,
  variant = "primary",
  loading = false,
  disabled,
  style,
  ...props
}: Omit<PressableProps, "children" | "style"> & { label: string; variant?: Variant; loading?: boolean; style?: ViewStyle }) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(isDisabled), busy: loading }}
      accessibilityLabel={props.accessibilityLabel ?? label}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        buttonVariants[variant],
        pressed && !isDisabled ? { opacity: 0.85 } : null,
        isDisabled ? { opacity: 0.55 } : null,
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" || variant === "danger" ? colors.surface : variant === "accent" ? colors.brandStrong : colors.brand} />
      ) : (
        <Text style={[styles.buttonText, { color: variant === "primary" || variant === "danger" ? colors.surface : variant === "ghost" ? colors.brand : variant === "accent" ? colors.brandStrong : colors.text }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const buttonVariants: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.brand },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  danger: { backgroundColor: colors.danger },
  ghost: { backgroundColor: "transparent" },
  accent: { backgroundColor: colors.accent },
};

export function Field({
  label,
  error,
  hint,
  required,
  ...props
}: TextInputProps & { label: string; error?: string; hint?: string; required?: boolean }) {
  // Password fields get a Show / Hide button.
  const secret = props.secureTextEntry === true;
  const [revealed, setRevealed] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
      </Text>
      <View style={secret ? styles.secretRow : null}>
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, secret ? { flex: 1, paddingRight: 72 } : null, props.multiline ? { minHeight: 110, textAlignVertical: "top" } : null, error ? { borderColor: colors.danger } : null]}
          {...props}
          secureTextEntry={secret && !revealed}
        />
        {secret ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            onPress={() => setRevealed((value) => !value)}
            style={styles.secretToggle}
            hitSlop={8}
          >
            <Text style={styles.secretToggleText}>{revealed ? "Hide" : "Show"}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Row of mutually exclusive choices (used instead of a picker for short lists). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | "";
  options: Array<{ value: T | ""; label: string }>;
  onChange: (value: T | "") => void;
}) {
  return (
    <View style={styles.field} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.segmented}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value || "any"}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={[styles.segment, selected ? styles.segmentSelected : null]}
            >
              <Text style={[styles.segmentText, selected ? { color: colors.surface } : null]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Badge({ label, tone = "brand" }: { label: string; tone?: "brand" | "success" | "warning" | "danger" | "muted" }) {
  const palette = {
    brand: [colors.brandSoft, colors.brand],
    success: ["#E3F2E8", colors.success],
    warning: ["#F7EFD9", colors.warning],
    danger: ["#F8E1DF", colors.danger],
    muted: [colors.surfaceMuted, colors.textMuted],
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette[0] }]}>
      <Text style={[styles.badgeText, { color: palette[1] }]}>{label}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "success" | "warning" | "danger"; title?: string; children?: ReactNode }) {
  const border = { info: colors.brand, success: colors.success, warning: colors.warning, danger: colors.danger }[tone];
  return (
    <View style={[styles.notice, { borderColor: border }]} accessibilityRole={tone === "danger" ? "alert" : "text"} accessibilityLiveRegion="polite">
      {title ? <Text style={styles.noticeTitle}>{title}</Text> : null}
      {typeof children === "string" ? <Text style={styles.body}>{children}</Text> : children}
    </View>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={colors.brand} size="large" />
      <Text style={[styles.hint, { marginTop: spacing.sm }]}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={[styles.body, { textAlign: "center", marginVertical: spacing.sm }]}>{message}</Text>
      {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  return (
    <View style={[styles.card, { alignItems: "center", gap: spacing.sm }]}>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={[styles.body, { textAlign: "center", color: colors.textMuted }]}>{message}</Text> : null}
      {action}
    </View>
  );
}

export const text = StyleSheet.create({
  h1: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.text },
  h2: { fontSize: fontSize.xl, fontWeight: "600", color: colors.text },
  body: { fontSize: fontSize.md, color: colors.text, lineHeight: 22 },
  muted: { fontSize: fontSize.sm, color: colors.textMuted },
  link: { fontSize: fontSize.md, color: colors.brand, textDecorationLine: "underline" },
});

const styles = StyleSheet.create({
  button: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: fontSize.md, fontWeight: "600" },
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: "600", color: colors.text },
  secretRow: { flexDirection: "row", alignItems: "center" },
  secretToggle: { position: "absolute", right: 0, top: 0, bottom: 0, minWidth: 64, justifyContent: "center", alignItems: "center" },
  secretToggleText: { color: colors.brand, fontWeight: "700", fontSize: fontSize.sm },
  input: {
    minHeight: TOUCH,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  error: { fontSize: fontSize.sm, color: colors.danger },
  hint: { fontSize: fontSize.sm, color: colors.textMuted },
  segmented: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  segment: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "center",
  },
  segmentSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  segmentText: { fontSize: fontSize.sm, fontWeight: "600", color: colors.text },
  badge: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: fontSize.xs, fontWeight: "700" },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  notice: { borderLeftWidth: 4, borderRadius: radius.md, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.xs },
  noticeTitle: { fontSize: fontSize.md, fontWeight: "700", color: colors.text },
  body: { fontSize: fontSize.md, color: colors.text, lineHeight: 22 },
  title: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
});
