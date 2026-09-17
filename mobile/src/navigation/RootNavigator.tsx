import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import { ChannelsScreen } from '../screens/ChannelsScreen';
import { ChatsScreen } from '../screens/ChatsScreen';
import { ContactsScreen } from '../screens/ContactsScreen';
import { MeetingsScreen } from '../screens/MeetingsScreen';
import { ActivityScreen } from '../screens/ActivityScreen';
import { ProfileSettingsScreen } from '../screens/ProfileSettingsScreen';
import { ThreadScreen } from '../screens/ThreadScreen';
import { MeetingRoomScreen } from '../screens/MeetingRoomScreen';
import { AppTabBar } from './AppTabBar';
import type { MainTabParamList, RootStackParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function ContactsTabScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  return <ContactsScreen onOpenChat={() => navigation.navigate('Chats')} />;
}

function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Chats"
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <AppTabBar {...props} />}
    >
      <Tab.Screen name="Channels" component={ChannelsScreen} />
      <Tab.Screen name="Chats" component={ChatsScreen} />
      <Tab.Screen name="Contacts" component={ContactsTabScreen} />
      <Tab.Screen name="Meetings" component={MeetingsScreen} />
      <Tab.Screen name="Activity" component={ActivityScreen} />
      <Tab.Screen name="Settings" component={ProfileSettingsScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen
        name="Thread"
        component={ThreadScreen}
        options={{ presentation: 'card', animation: 'slide_from_right' }}
      />
      {/* gestureEnabled is off deliberately: a swipe-back must not silently drop
          a live call. The screen intercepts hardware back with a leave sheet. */}
      <Stack.Screen
        name="MeetingRoom"
        component={MeetingRoomScreen}
        options={{
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
          gestureEnabled: false,
        }}
      />
    </Stack.Navigator>
  );
}
