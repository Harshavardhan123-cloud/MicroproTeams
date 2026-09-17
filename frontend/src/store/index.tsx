import React, { createContext, useContext, useSyncExternalStore, ReactNode } from 'react';
import { User, Team, Channel } from '../types';
import { getToken, clearTokens, setTokens } from '../utils/token';

export interface AppNotification {
  id: string;
  title: string;
  body?: string;
  time?: string;
  unread?: boolean;
  is_read?: boolean;
  type?: string;
  created_at?: string;
  conversationId?: string;
  callId?: string;
  meetingId?: string;
}

// ============================================================================
// 1. GLOBAL STATE DEFINITION (ALL VARIABLES STORED IN ONE PLACE)
// ============================================================================

export type AppRailTab =
  | 'activity'
  | 'chat'
  | 'teams'
  | 'calendar'
  | 'calls'
  | 'files'
  | 'contacts'
  | 'compliance'
  | 'admin'
  | 'hierarchy';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface GlobalState {
  // --- Auth Variables ---
  auth: {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;
  };

  // --- UI & Navigation Variables ---
  ui: {
    activeTab: AppRailTab;
    activeTeamId: string | null;
    activeChannelId: string | null;
    activeDirectUserId: string | null;
    activeMeetingRoomId: string | null;
    isAppRailExpanded: boolean;
    isSettingsOpen: boolean;
    isCreateTeamOpen: boolean;
    isCreateChannelOpen: boolean;
    isAddMemberOpen: boolean;
    userSettingsOpen: boolean;
    aboutModalOpen: boolean;
    serverConfigOpen: boolean;
  };

  // --- Theme Variables ---
  theme: {
    mode: ThemeMode;
    effectiveTheme: 'light' | 'dark';
  };

  // --- Notification Variables ---
  notifications: {
    items: AppNotification[];
    unreadCount: number;
    unreadChatCount: number;
    mentionCount: number;
  };

  // --- Call & WebRTC Variables ---
  call: {
    activeCallId: string | null;
    roomName: string | null;
    inCall: boolean;
    isAudioMuted: boolean;
    isVideoMuted: boolean;
    isScreenSharing: boolean;
    activeSpeakerId: string | null;
    participants: any[];
  };

  // --- Network & Connectivity Variables ---
  network: {
    isOnline: boolean;
    serverUrl: string;
    serverStatus: 'connected' | 'disconnected' | 'connecting';
    lastHeartbeat: number | null;
  };

  // --- Dynamic Application-Wide Global Variables ---
  globals: Record<string, any>;
}

// Initial State with sensible defaults
export const initialGlobalState: GlobalState = {
  auth: {
    user: null,
    token: getToken(),
    isAuthenticated: !!getToken(),
    isLoading: false,
    error: null,
  },
  ui: {
    activeTab: 'chat',
    activeTeamId: null,
    activeChannelId: null,
    activeDirectUserId: null,
    activeMeetingRoomId: null,
    isAppRailExpanded: false,
    isSettingsOpen: false,
    isCreateTeamOpen: false,
    isCreateChannelOpen: false,
    isAddMemberOpen: false,
    userSettingsOpen: false,
    aboutModalOpen: false,
    serverConfigOpen: false,
  },
  theme: {
    mode: (localStorage.getItem('micropro_theme') as ThemeMode) || 'dark',
    effectiveTheme: 'dark',
  },
  notifications: {
    items: [],
    unreadCount: 0,
    unreadChatCount: 0,
    mentionCount: 0,
  },
  call: {
    activeCallId: null,
    roomName: null,
    inCall: false,
    isAudioMuted: false,
    isVideoMuted: false,
    isScreenSharing: false,
    activeSpeakerId: null,
    participants: [],
  },
  network: {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    serverUrl: '',
    serverStatus: 'connected',
    lastHeartbeat: Date.now(),
  },
  globals: {},
};

// ============================================================================
// 2. REDUX ACTIONS & TYPES
// ============================================================================

