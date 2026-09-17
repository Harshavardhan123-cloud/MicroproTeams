export type MainTabParamList = {
  Channels: undefined;
  Chats: undefined;
  Contacts: undefined;
  Meetings: undefined;
  Activity: undefined;
  Settings: undefined;
};

export type ThreadRouteParams = {
  channelId: string;
  messageId: string;
  channelName?: string;
};

/**
 * `roomId` is the SFU room and MUST follow the same convention the web client
 * uses or the two clients land in different rooms:
 *  - 1:1 / group call -> `conversationId || 'direct-call-room'`
 *  - scheduled or instant meeting -> the meeting UUID
 *
 * `meetingId` is present only for meetings; when it is absent the room screen
 * skips the lobby and joins immediately, which is what the web call overlay does.
 */
export type MeetingRoomRouteParams = {
  roomId: string;
  displayName?: string;
  meetingId?: string;
  callType?: 'video' | 'audio';
  isHost?: boolean;
};

export type RootStackParamList = {
  MainTabs: undefined;
  Thread: ThreadRouteParams;
  MeetingRoom: MeetingRoomRouteParams;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
