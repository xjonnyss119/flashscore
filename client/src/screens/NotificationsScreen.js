import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { getNotifications, markNotificationRead } from "../api/api";

export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const notificationsRef = useRef([]);

  const fetchNotifications = async () => {
    try {
      const res = await getNotifications();
      setNotifications(res.data);
      notificationsRef.current = res.data;
    } catch (error) {
      console.error("Ошибка при получении уведомлений:", error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchNotifications();

      return () => {
        const unreadNotifs = notificationsRef.current.filter((n) => !n.is_read);

        if (unreadNotifs.length > 0) {
          const readPromises = unreadNotifs.map((n) =>
            markNotificationRead(n.id),
          );
          Promise.all(readPromises).catch((err) => {
            console.error("Ошибка при отложенном прочтении уведомлений:", err);
          });
        }
      };
    }, []),
  );

  const handleRead = async (notif) => {
    if (!notif.is_read) {
      await markNotificationRead(notif.id).catch(() => {});

      const updated = notifications.map((n) =>
        n.id === notif.id ? { ...n, is_read: true } : n,
      );
      setNotifications(updated);
      notificationsRef.current = updated;
    }

    if (notif.match_id) {
      navigation.navigate("MatchDetail", { matchId: notif.match_id });
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={notifications}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.item, !item.is_read && styles.unread]}
            onPress={() => handleRead(item)}
          >
            {!item.is_read && <View style={styles.dot} />}
            <Text style={styles.message}>{item.message}</Text>
            <Text style={styles.time}>
              {new Date(item.created_at).toLocaleString("ru-RU")}
            </Text>
          </TouchableOpacity>
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await fetchNotifications();
              setRefreshing(false);
            }}
            tintColor="#00c853"
          />
        }
        ListEmptyComponent={<Text style={styles.empty}>Нет уведомлений</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a2e" },
  item: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a4a",
    position: "relative",
  },
  unread: { backgroundColor: "#16213e" },
  dot: {
    position: "absolute",
    top: 18,
    right: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#00c853",
  },
  message: { color: "#fff", fontSize: 14, marginBottom: 4 },
  time: { color: "#888", fontSize: 11 },
  empty: { color: "#888", textAlign: "center", marginTop: 60, fontSize: 16 },
});