export type Action =
  // Auth Actions
  | { type: 'AUTH_SET_USER'; payload: User | null }
  | { type: 'AUTH_SET_TOKEN'; payload: string | null }
  | { type: 'AUTH_SET_LOADING'; payload: boolean }
  | { type: 'AUTH_SET_ERROR'; payload: string | null }
  | { type: 'AUTH_LOGOUT' }

  // UI Actions
  | { type: 'UI_SET_TAB'; payload: AppRailTab }
  | { type: 'UI_SET_ACTIVE_TEAM'; payload: string | null }
  | { type: 'UI_SET_ACTIVE_CHANNEL'; payload: string | null }
  | { type: 'UI_SET_ACTIVE_DIRECT_USER'; payload: string | null }
  | { type: 'UI_SET_MEETING_ROOM'; payload: string | null }
  | { type: 'UI_TOGGLE_APP_RAIL' }
  | { type: 'UI_SET_APP_RAIL_EXPANDED'; payload: boolean }
  | { type: 'UI_SET_MODAL'; payload: { modal: keyof GlobalState['ui']; isOpen: boolean } }

  // Theme Actions
  | { type: 'THEME_SET_MODE'; payload: ThemeMode }
  | { type: 'THEME_SET_EFFECTIVE'; payload: 'light' | 'dark' }

  // Notification Actions
  | { type: 'NOTIF_SET_ITEMS'; payload: AppNotification[] }
  | { type: 'NOTIF_ADD_ITEM'; payload: AppNotification }
  | { type: 'NOTIF_SET_UNREAD'; payload: { total?: number; chat?: number; mention?: number } }
  | { type: 'NOTIF_MARK_ALL_READ' }

  // Call Actions
  | { type: 'CALL_START'; payload: { callId: string; roomName?: string } }
  | { type: 'CALL_END' }
  | { type: 'CALL_TOGGLE_AUDIO'; payload?: boolean }
  | { type: 'CALL_TOGGLE_VIDEO'; payload?: boolean }
  | { type: 'CALL_TOGGLE_SCREEN_SHARE'; payload?: boolean }
  | { type: 'CALL_SET_PARTICIPANTS'; payload: any[] }

  // Network Actions
  | { type: 'NETWORK_SET_ONLINE'; payload: boolean }
  | { type: 'NETWORK_SET_STATUS'; payload: 'connected' | 'disconnected' | 'connecting' }
  | { type: 'NETWORK_SET_SERVER_URL'; payload: string }

  // Global Dynamic Variable Actions
  | { type: 'SET_GLOBAL_VARIABLE'; payload: { key: string; value: any } }
  | { type: 'BATCH_SET_GLOBAL_VARIABLES'; payload: Record<string, any> }
  | { type: 'RESET_GLOBAL_STATE' };

// ============================================================================
// 3. REDUX ROOT REDUCER (PURE IMMUTABLE STATE MACHINE)
// ============================================================================

