import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { getMatches, getLeagues } from "../api/api";

const SPORTS = [
  { id: 1, name: "Футбол", icon: "⚽" },
  { id: 2, name: "Хоккей", icon: "🏒" },
  { id: 3, name: "Баскетбол", icon: "🏀" },
];

const STATUS_FILTERS = [
  { label: "Все", value: undefined },
  { label: "🔴 Live", value: "live" },
  { label: "✅ Завершены", value: "finished" },
  { label: "🕐 Запланированы", value: "scheduled" },
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

export default function MatchesScreen({ navigation }) {
  const [matches, setMatches] = useState([]);
  const [leagues, setLeagues] = useState([]);
  const [selectedSportId, setSelectedSportId] = useState(1);
  const [status, setStatus] = useState(undefined);
  const [leagueId, setLeagueId] = useState(undefined);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMatches = useCallback(async () => {
    try {
      const res = await getMatches({
        status,
        league_id: leagueId,
        sport_id: selectedSportId,
        search: search || undefined,
      });
      setMatches(res.data);
    } catch (err) {
      console.error(err);
    }
  }, [status, leagueId, search, selectedSportId]);

  useEffect(() => {
    setLoading(true);
    fetchMatches().finally(() => setLoading(false));

    const interval = setInterval(fetchMatches, 10000);
    return () => clearInterval(interval);
  }, [fetchMatches]);

  useEffect(() => {
    getLeagues()
      .then((res) => setLeagues(res.data))
      .catch(() => {});
  }, []);

  const filteredLeagues = leagues.filter((l) => l.sport_id === selectedSportId);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchMatches();
    setRefreshing(false);
  };

  const renderMatch = ({ item }) => {
    const isOT =
      item.is_overtime && (item.sport_id === 2 || item.sport_id === 3);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate("MatchDetail", { matchId: item.id })}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.league}>
            {SPORTS.find((s) => s.id === item.sport_id)?.icon}{" "}
            {item.league_name}
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
    );
  };

  return (
    <View style={styles.container}>
      {/* Sport Selector */}
      <View style={styles.sportSelector}>
        {SPORTS.map((sport) => (
          <TouchableOpacity
            key={sport.id}
            style={[
              styles.sportBtn,
              selectedSportId === sport.id && styles.sportBtnActive,
            ]}
            onPress={() => {
              setSelectedSportId(sport.id);
              setLeagueId(undefined);
            }}
          >
            <Text style={styles.sportIcon}>{sport.icon}</Text>
            <Text
              style={[
                styles.sportText,
                selectedSportId === sport.id && styles.sportTextActive,
              ]}
            >
              {sport.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        style={styles.search}
        placeholder="Поиск команды..."
        placeholderTextColor="#888"
        value={search}
        onChangeText={setSearch}
      />

      {/* Status filter */}
      <View style={styles.filtersContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersScrollContent}
        >
          {STATUS_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.label}
              style={[
                styles.filterBtn,
                status === f.value && styles.filterActive,
              ]}
              onPress={() => setStatus(f.value)}
            >
              <Text
                style={[
                  styles.filterText,
                  status === f.value && styles.filterTextActive,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Лиги только выбранного спорта */}
      <View style={styles.leagueRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity
            style={[styles.leagueBtn, !leagueId && styles.leagueActive]}
            onPress={() => setLeagueId(undefined)}
          >
            <Text style={styles.leagueBtnText}>Все лиги</Text>
          </TouchableOpacity>
          {filteredLeagues.map((l) => (
            <TouchableOpacity
              key={l.id}
              style={[
                styles.leagueBtn,
                leagueId === l.id && styles.leagueActive,
              ]}
              onPress={() => setLeagueId(l.id)}
            >
              <Text style={styles.leagueBtnText}>{l.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator color="#00c853" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMatch}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#00c853"
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>Матчей в этой категории пока нет</Text>
          }
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a2e" },
  sportSelector: {
    flexDirection: "row",
    backgroundColor: "#16213e",
    paddingVertical: 10,
    justifyContent: "space-around",
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a4a",
  },
  sportBtn: { alignItems: "center", opacity: 0.6, padding: 5 },
  sportBtnActive: {
    opacity: 1,
    borderBottomWidth: 2,
    borderBottomColor: "#00c853",
  },
  sportIcon: { fontSize: 24, marginBottom: 4 },
  sportText: { color: "#fff", fontSize: 12 },
  sportTextActive: { fontWeight: "bold", color: "#00c853" },
  search: {
    backgroundColor: "#16213e",
    color: "#fff",
    margin: 12,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#333",
  },
  filtersContainer: {
    marginBottom: 8,
  },
  filtersScrollContent: {
    paddingHorizontal: 12,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#16213e",
    borderWidth: 1,
    borderColor: "#333",
    marginRight: 4,
  },
  filterActive: { backgroundColor: "#00c853", borderColor: "#00c853" },
  filterText: { color: "#aaa", fontSize: 12 },
  filterTextActive: { color: "#fff", fontWeight: "bold" },
  leagueRow: { paddingHorizontal: 12, marginBottom: 10 },
  leagueBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#16213e",
    borderWidth: 1,
    borderColor: "#444",
    marginRight: 8,
  },
  leagueActive: { borderColor: "#00c853" },
  leagueBtnText: { color: "#ccc", fontSize: 11 },
  card: {
    backgroundColor: "#16213e",
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#2a2a4a",
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
  empty: { color: "#888", textAlign: "center", marginTop: 60, fontSize: 14 },
});
