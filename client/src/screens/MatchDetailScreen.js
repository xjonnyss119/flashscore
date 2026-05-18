import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  getMatch,
  addFavorite,
  getFavorites,
  removeFavorite,
} from "../api/api";
import { useAuth } from "../context/AuthContext";

const EVENT_MARKER = {
  goal: "⚽ Гол",
  yellow_card: "🟡 ЖК",
  red_card: "🔴 КК",
  puck: "🏒 Шайба",
  penalty: "⏰ 2 мин",
  "2_pointer": "🏀 +2",
  "3_pointer": "🔥 +3",
  free_throw: "🎯 Штрафной",
};

const STATUS_COLOR = {
  live: "#00c853",
  finished: "#888",
  scheduled: "#4fc3f7",
};

export default function MatchDetailScreen({ route, navigation }) {
  const { matchId } = route.params;
  const { user } = useAuth();

  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [favoriteId, setFavoriteId] = useState(null);

  const fetchMatch = async () => {
    try {
      const res = await getMatch(matchId);
      setMatch(res.data);
    } catch (err) {
      Alert.alert("Ошибка", "Не удалось загрузить матч");
    } finally {
      setLoading(false);
    }
  };

  const checkFavorite = async () => {
    try {
      const res = await getFavorites();
      const fav = res.data.find((f) => f.match_id === matchId);
      setFavoriteId(fav ? fav.id : null);
    } catch {}
  };

  useEffect(() => {
    fetchMatch();
    checkFavorite();
  }, [matchId]);

  useEffect(() => {
    if (!match) return;
    if (match.status !== "live") return;

    const interval = setInterval(() => {
      fetchMatch();
    }, 10000);

    return () => clearInterval(interval);
  }, [match?.status]);

  const toggleFavorite = async () => {
    try {
      if (favoriteId) {
        await removeFavorite(favoriteId);
        setFavoriteId(null);
      } else {
        const res = await addFavorite({ match_id: matchId });
        setFavoriteId(res.data.id);
      }
    } catch (err) {
      Alert.alert("Ошибка", "Не удалось обновить избранное");
    }
  };

  if (loading) {
    return (
      <ActivityIndicator
        color="#00c853"
        style={{ flex: 1, backgroundColor: "#1a1a2e" }}
      />
    );
  }

  if (!match) return null;

  const showOT =
    match.is_overtime && (match.sport_id === 2 || match.sport_id === 3);

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.league}>{match.league_name}</Text>
        <Text style={[styles.status, { color: STATUS_COLOR[match.status] }]}>
          {match.status === "live"
            ? `🔴 LIVE ${match.minute}'${showOT ? " (ОТ)" : ""}`
            : match.status === "finished"
              ? `Завершён${showOT ? " (ОТ)" : ""}`
              : "Запланирован"}
        </Text>
      </View>

      {/* Score */}
      <View style={styles.scoreBlock}>
        <Text style={styles.teamBig} numberOfLines={2}>
          {match.home_team}
        </Text>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.scoreBig}>
            {match.home_score} : {match.away_score}
          </Text>
          {showOT && <Text style={styles.otSubText}>В овертайме</Text>}
        </View>
        <Text
          style={[styles.teamBig, { textAlign: "right" }]}
          numberOfLines={2}
        >
          {match.away_team}
        </Text>
      </View>

      {/* Favorite button */}
      <TouchableOpacity style={styles.favBtn} onPress={toggleFavorite}>
        <Text style={styles.favBtnText}>
          {favoriteId ? "⭐ В избранном" : "☆ Добавить в избранное"}
        </Text>
      </TouchableOpacity>

      {/* Admin quick edit */}
      {user?.role === "admin" && (
        <TouchableOpacity
          style={styles.adminBtn}
          onPress={() =>
            navigation.navigate("Admin", { screen: "EditMatch", matchId })
          }
        >
          <Text style={styles.adminBtnText}>⚙️ Управление симуляцией</Text>
        </TouchableOpacity>
      )}

      {/* Events timeline */}
      <Text style={styles.sectionTitle}>События матча</Text>
      {(!match.events || match.events.length === 0) && (
        <Text style={styles.noEvents}>Событий пока нет</Text>
      )}

      {match.events?.map((event) => {
        const isHome = event.team_id === match.home_team_id;
        return (
          <View key={event.id} style={styles.eventRow}>
            {/* ЛЕВАЯ СТОРОНА (ХОЗЯЕВА) */}
            <View style={styles.sideContainer}>
              {isHome && (
                <View style={styles.homeEventLayout}>
                  <Text style={styles.eventMarker}>
                    {EVENT_MARKER[event.type] || "•"}
                  </Text>
                  <Text style={styles.playerNameLeft}>{event.player_name}</Text>
                </View>
              )}
            </View>

            {/* ЦЕНТР (МИНУТА) */}
            <View style={styles.minuteContainer}>
              <Text style={styles.eventMinute}>{event.minute}'</Text>
            </View>

            {/* ПРАВАЯ СТОРОНА (ГОСТИ) */}
            <View style={styles.sideContainer}>
              {!isHome && (
                <View style={styles.awayEventLayout}>
                  <Text style={styles.playerNameRight}>
                    {event.player_name}
                  </Text>
                  <Text style={[styles.eventMarker, { textAlign: "right" }]}>
                    {EVENT_MARKER[event.type] || "•"}
                  </Text>
                </View>
              )}
            </View>
          </View>
        );
      })}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a2e" },
  header: { alignItems: "center", paddingTop: 20, paddingBottom: 8 },
  league: { color: "#888", fontSize: 13 },
  status: { fontSize: 13, fontWeight: "bold", marginTop: 4 },
  scoreBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    padding: 20,
    backgroundColor: "#16213e",
    marginHorizontal: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  teamBig: { color: "#fff", fontSize: 15, fontWeight: "700", flex: 1 },
  scoreBig: {
    color: "#00c853",
    fontSize: 32,
    fontWeight: "bold",
    marginHorizontal: 12,
    minWidth: 80,
    textAlign: "center",
  },
  otSubText: {
    color: "#ffb300",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  favBtn: {
    backgroundColor: "#16213e",
    marginHorizontal: 16,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#333",
  },
  favBtnText: { color: "#f9a825", fontSize: 14, fontWeight: "600" },
  adminBtn: {
    backgroundColor: "#1a237e",
    marginHorizontal: 16,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  adminBtnText: { color: "#fff", fontSize: 14 },
  sectionTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 16,
    marginBottom: 10,
  },
  noEvents: { color: "#888", textAlign: "center", padding: 20 },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },
  sideContainer: {
    flex: 1,
  },
  minuteContainer: {
    width: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  eventMinute: {
    color: "#00c853",
    fontWeight: "bold",
    fontSize: 13,
    backgroundColor: "#16213e",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  homeEventLayout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  playerNameLeft: {
    color: "#fff",
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
  },
  awayEventLayout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  playerNameRight: {
    color: "#fff",
    fontSize: 13,
    marginRight: 8,
    textAlign: "right",
    flex: 1,
  },
  eventMarker: {
    color: "#ffb300",
    fontSize: 12,
    fontWeight: "600",
    minWidth: 65,
  },
});