export function globalReducer(state: GlobalState = initialGlobalState, action: Action): GlobalState {
  switch (action.type) {
    // --- Auth Reducers ---
    case 'AUTH_SET_USER':
      return {
        ...state,
        auth: {
          ...state.auth,
          user: action.payload,
          isAuthenticated: !!action.payload,
          isLoading: false,
          error: null,
        },
      };

    case 'AUTH_SET_TOKEN':
      return {
        ...state,
        auth: {
          ...state.auth,
          token: action.payload,
          isAuthenticated: !!action.payload,
        },
      };

    case 'AUTH_SET_LOADING':
      return {
        ...state,
        auth: { ...state.auth, isLoading: action.payload },
      };

    case 'AUTH_SET_ERROR':
      return {
        ...state,
        auth: { ...state.auth, error: action.payload, isLoading: false },
      };

    case 'AUTH_LOGOUT':
      clearTokens();
      return {
        ...state,
        auth: {
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        },
        ui: {
          ...state.ui,
          activeChannelId: null,
          activeDirectUserId: null,
          activeMeetingRoomId: null,
        },
        call: {
          ...initialGlobalState.call,
        },
      };

    // --- UI Reducers ---
    case 'UI_SET_TAB':
      return {
        ...state,
        ui: { ...state.ui, activeTab: action.payload },
      };

    case 'UI_SET_ACTIVE_TEAM':
      return {
        ...state,
        ui: { ...state.ui, activeTeamId: action.payload },
      };

    case 'UI_SET_ACTIVE_CHANNEL':
      return {
        ...state,
        ui: {
          ...state.ui,
          activeChannelId: action.payload,
          activeDirectUserId: null,
        },
      };

    case 'UI_SET_ACTIVE_DIRECT_USER':
      return {
        ...state,
        ui: {
          ...state.ui,
          activeDirectUserId: action.payload,
          activeChannelId: null,
        },
      };

    case 'UI_SET_MEETING_ROOM':
      return {
        ...state,
        ui: { ...state.ui, activeMeetingRoomId: action.payload },
      };

    case 'UI_TOGGLE_APP_RAIL':
      return {
        ...state,
        ui: { ...state.ui, isAppRailExpanded: !state.ui.isAppRailExpanded },
      };

    case 'UI_SET_APP_RAIL_EXPANDED':
      return {
        ...state,
        ui: { ...state.ui, isAppRailExpanded: action.payload },
      };

    case 'UI_SET_MODAL':
      return {
        ...state,
        ui: {
          ...state.ui,
          [action.payload.modal]: action.payload.isOpen,
        },
      };

    // --- Theme Reducers ---
    case 'THEME_SET_MODE': {
      const mode = action.payload;
      localStorage.setItem('micropro_theme', mode);
      const isDark =
        mode === 'dark' ||
        (mode === 'system' &&
          typeof window !== 'undefined' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches);

      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark', isDark);
      }

      return {
        ...state,
        theme: {
          mode,
          effectiveTheme: isDark ? 'dark' : 'light',
        },
      };
    }

    case 'THEME_SET_EFFECTIVE':
      return {
        ...state,
        theme: { ...state.theme, effectiveTheme: action.payload },
      };

    // --- Notification Reducers ---
    case 'NOTIF_SET_ITEMS':
      return {
        ...state,
        notifications: {
          ...state.notifications,
          items: action.payload,
          unreadCount: action.payload.filter((n) => !n.is_read).length,
        },
      };

    case 'NOTIF_ADD_ITEM': {
      const updated = [action.payload, ...state.notifications.items];
      return {
        ...state,
        notifications: {
          ...state.notifications,
          items: updated,
          unreadCount: state.notifications.unreadCount + 1,
        },
      };
    }

    case 'NOTIF_SET_UNREAD':
      return {
        ...state,
        notifications: {
          ...state.notifications,
          unreadCount: action.payload.total ?? state.notifications.unreadCount,
          unreadChatCount: action.payload.chat ?? state.notifications.unreadChatCount,
          mentionCount: action.payload.mention ?? state.notifications.mentionCount,
        },
      };

    case 'NOTIF_MARK_ALL_READ':
      return {
        ...state,
        notifications: {
          ...state.notifications,
          items: state.notifications.items.map((n) => ({ ...n, is_read: true })),
          unreadCount: 0,
          unreadChatCount: 0,
          mentionCount: 0,
        },
      };

    // --- Call Reducers ---
    case 'CALL_START':
      return {
        ...state,
        call: {
          ...state.call,
          activeCallId: action.payload.callId,
          roomName: action.payload.roomName || 'Meeting',
          inCall: true,
        },
      };

    case 'CALL_END':
      return {
        ...state,
        call: {
          ...initialGlobalState.call,
        },
      };

    case 'CALL_TOGGLE_AUDIO':
      return {
        ...state,
        call: {
          ...state.call,
          isAudioMuted: action.payload !== undefined ? action.payload : !state.call.isAudioMuted,
        },
      };

    case 'CALL_TOGGLE_VIDEO':
      return {
        ...state,
        call: {
          ...state.call,
          isVideoMuted: action.payload !== undefined ? action.payload : !state.call.isVideoMuted,
        },
      };

    case 'CALL_TOGGLE_SCREEN_SHARE':
      return {
        ...state,
        call: {
          ...state.call,
          isScreenSharing: action.payload !== undefined ? action.payload : !state.call.isScreenSharing,
        },
      };

    case 'CALL_SET_PARTICIPANTS':
      return {
        ...state,
        call: { ...state.call, participants: action.payload },
      };

    // --- Network Reducers ---
    case 'NETWORK_SET_ONLINE':
      return {
        ...state,
        network: { ...state.network, isOnline: action.payload },
      };

    case 'NETWORK_SET_STATUS':
      return {
        ...state,
        network: { ...state.network, serverStatus: action.payload },
      };

    case 'NETWORK_SET_SERVER_URL':
      return {
        ...state,
        network: { ...state.network, serverUrl: action.payload },
      };

    // --- Dynamic Global Variables Reducer ---
    case 'SET_GLOBAL_VARIABLE':
      return {
        ...state,
        globals: {
          ...state.globals,
          [action.payload.key]: action.payload.value,
        },
      };

    case 'BATCH_SET_GLOBAL_VARIABLES':
      return {
        ...state,
        globals: {
          ...state.globals,
          ...action.payload,
        },
      };

    case 'RESET_GLOBAL_STATE':
      return {
        ...initialGlobalState,
      };

    default:
      return state;
  }
}

