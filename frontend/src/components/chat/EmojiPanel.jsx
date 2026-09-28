import EmojiPicker, { EmojiStyle, Theme } from 'emoji-picker-react';
import { useTheme } from '../../context/ThemeContext';

// Loaded lazily by the composer — the full emoji set is a sizeable bundle.
export default function EmojiPanel({ onPick }) {
  const { theme } = useTheme();
  return (
    <div className="composer-panel emoji-panel">
      <EmojiPicker
        onEmojiClick={(data) => onPick(data.emoji)}
        theme={theme === 'dark' ? Theme.DARK : Theme.LIGHT}
        emojiStyle={EmojiStyle.NATIVE}
        lazyLoadEmojis
        autoFocusSearch={false}
        previewConfig={{ showPreview: false }}
        searchPlaceholder="Search emoji"
        width="100%"
        height="100%"
      />
    </div>
  );
}
