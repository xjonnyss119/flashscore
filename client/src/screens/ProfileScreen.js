import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  FlatList,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native"; 
import { useAuth } from "../context/AuthContext";
import { getHistory } from "../api/api";

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [history, setHistory] = useState([]);

  
  useFocusEffect(
    useCallback(() => {
      getHistory()
        .then((res) => setHistory(res.data))
        .catch(() => {});
    }, []),
  );

  const handleLogout = () => {
    Alert.alert("Выход", "Вы уверены?", [
      { text: "Отмена" },
      { text: "Выйти", style: "destructive", onPress: logout },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Профиль пользователя */}
      <View style={styles.profileCard}>
        <Text style={styles.avatar}>👤</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <View
          style={[
            styles.roleBadge,
            user?.role === "admin" && styles.adminBadge,
          ]}
        >
          <Text style={styles.roleText}>
            {user?.role === "admin" ? "⚙️ Администратор" : "👤 Пользователь"}
          </Text>
        </View>
      </View>

      {/* Кнопка админки */}
      {user?.role === "admin" && (
        <TouchableOpacity
          style={styles.adminBtn}
          onPress={() => navigation.navigate("Admin")}
        >
          <Text style={styles.adminBtnText}>⚙️ Открыть админ-панель</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionTitle}>История просмотров</Text>
      <FlatList
        data={history.slice(0, 10)}
        
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.historyItem}
            onPress={() => navigation.navigate('MatchDetail', { matchId: item.id })}
          >
            <Text style={styles.historyTeams} numberOfLines={1}>
              {item.home_team} vs {item.away_team}
            </Text>
            <Text style={styles.historyScore}>{item.home_score}:{item.away_score}</Text>
            <Text style={styles.historyTime}>
              {new Date(item.viewed_at).toLocaleDateString('ru-RU')}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>История пуста</Text>}
        style={{ flex: 1 }}
      />

      {/* Выход */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Выйти из аккаунта</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a2e", padding: 16 },
  profileCard: {
    backgroundColor: "#16213e",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
  },
  avatar: { fontSize: 48, marginBottom: 8 },
  email: { color: "#fff", fontSize: 16, fontWeight: "600", marginBottom: 8 },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#1a3a5c",
  },
  adminBadge: { backgroundColor: "#4a1a6e" },
  roleText: { color: "#ccc", fontSize: 12 },
  adminBtn: {
    backgroundColor: "#1a237e",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  adminBtnText: { color: "#fff", fontWeight: "600" },
  sectionTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
  },
  historyItem: {
    backgroundColor: "#16213e",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyTeams: { color: "#fff", fontSize: 13, flex: 1, marginRight: 8 },
  historyScore: { color: "#00c853", fontWeight: "bold", marginHorizontal: 8 },
  historyTime: { color: "#888", fontSize: 11 },
  empty: { color: "#888", textAlign: "center", paddingVertical: 20 },
  logoutBtn: {
    backgroundColor: "#b71c1c",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  logoutText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
