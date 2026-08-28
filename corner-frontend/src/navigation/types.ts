// The navigation graph, as types. No screens yet — this is the shape they
// will be wired into.
//
// React Navigation native stack + bottom tabs, per CONVENTIONS.md. Expo Router
// is not used. Structure follows BRIEF Phase 3, with one deliberate change
// noted at ReaderStackParamList.

/**
 * Local stand-in for React Navigation's utility type.
 *
 * The navigator packages are not installed yet — screens are the next step and
 * the graph is under review first, so pulling the Expo/React Navigation tree in
 * to satisfy one type would commit to versions before the shape is agreed.
 *
 * Replace this with `import type { NavigatorScreenParams } from
 * "@react-navigation/native"` when the navigators land. The shape is
 * intentionally identical, so that swap is a one-line change.
 */
type NavigatorScreenParams<ParamList> =
  | { screen?: never; params?: never }
  | {
      [K in keyof ParamList]: undefined extends ParamList[K]
        ? { screen: K; params?: ParamList[K] }
        : { screen: K; params: ParamList[K] };
    }[keyof ParamList];

// ---- Onboarding -------------------------------------------------------------

export type OnboardingStackParamList = {
  Intro: undefined;
  Permissions: undefined;
  /** Also reachable from AccessGate anywhere in the app. */
  Paywall: { source: "onboarding" | "gate" | "settings"; feature?: string };
};

// ---- Library ----------------------------------------------------------------

export type LibrarySortKey = "updatedAt" | "createdAt" | "filename" | "byteSize";

export type LibraryStackParamList = {
  FileList: {
    folderId?: string;
    tag?: string;
    sort?: LibrarySortKey;
    direction?: "asc" | "desc";
  } | undefined;
  DocumentDetail: { documentId: string };
  /** The reader is its own stack so its modals do not pollute Library's. */
  Reader: NavigatorScreenParams<ReaderStackParamList> & { documentId: string };
};

// ---- Reader -----------------------------------------------------------------

/**
 * DEVIATION FROM BRIEF: the brief lists the annotation toolbar and share sheet
 * as reader stack routes. They are not routes — they are overlays on the
 * canvas that must not unmount it.
 *
 * Unmounting the canvas destroys the rendered text layers, and per ADR 0001 R1
 * a page must be RENDERED before its character offsets resolve. Pushing a route
 * over the reader during narration would drop the follow-along highlight and
 * force a re-render on dismiss. Anything that can be open while audio plays
 * stays a non-navigational overlay.
 *
 * What remains a route is what legitimately replaces the canvas.
 */
export type ReaderStackParamList = {
  Canvas: {
    documentId: string;
    /** Page to open at, else resume from Document.readingProgress. */
    page?: number;
    /** Highlight on open — used by chat citations and to-do provenance. */
    focusSpan?: { page: number; pageCharStart: number; pageCharEnd: number };
  };
  Outline: { documentId: string };
  Thumbnails: { documentId: string };
  Search: { documentId: string; query?: string };
  /** Merge / split / rotate / compress / protect / convert. */
  Tools: { documentId: string };
  /** Modal over the reader, per BRIEF. */
  Chat: { documentId: string; threadId?: string };
};

// ---- Listen -----------------------------------------------------------------

export type ListenStackParamList = {
  Player: { documentId: string; narrationId?: string };
  VoicePicker: { documentId: string; currentVoiceId?: string };
  Downloads: undefined;
};

// ---- To-dos -----------------------------------------------------------------

export type TodoStackParamList = {
  TodoList: { documentId?: string } | undefined;
  TodoDetail: { actionItemId: string };
  TodoExport: { documentId?: string };
};

// ---- Settings ---------------------------------------------------------------

export type SettingsStackParamList = {
  SettingsHome: undefined;
  Account: undefined;
  Subscription: undefined;
  Appearance: undefined;
  StorageAndOffline: undefined;
  PrivacyAndData: undefined;
  About: undefined;
};

// ---- Tabs and root ----------------------------------------------------------

export type MainTabParamList = {
  LibraryTab: NavigatorScreenParams<LibraryStackParamList>;
  ListenTab: NavigatorScreenParams<ListenStackParamList>;
  TodoTab: NavigatorScreenParams<TodoStackParamList>;
  SettingsTab: NavigatorScreenParams<SettingsStackParamList>;
};

export type RootStackParamList = {
  Onboarding: NavigatorScreenParams<OnboardingStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
  /** Root-level so it can cover tabs from any stack. */
  Paywall: { source: "gate" | "settings"; feature?: string };
};
