import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { getFavorites, removeFavorite } from "../api/api";

const SPORTS = [
  { id: 1, name: "Футбол", icon: "⚽" },
  { id: 2, name: "Хоккей", icon: "🏒" },
  { id: 3, name: "Баскетбол", icon: "🏀" },
];

const STATUS_COLOR = {
  live: "#00c853",
  finished: "#888",
  scheduled: "#4fc3f7",
};
const STATUS_LABEL = {
  live: "🔴 LIVE",
  finished: "Завершён",
  scheduled: "Запланирован",
};

export default function FavoritesScreen({ navigation }) {
  const [favorites, setFavorites] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFavorites = async () => {
    try {
      const res = await getFavorites();
      setFavorites(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchFavorites();
    }, []),
  );

  const handleRemove = async (id) => {
    Alert.alert("Удалить", "Убрать из избранного?", [
      { text: "Отмена" },
      {
        text: "Удалить",
        onPress: async () => {
          await removeFavorite(id);
          fetchFavorites();
        },
      },
    ]);
  };

  const renderItem = ({ item }) => {
    const sportIcon = SPORTS.find((s) => s.id === item.sport_id)?.icon || "⚽";
    const isOT =
      item.is_overtime && (item.sport_id === 2 || item.sport_id === 3);

    return (
      <View style={styles.wrapper}>
        {item.match_id ? (
          <TouchableOpacity
            style={styles.card}
            onPress={() =>
              navigation.navigate("MatchDetail", { matchId: item.match_id })
            }
          >
            <View style={styles.cardHeader}>
              <Text style={styles.league}>
                {sportIcon} {item.league_name || "Лига"} · {item.country || ""}
              </Text>
              <Text
                style={[
                  styles.status,
                  { color: STATUS_COLOR[item.status] || "#aaa" },
                ]}
              >
                {STATUS_LABEL[item.status] || item.status}
                {item.status === "live" ? `  ${item.minute}'` : ""}
                {isOT ? " (ОТ)" : ""}
              </Text>
            </View>
            <View style={styles.teams}>
              <Text style={styles.teamName} numberOfLines={1}>
                {item.home_team}
              </Text>
              <View style={styles.scoreContainer}>
                <Text style={styles.score}>
                  {item.home_score} : {item.away_score}
                </Text>
                {isOT && <Text style={styles.otMiniLabel}>ОТ</Text>}
              </View>
              <Text
                style={[styles.teamName, { textAlign: "right" }]}
                numberOfLines={1}
              >
                {item.away_team}
              </Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.league}>🏟 Любимая команда</Text>
            </View>
            <View style={styles.teams}>
              <Text
                style={[styles.teamName, { width: "100%" }]}
                numberOfLines={1}
              >
                {item.team_name}
              </Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={styles.removeBtn}
          onPress={() => handleRemove(item.id)}
        >
          <Text style={styles.remove}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={favorites}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await fetchFavorites();
              setRefreshing(false);
            }}
            tintColor="#00c853"
          />
        }
        ListEmptyComponent={<Text style={styles.empty}>Избранное пусто</Text>}
        contentContainerStyle={{ paddingVertical: 12 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a2e" },
  wrapper: {
    position: "relative",
    marginHorizontal: 12,
    marginBottom: 10,
  },
  card: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#2a2a4a",
    paddingRight: 40,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  league: { color: "#888", fontSize: 11 },
  status: { fontSize: 11, fontWeight: "bold" },
  teams: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  teamName: { color: "#fff", fontSize: 14, fontWeight: "600", width: "35%" },
  scoreContainer: { width: "30%", alignItems: "center" },
  score: { color: "#00c853", fontSize: 20, fontWeight: "bold" },
  otMiniLabel: {
    color: "#ffb300",
    fontSize: 10,
    fontWeight: "bold",
    marginTop: -2,
  },
  removeBtn: {
    position: "absolute",
    right: 12,
    top: "50%",
    marginTop: -12,
    zIndex: 10,
    padding: 4,
  },
  remove: { color: "#e53935", fontSize: 18, fontWeight: "bold" },
  empty: { color: "#888", textAlign: "center", marginTop: 60, fontSize: 16 },
});