// ============================================================================
// 4. REDUX STORE IMPLEMENTATION (SINGLETON WITH PUB/SUB)
// ============================================================================

export interface ReduxStore {
  getState: () => GlobalState;
  dispatch: (action: Action) => Action;
  subscribe: (listener: () => void) => () => void;
}

function createReduxStore(
  reducer: (state: GlobalState, action: Action) => GlobalState,
  preloadedState: GlobalState
): ReduxStore {
  let currentState = preloadedState;
  const listeners = new Set<() => void>();
  let isDispatching = false;

  return {
    getState: () => currentState,
    dispatch: (action: Action) => {
      if (isDispatching) {
        throw new Error('Redux Error: Reducers may not dispatch actions.');
      }
      try {
        isDispatching = true;
        currentState = reducer(currentState, action);
      } finally {
        isDispatching = false;
      }
      listeners.forEach((listener) => listener());
      return action;
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// Global Singleton Store Instance
export const store = createReduxStore(globalReducer, initialGlobalState);

// ============================================================================
// 5. REACT CONTEXT & HOOKS (TEAR-FREE REACT 18 SUBSCRIPTION)
// ============================================================================

const ReduxContext = createContext<ReduxStore>(store);

export const ReduxProvider: React.FC<{ store?: ReduxStore; children: ReactNode }> = ({
  store: customStore = store,
  children,
}) => {
  return <ReduxContext.Provider value={customStore}>{children}</ReduxContext.Provider>;
};

/**
 * Standard Redux useSelector hook.
 * Selects any slice or variable from the global store with automatic re-rendering on change.
 */
export function useAppSelector<T>(selector: (state: GlobalState) => T): T {
  const activeStore = useContext(ReduxContext) || store;
  return useSyncExternalStore(
    activeStore.subscribe,
    () => selector(activeStore.getState()),
    () => selector(initialGlobalState)
  );
}

/**
 * Standard Redux useDispatch hook.
 */
export function useAppDispatch() {
  const activeStore = useContext(ReduxContext) || store;
  return activeStore.dispatch;
}

// ============================================================================
// 6. GLOBAL VARIABLE APPROACH HOOK & IMPERATIVE APIS
// ============================================================================

/**
 * Global Variable Approach Hook:
 * Read and set ANY variable from anywhere in the app with a simple useState-like signature!
 *
 * Example:
 *   const [activeTab, setActiveTab] = useGlobalVariable('activeTab');
 *   const [user, setUser] = useGlobalVariable('user');
 *   const [customFlag, setCustomFlag] = useGlobalVariable('myCustomFeatureFlag');
 */
export function useGlobalVariable<T = any>(variableName: string): [T, (newValue: T) => void] {
  const dispatch = useAppDispatch();

  // Look up known core slices or dynamic globals
  const value = useAppSelector((state: GlobalState) => {
    if (variableName in state.ui) return (state.ui as any)[variableName];
    if (variableName in state.auth) return (state.auth as any)[variableName];
    if (variableName in state.theme) return (state.theme as any)[variableName];
    if (variableName in state.notifications) return (state.notifications as any)[variableName];
    if (variableName in state.call) return (state.call as any)[variableName];
    if (variableName in state.network) return (state.network as any)[variableName];
    return state.globals[variableName];
  });

  const setVariable = (newValue: T) => {
    // Route to specialized reducer actions if recognized, otherwise set dynamic global
    switch (variableName) {
      case 'activeTab':
        dispatch({ type: 'UI_SET_TAB', payload: newValue as any });
        break;
      case 'activeChannelId':
        dispatch({ type: 'UI_SET_ACTIVE_CHANNEL', payload: newValue as any });
        break;
      case 'activeDirectUserId':
        dispatch({ type: 'UI_SET_ACTIVE_DIRECT_USER', payload: newValue as any });
        break;
      case 'activeTeamId':
        dispatch({ type: 'UI_SET_ACTIVE_TEAM', payload: newValue as any });
        break;
      case 'user':
        dispatch({ type: 'AUTH_SET_USER', payload: newValue as any });
        break;
      case 'mode':
      case 'theme':
        dispatch({ type: 'THEME_SET_MODE', payload: newValue as any });
        break;
      default:
        dispatch({ type: 'SET_GLOBAL_VARIABLE', payload: { key: variableName, value: newValue } });
        break;
    }
  };

  return [value, setVariable];
}

/**
 * Entire Global State hook:
 * Returns the entire state snapshot and dispatch function.
 */
export function useGlobalState(): [GlobalState, (action: Action) => void] {
  const state = useAppSelector((s) => s);
  const dispatch = useAppDispatch();
  return [state, dispatch];
}

// ============================================================================
// 7. IMPERATIVE APIS (CALLABLE OUTSIDE REACT COMPONENTS: WEBSOCKETS, UTILS, ETC.)
// ============================================================================

export function getGlobalState(): GlobalState {
  return store.getState();
}

export function dispatchGlobal(action: Action): Action {
  return store.dispatch(action);
}

export function getGlobalVariable<T = any>(key: string): T {
  const state = store.getState();
  if (key in state.ui) return (state.ui as any)[key];
  if (key in state.auth) return (state.auth as any)[key];
  if (key in state.theme) return (state.theme as any)[key];
  if (key in state.notifications) return (state.notifications as any)[key];
  if (key in state.call) return (state.call as any)[key];
  if (key in state.network) return (state.network as any)[key];
  return state.globals[key];
}

export function setGlobalVariable<T = any>(key: string, value: T): void {
  store.dispatch({
    type: 'SET_GLOBAL_VARIABLE',
    payload: { key, value },
  });
}

// ============================================================================
// 8. TYPED ACTION CREATORS
// ============================================================================

export const actions = {
  // Auth
  setUser: (user: User | null): Action => ({ type: 'AUTH_SET_USER', payload: user }),
  setToken: (token: string | null): Action => ({ type: 'AUTH_SET_TOKEN', payload: token }),
  setAuthLoading: (isLoading: boolean): Action => ({ type: 'AUTH_SET_LOADING', payload: isLoading }),
  logout: (): Action => ({ type: 'AUTH_LOGOUT' }),

  // UI
  setActiveTab: (tab: AppRailTab): Action => ({ type: 'UI_SET_TAB', payload: tab }),
  setActiveTeam: (teamId: string | null): Action => ({ type: 'UI_SET_ACTIVE_TEAM', payload: teamId }),
  setActiveChannel: (channelId: string | null): Action => ({ type: 'UI_SET_ACTIVE_CHANNEL', payload: channelId }),
  setActiveDirectUser: (userId: string | null): Action => ({ type: 'UI_SET_ACTIVE_DIRECT_USER', payload: userId }),
  setActiveMeetingRoom: (roomId: string | null): Action => ({ type: 'UI_SET_MEETING_ROOM', payload: roomId }),
  toggleAppRail: (): Action => ({ type: 'UI_TOGGLE_APP_RAIL' }),
  setModal: (modal: keyof GlobalState['ui'], isOpen: boolean): Action => ({
    type: 'UI_SET_MODAL',
    payload: { modal, isOpen },
  }),

  // Theme
  setThemeMode: (mode: ThemeMode): Action => ({ type: 'THEME_SET_MODE', payload: mode }),

  // Notifications
  setNotifications: (items: AppNotification[]): Action => ({ type: 'NOTIF_SET_ITEMS', payload: items }),
  addNotification: (item: AppNotification): Action => ({ type: 'NOTIF_ADD_ITEM', payload: item }),
  markAllNotificationsRead: (): Action => ({ type: 'NOTIF_MARK_ALL_READ' }),

  // Calls
  startCall: (callId: string, roomName?: string): Action => ({ type: 'CALL_START', payload: { callId, roomName } }),
  endCall: (): Action => ({ type: 'CALL_END' }),
  toggleAudio: (muted?: boolean): Action => ({ type: 'CALL_TOGGLE_AUDIO', payload: muted }),
  toggleVideo: (muted?: boolean): Action => ({ type: 'CALL_TOGGLE_VIDEO', payload: muted }),
  toggleScreenShare: (sharing?: boolean): Action => ({ type: 'CALL_TOGGLE_SCREEN_SHARE', payload: sharing }),

  // Globals
  setGlobalVar: (key: string, value: any): Action => ({ type: 'SET_GLOBAL_VARIABLE', payload: { key, value } }),
  resetGlobalState: (): Action => ({ type: 'RESET_GLOBAL_STATE' }),
};
