import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme/theme';

interface ClipNavigationProps {
  currentIndex: number;
  totalClips: number;
  onNext: () => void;
  onPrevious: () => void;
}

const ClipNavigation = ({
  currentIndex,
  totalClips,
  onNext,
  onPrevious,
}: ClipNavigationProps) => {
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalClips - 1;

  return (
    <View style={styles.container}>
      <Pressable
        onPress={!isFirst ? onPrevious : undefined}
        style={({ pressed }) => [
          styles.button,
          isFirst ? styles.disabled : pressed ? styles.pressed : styles.enabled,
        ]}
        android_ripple={{ color: colors.accent1 }}
      >
        <Text style={[styles.text, isFirst ? styles.textDisabled : styles.textEnabled]}>
          Previous
        </Text>
      </Pressable>

      <Text style={styles.indexText}>
        {currentIndex + 1} / {totalClips}
      </Text>

      <Pressable
        onPress={!isLast ? onNext : undefined}
        style={({ pressed }) => [
          styles.button,
          isLast ? styles.disabled : pressed ? styles.pressed : styles.enabled,
        ]}
        android_ripple={{ color: colors.accent1 }}
      >
        <Text style={[styles.text, isLast ? styles.textDisabled : styles.textEnabled]}>
          Next
        </Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 20,
    backgroundColor: colors.surface, // same as top bar background (surface)
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  enabled: {
    backgroundColor: colors.accent1, // dark teal (enabled)
  },
  disabled: {
    backgroundColor: colors.background, // blend with background, looks disabled
  },
  pressed: {
    backgroundColor: colors.accent2, // deep ruby when pressed
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
  textEnabled: {
    color: colors.textPrimary, // off-white text on enabled button
  },
  textDisabled: {
    color: colors.placeholder, // gray text on disabled button
  },
  indexText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textSecondary, // lighter text for index
  },
});

export default ClipNavigation;
