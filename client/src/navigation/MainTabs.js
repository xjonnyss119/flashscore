import React, { useState, useEffect, useRef } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import api from "../api/api";

import MatchesScreen from "../screens/MatchesScreen";
import StandingsScreen from "../screens/StandingsScreen";
import FavoritesScreen from "../screens/FavoritesScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import ProfileScreen from "../screens/ProfileScreen";

const Tab = createBottomTabNavigator();

const icon =
  (emoji, showBadge = false) =>
  ({ focused }) => (
    <View
      style={{
        width: 24,
        height: 24,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
      {showBadge && (
        <View
          style={{
            position: "absolute",
            right: -2,
            top: -2,
            backgroundColor: "#ff1744",
            width: 8,
            height: 8,
            borderRadius: 4,
            borderWidth: 1,
            borderColor: "#1a1a2e",
          }}
        />
      )}
    </View>
  );

export default function MainTabs() {
  const { user } = useAuth();
  const [hasUnread, setHasUnread] = useState(false);
  const isCurrentScreenNotifications = useRef(false);

  const checkNotifications = async () => {
    if (isCurrentScreenNotifications.current) return;
    try {
      const response = await api.get("/user/notifications");
      const unreadExists = response.data.some((notif) => !notif.is_read);
      setHasUnread(unreadExists);
    } catch (error) {
      console.error("[BADGE] Ошибка проверки уведомлений:", error.message);
    }
  };

  useEffect(() => {
    checkNotifications();
    const interval = setInterval(checkNotifications, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: { backgroundColor: "#1a1a2e", borderTopColor: "#333" },
        tabBarActiveTintColor: "#00c853",
        tabBarInactiveTintColor: "#aaa",
        headerStyle: { backgroundColor: "#1a1a2e" },
        headerTintColor: "#fff",
      }}
    >
      <Tab.Screen
        name="Матчи"
        component={MatchesScreen}
        options={{ tabBarIcon: icon("⚽️") }}
        listeners={{
          focus: () => {
            isCurrentScreenNotifications.current = false;
          },
        }}
      />
      <Tab.Screen
        name="Таблицы"
        component={StandingsScreen}
        options={{ tabBarIcon: icon("📊") }}
        listeners={{
          focus: () => {
            isCurrentScreenNotifications.current = false;
          },
        }}
      />
      <Tab.Screen
        name="Избранное"
        component={FavoritesScreen}
        options={{ tabBarIcon: icon("⭐️") }}
        listeners={{
          focus: () => {
            isCurrentScreenNotifications.current = false;
          },
        }}
      />
      <Tab.Screen
        name="Уведомления"
        component={NotificationsScreen}
        options={{ tabBarIcon: icon("🔔", hasUnread) }}
        listeners={{
          tabPress: () => {
            setHasUnread(false);
          },
          focus: () => {
            isCurrentScreenNotifications.current = true;
            setHasUnread(false);
          },
        }}
      />
      <Tab.Screen
        name="Профиль"
        component={ProfileScreen}
        options={{ tabBarIcon: icon("👤") }}
        listeners={{
          focus: () => {
            isCurrentScreenNotifications.current = false;
          },
        }}
      />
    </Tab.Navigator>
  );
}
