const MINIMUM_DESKTOP_CHAT_WIDTH_FOR_INLINE_HISTORY = 240;
const MINIMUM_DESKTOP_HISTORY_DRAWER_WIDTH = 220;
const MAX_HISTORY_DRAWER_WIDTH = 420;

export interface HistoryDrawerLayoutInput {
  compactViewport: boolean;
  chatShellWidth: number;
  historyDrawerVisible?: boolean;
  historyDrawerWidth: number;
}

export interface HistoryDrawerLayout {
  desktopHistoryOverlay: boolean;
  desktopHistoryFullOverlay: boolean;
  historyDrawerMaxWidth: number;
  computedHistoryDrawerWidth: number;
  historyDrawerStyle: {
    width: number | string;
  };
}

export const resolveHistoryDrawerLayout = ({
  compactViewport,
  chatShellWidth,
  historyDrawerVisible = true,
  historyDrawerWidth
}: HistoryDrawerLayoutInput): HistoryDrawerLayout => {
  const desktopHistoryOverlay =
    !compactViewport &&
    chatShellWidth > 0 &&
    chatShellWidth - Math.min(historyDrawerWidth, MAX_HISTORY_DRAWER_WIDTH) <
      MINIMUM_DESKTOP_CHAT_WIDTH_FOR_INLINE_HISTORY;
  const desktopHistoryFullOverlay =
    desktopHistoryOverlay && chatShellWidth >= 520;

  let historyDrawerMaxWidth = MAX_HISTORY_DRAWER_WIDTH;
  if (chatShellWidth > 0) {
    if (!compactViewport && desktopHistoryOverlay) {
      historyDrawerMaxWidth = Math.max(240, Math.min(360, chatShellWidth - 24));
    } else {
      const proportionalMax = Math.floor(chatShellWidth * 0.45);
      const maxInlineWidth = Math.max(
        MINIMUM_DESKTOP_HISTORY_DRAWER_WIDTH,
        chatShellWidth - MINIMUM_DESKTOP_CHAT_WIDTH_FOR_INLINE_HISTORY
      );
      historyDrawerMaxWidth = Math.min(
        MAX_HISTORY_DRAWER_WIDTH,
        Math.max(
          MINIMUM_DESKTOP_HISTORY_DRAWER_WIDTH,
          Math.min(proportionalMax, maxInlineWidth)
        )
      );
    }
  }

  const computedHistoryDrawerWidth = Math.min(
    historyDrawerWidth,
    historyDrawerMaxWidth
  );

  return {
    desktopHistoryOverlay,
    desktopHistoryFullOverlay,
    historyDrawerMaxWidth,
    computedHistoryDrawerWidth,
    historyDrawerStyle: {
      width: historyDrawerVisible
        ? desktopHistoryFullOverlay
          ? "calc(100% - 20px)"
          : computedHistoryDrawerWidth
        : 0
    }
  };
};
