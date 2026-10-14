import { Platform } from 'react-native';

/** React Native Web handles Enter, but checkbox/radio Pressables also need Space. */
export function selectionKeyboardProps(onSelect: () => void, disabled = false) {
  return Platform.OS === 'web'
    ? {
        onKeyDown: (event: { key: string; repeat: boolean; preventDefault: () => void }) => {
          if (event.key !== ' ' && event.key !== 'Spacebar') return;
          event.preventDefault();
          if (!disabled && !event.repeat) onSelect();
        },
      }
    : {};
}
