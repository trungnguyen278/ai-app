// SPDX-License-Identifier: MIT
import { useState, type ComponentRef, type Ref } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '../DesignProvider';
import { RADIUS, RING_WIDTH, SPACE, TARGET } from '../layout';
import { DISABLED_OPACITY } from '../palette';
import { TYPE } from '../typography';
import { Notice } from './Notice';
import { Text } from './Text';

/** What a field holds: the keyboard, and what the phone may fill it with, follow from it. */
export type FieldKind = 'text' | 'name' | 'email' | 'link';

/** A field's input, as its `ref` holds it. */
export type FieldInput = ComponentRef<typeof TextInput>;

const KINDS: Readonly<Record<FieldKind, Partial<TextInputProps>>> = {
  text: { autoCapitalize: 'sentences', autoComplete: 'off', textContentType: 'none' },
  name: {
    autoCapitalize: 'words',
    autoComplete: 'name',
    autoCorrect: false,
    textContentType: 'name',
  },
  email: {
    autoCapitalize: 'none',
    autoComplete: 'email',
    autoCorrect: false,
    keyboardType: 'email-address',
    textContentType: 'emailAddress',
  },
  // A link, typed or pasted, kept as it is: nothing capitalised or corrected in it.
  link: {
    autoCapitalize: 'none',
    autoComplete: 'off',
    autoCorrect: false,
    keyboardType: 'url',
    textContentType: 'URL',
  },
};

// The line around the field: thin at rest, the ring's width with focus or a fault. The padding
// gives back what the line takes, so that the text never moves.
const LINE = 1;
const PADDING = SPACE.md;

export interface TextFieldProps {
  /** What the field is for, always shown above it: a placeholder would go as one types. */
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  kind?: FieldKind;
  /** Help, below the field. */
  hint?: string;
  /** What is wrong with the value: below the field, in place of the hint. */
  error?: string;
  disabled?: boolean;
  /**
   * The key that ends the field, on the keyboard. With `next`, the keyboard stays, for the
   * field `onSubmitEditing` moves the focus to.
   */
  returnKeyType?: 'done' | 'next' | 'go';
  onSubmitEditing?: () => void;
  /** The input itself, to move the focus to it. */
  ref?: Ref<FieldInput>;
  /** Where it sits: its margins, its width. Its look is its own. */
  style?: StyleProp<ViewStyle>;
  /** How tests, and end-to-end tests, find the field. */
  testID?: string;
}

/**
 * A field to type in. Its label is above it, and help or what is wrong below it. The outline
 * shows where it is, the tone's ring that it has focus. What is wrong turns the ring to
 * danger's colour, and the message below says what: colour is never the only sign of it
 * (WCAG 1.4.1), and screen readers hear the message when it comes.
 */
export function TextField({
  label,
  value,
  onChangeText,
  kind = 'text',
  hint,
  error,
  disabled = false,
  returnKeyType,
  onSubmitEditing,
  ref,
  style,
  testID,
}: TextFieldProps) {
  const { color } = useTheme();
  const [focused, setFocused] = useState(false);
  const faulty = error !== undefined;
  const note = error ?? hint;
  const width = focused || faulty ? RING_WIDTH : LINE;
  const line = faulty ? color.danger : focused ? color.accent : color.outline;
  return (
    <View style={[styles.field, disabled && styles.disabled, style]}>
      <View aria-hidden>
        <Text variant="label">{label}</Text>
      </View>
      <TextInput
        ref={ref}
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        editable={!disabled}
        accessibilityLabel={label}
        accessibilityHint={note}
        accessibilityState={{ disabled }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        returnKeyType={returnKeyType}
        submitBehavior={returnKeyType === 'next' ? 'submit' : 'blurAndSubmit'}
        onSubmitEditing={onSubmitEditing}
        selectionColor={color.accent}
        cursorColor={color.accent}
        {...KINDS[kind]}
        style={[
          styles.input,
          {
            color: color.text,
            backgroundColor: color.fill,
            borderColor: line,
            borderWidth: width,
            paddingHorizontal: PADDING - (width - LINE),
          },
        ]}
      />
      {error !== undefined ? (
        <Notice role="alert" variant="caption" ink="danger">
          {error}
        </Notice>
      ) : (
        hint !== undefined && (
          <Text variant="caption" ink="textMuted">
            {hint}
          </Text>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: SPACE.xs },
  input: {
    minHeight: TARGET,
    borderRadius: RADIUS.md,
    paddingVertical: SPACE.sm,
    fontFamily: TYPE.body.fontFamily,
    fontSize: TYPE.body.fontSize,
  },
  disabled: { opacity: DISABLED_OPACITY },
});
