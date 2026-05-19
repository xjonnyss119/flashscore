import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, ScrollView, Animated, StatusBar, Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  getLeagues, getStandings, adminDeleteTeam, getMe,
  getAIPrediction, refreshAIPrediction, getSeasonData,
} from "../api/api";

const SPORTS = [
  { id: 1, name: "Футбол", icon: "⚽️" },
  { id: 2, name: "Хоккей", icon: "🏒" },
  { id: 3, name: "Баскетбол", icon: "🏀" },
];

function getZoneColor(index, total, sportId) {
  const p = index + 1;
  if (sportId === 1) {
    if (p <= 4) return "#00c853";
    if (p === 5 || p === 6) return "#1e88e5";
    if (p > total - 3) return "#ef5350";
    return "transparent";
  }
  if (sportId === 2 || sportId === 3) {
    if (p <= 8) return "#00c853";
    return "transparent";
  }
  return "transparent";
}

// ───── Countdown timer component ─────
function SeasonCountdown({ nextSeasonAt, onSeasonStart }) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!nextSeasonAt) return;
    const target = new Date(nextSeasonAt).getTime();

    const update = () => {
      const diff = Math.max(0, Math.floor((target - Date.now()) / 1000));
      setSecondsLeft(diff);
      if (diff === 0 && onSeasonStart) onSeasonStart();
    };

    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [nextSeasonAt]);

  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  const label = `${m}:${String(s).padStart(2, "0")}`;

  return (
    <View style={styles.countdownBox}>
      <Text style={styles.countdownTitle}>🏆 Сезон завершён!</Text>
      <Text style={styles.countdownSub}>Новый сезон начнётся через</Text>
      <Text style={styles.countdownTimer}>{label}</Text>
    </View>
  );
}

// ───── AI Prediction Panel ─────
function AIPredictionPanel({ leagueId, champName, seasonStatus, nextSeasonAt, onSeasonStart }) {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const fetchPrediction = useCallback(async () => {
    if (!leagueId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getAIPrediction(leagueId);
      setPrediction(res.data);
    } catch (e) {
      setError("Не удалось получить прогноз");
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useEffect(() => {
    fetchPrediction();
  }, [leagueId]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      await refreshAIPrediction(leagueId);
      await fetchPrediction();
    } catch {
      setLoading(false);
    }
  };

  const isCountdown = seasonStatus === "countdown";

  return (
    <View style={styles.aiPanel}>
      {/* Действующий чемпион */}
      <View style={styles.champRow}>
        <Text style={styles.champIcon}>🥇</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.champLabel}>Действующий чемпион</Text>
          <Text style={styles.champName}>{champName || "—"}</Text>
        </View>
      </View>

      {/* Обратный отсчёт или прогноз ИИ */}
      {isCountdown ? (
        <SeasonCountdown nextSeasonAt={nextSeasonAt} onSeasonStart={onSeasonStart} />
      ) : (
        <View style={styles.predictionSection}>
          <View style={styles.predHeader}>
            <View style={styles.predTitleRow}>
              <Text style={styles.predIcon}>🤖</Text>
              <Text style={styles.predTitle}>Прогноз ИИ</Text>
            </View>
            <TouchableOpacity onPress={handleRefresh} disabled={loading} style={styles.refreshBtn}>
              <Text style={styles.refreshBtnText}>{loading ? "⏳" : "🔄"}</Text>
            </TouchableOpacity>
          </View>

          {loading && !prediction ? (
            <View style={styles.predLoading}>
              <ActivityIndicator color="#7c3aed" size="small" />
              <Text style={styles.predLoadingText}>Gemini анализирует...</Text>
            </View>
          ) : error ? (
            <Text style={styles.predError}>{error}</Text>
          ) : prediction ? (
            <View>
              {prediction.champion ? (
                <View style={styles.predChamp}>
                  <Text style={styles.predChampLabel}>Прогнозируемый победитель</Text>
                  <Text style={styles.predChampName}>{prediction.champion}</Text>
                  {prediction.confidence != null && (
                    <View style={styles.confRow}>
                      <View style={styles.confBar}>
                        <View style={[styles.confFill, { width: `${prediction.confidence}%` }]} />
                      </View>
                      <Text style={styles.confText}>{prediction.confidence}%</Text>
                    </View>
                  )}
                </View>
              ) : null}

              {prediction.top3?.length > 1 && (
                <TouchableOpacity onPress={() => setExpanded(!expanded)} style={styles.expandBtn}>
                  <Text style={styles.expandBtnText}>{expanded ? "▲ Скрыть" : "▼ Топ-3 и обоснование"}</Text>
                </TouchableOpacity>
              )}

              {expanded && (
                <View style={styles.expandedContent}>
                  {prediction.top3?.length > 0 && (
                    <View style={styles.top3}>
                      {prediction.top3.map((name, i) => (
                        <View key={i} style={styles.top3Item}>
                          <Text style={styles.top3Medal}>{["🥇","🥈","🥉"][i]}</Text>
                          <Text style={styles.top3Name}>{name}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {prediction.reasoning ? (
                    <Text style={styles.reasoning}>{prediction.reasoning}</Text>
                  ) : null}
                </View>
              )}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

// ───── Row ─────
function RowItem({ item, index, total, sportId, maxPoints, onDelete, isAdmin }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(15)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, delay: index * 35, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 250, delay: index * 35, useNativeDriver: true }),
    ]).start();
  }, [index]);

  const zoneColor = getZoneColor(index, total, sportId);
  const goalDiff = (item.goals_for || 0) - (item.goals_against || 0);
  const goalDiffText = goalDiff > 0 ? `+${goalDiff}` : `${goalDiff}`;
  const goalDiffColor = goalDiff > 0 ? "#00c853" : goalDiff < 0 ? "#ef5350" : "#aaa";
  const winRate = item.played > 0 ? item.wins / item.played : 0;
  const progressRatio = sportId === 3 ? winRate : maxPoints > 0 ? (item.points || 0) / maxPoints : 0;
  const isTop = index === 0;

  return (
    <Animated.View style={[styles.row, index % 2 === 0 && styles.rowAlt, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={[styles.zoneStripe, { backgroundColor: zoneColor }]} />
      <View style={styles.posContainer}>
        <Text style={[styles.pos, isTop && { color: "#ffd700" }]}>{index + 1}</Text>
      </View>
      <View style={[styles.teamContainer, isAdmin && { marginRight: 4 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
          <Text style={[styles.teamName, isTop && { color: "#ffd700" }]} numberOfLines={1}>{item.team_name}</Text>
          {isAdmin && (
            <TouchableOpacity onPress={() => onDelete(item.team_id, item.team_name)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.deleteBtnIcon}>❌</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${progressRatio * 100}%`, backgroundColor: zoneColor !== "transparent" ? zoneColor : "#333" }]} />
        </View>
      </View>
      <Text style={styles.statCol}>{item.played ?? 0}</Text>
      <Text style={styles.statCol}>{item.wins ?? 0}</Text>
      {sportId === 1 && <Text style={styles.statCol}>{item.draws ?? 0}</Text>}
      {sportId === 2 && (<><Text style={styles.statCol}>{item.wins_ot ?? 0}</Text><Text style={styles.statCol}>{item.losses_ot ?? 0}</Text></>)}
      <Text style={styles.statCol}>{item.losses ?? 0}</Text>
      <Text style={[styles.statCol, { color: goalDiffColor }]}>{goalDiffText}</Text>
      <Text style={[styles.statCol, styles.pointsCol, sportId === 3 && { width: 40 }]}>
        {sportId === 3 ? winRate.toFixed(3).replace(/^0/, "") : (item.points ?? 0)}
      </Text>
    </Animated.View>
  );
}

// ───── Main Screen ─────
export default function StandingsScreen() {
  const [leagues, setLeagues] = useState([]);
  const [selectedSportId, setSelectedSportId] = useState(1);
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [seasonData, setSeasonData] = useState(null);
  const seasonPollRef = useRef(null);

  useEffect(() => {
    getMe().then(res => setIsAdmin(res.data?.role === "admin")).catch(() => setIsAdmin(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      getLeagues().then(res => {
        const normalized = res.data.map(l => ({ ...l, sport_id: Number(l.sport_id) }));
        setLeagues(normalized);
        setSelectedLeague(prev => {
          if (prev) {
            const still = normalized.find(l => l.id === prev.id);
            if (still && still.sport_id === selectedSportId) return still;
          }
          return normalized.find(l => l.sport_id === selectedSportId) || null;
        });
      });
    }, [selectedSportId])
  );

  const filteredLeagues = leagues.filter(l => l.sport_id === selectedSportId);

  useEffect(() => {
    if (filteredLeagues.length > 0) {
      if (!selectedLeague || selectedLeague.sport_id !== selectedSportId) {
        setSelectedLeague(filteredLeagues[0]);
      }
    } else if (selectedLeague !== null) {
      setSelectedLeague(null);
      setStandings([]);
    }
  }, [selectedSportId, leagues]);

  useEffect(() => {
    if (!selectedLeague) { setStandings([]); setLoading(false); return; }
    setLoading(true);
    getStandings(selectedLeague.id)
      .then(res => setStandings(res.data))
      .catch(() => setStandings([]))
      .finally(() => setLoading(false));
  }, [selectedLeague]);

  // Polling season data
  const fetchSeasonData = useCallback(async () => {
    if (!selectedLeague) return;
    try {
      const res = await getSeasonData(selectedLeague.id);
      setSeasonData(res.data);
    } catch {}
  }, [selectedLeague]);

  useEffect(() => {
    fetchSeasonData();
    if (seasonPollRef.current) clearInterval(seasonPollRef.current);
    seasonPollRef.current = setInterval(fetchSeasonData, 15000);
    return () => clearInterval(seasonPollRef.current);
  }, [selectedLeague]);

  const handleSeasonStart = useCallback(() => {
    // Новый сезон стартовал — обновляем всё
    setTimeout(() => {
      fetchSeasonData();
      if (selectedLeague) {
        getStandings(selectedLeague.id)
          .then(res => setStandings(res.data))
          .catch(() => setStandings([]));
      }
    }, 3000);
  }, [selectedLeague]);

  const handleDeleteTeam = (teamId, teamName) => {
    Alert.alert("Удаление команды", `Удалить команду "${teamName}"?`, [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить", style: "destructive",
        onPress: () => adminDeleteTeam(teamId)
          .then(() => setStandings(prev => prev.filter(t => t.team_id !== teamId)))
          .catch(() => Alert.alert("Ошибка", "Не удалось удалить команду"))
      }
    ]);
  };

  const maxPoints = standings.length > 0 ? Math.max(...standings.map(s => s.points ?? 0)) : 1;

  const renderLegend = () => {
    if (standings.length === 0) return null;
    let items = [];
    if (selectedSportId === 1) {
      items = [
        { color: "#00c853", label: "Лига чемпионов" },
        { color: "#1e88e5", label: "Лига Европы" },
        { color: "#ef5350", label: "Вылет" },
      ];
    } else {
      items = [{ color: "#00c853", label: "Зона Плей-офф" }];
    }
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.legendScroll}>
        <View style={styles.legend}>
          {items.map(z => (
            <View key={z.label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: z.color }]} />
              <Text style={styles.legendText}>{z.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.sportSelector}>
        {SPORTS.map(sport => (
          <TouchableOpacity
            key={sport.id}
            style={[styles.sportBtn, selectedSportId === sport.id && styles.sportBtnActive]}
            onPress={() => setSelectedSportId(sport.id)}
          >
            <Text style={styles.sportIcon}>{sport.icon}</Text>
            <Text style={[styles.sportText, selectedSportId === sport.id && styles.sportTextActive]}>{sport.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.leagueRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {filteredLeagues.map(l => (
            <TouchableOpacity
              key={l.id}
              style={[styles.leagueBtn, selectedLeague?.id === l.id && styles.leagueActive]}
              onPress={() => setSelectedLeague(l)}
              activeOpacity={0.7}
            >
              <Text style={styles.leagueBtnText}>{l.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* AI + Champion Panel */}
      {selectedLeague && (
        <AIPredictionPanel
          leagueId={selectedLeague.id}
          champName={seasonData?.champion_name}
          seasonStatus={seasonData?.status}
          nextSeasonAt={seasonData?.next_season_at}
          onSeasonStart={handleSeasonStart}
        />
      )}

      {renderLegend()}

      <View style={styles.tableHeader}>
        <View style={styles.zoneStripe} />
        <Text style={styles.posHeader}>#</Text>
        <Text style={styles.teamHeader}>Команда</Text>
        <Text style={styles.statHeader}>И</Text>
        <Text style={styles.statHeader}>В</Text>
        {selectedSportId === 1 && <Text style={styles.statHeader}>Н</Text>}
        {selectedSportId === 2 && <Text style={styles.statHeader}>ВО</Text>}
        {selectedSportId === 2 && <Text style={styles.statHeader}>ПО</Text>}
        <Text style={styles.statHeader}>П</Text>
        <Text style={styles.statHeader}>±</Text>
        <Text style={[styles.statHeader, styles.pointsCol, { color: "#00c853" }, selectedSportId === 3 && { width: 40 }]}>
          {selectedSportId === 3 ? "%В" : "О"}
        </Text>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color="#00c853" size="large" />
          <Text style={styles.loaderText}>Загрузка таблицы...</Text>
        </View>
      ) : (
        <FlatList
          data={standings}
          keyExtractor={item => String(item.id || item.team_id)}
          renderItem={({ item, index }) => (
            <RowItem
              item={item} index={index} total={standings.length}
              sportId={selectedSportId} maxPoints={maxPoints}
              onDelete={handleDeleteTeam} isAdmin={isAdmin}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>📊</Text>
              <Text style={styles.emptyText}>Нет данных для этой лиги</Text>
              <Text style={styles.emptyHint}>Данные появятся после завершения матчей</Text>
            </View>
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
    flexDirection: "row", backgroundColor: "#16213e",
    paddingVertical: 10, justifyContent: "space-around",
    borderBottomWidth: 1, borderBottomColor: "#2a2a4a",
  },
  sportBtn: { alignItems: "center", opacity: 0.6, padding: 5 },
  sportBtnActive: { opacity: 1, borderBottomWidth: 2, borderBottomColor: "#00c853" },
  sportIcon: { fontSize: 24, marginBottom: 4 },
  sportText: { color: "#fff", fontSize: 12 },
  sportTextActive: { fontWeight: "bold", color: "#00c853" },
  leagueRow: { paddingHorizontal: 12, marginVertical: 8 },
  leagueBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: "#16213e", borderWidth: 1, borderColor: "#444", marginRight: 8,
  },
  leagueActive: { borderColor: "#00c853" },
  leagueBtnText: { color: "#ccc", fontSize: 11 },

  // AI Panel
  aiPanel: {
    marginHorizontal: 12, marginBottom: 8, borderRadius: 12,
    backgroundColor: "#16213e", borderWidth: 1, borderColor: "#2a2a4a",
    overflow: "hidden",
  },
  champRow: {
    flexDirection: "row", alignItems: "center", padding: 12,
    borderBottomWidth: 1, borderBottomColor: "#2a2a4a",
  },
  champIcon: { fontSize: 24, marginRight: 10 },
  champLabel: { color: "#888", fontSize: 10, marginBottom: 2 },
  champName: { color: "#ffd700", fontSize: 15, fontWeight: "700" },

  countdownBox: {
    alignItems: "center", padding: 16,
    backgroundColor: "#0f0f23",
  },
  countdownTitle: { color: "#ffd700", fontSize: 14, fontWeight: "700", marginBottom: 4 },
  countdownSub: { color: "#888", fontSize: 11, marginBottom: 8 },
  countdownTimer: { color: "#00c853", fontSize: 32, fontWeight: "900", letterSpacing: 2 },

  predictionSection: { padding: 12 },
  predHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  predTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  predIcon: { fontSize: 16 },
  predTitle: { color: "#fff", fontSize: 13, fontWeight: "700" },
  refreshBtn: { padding: 4 },
  refreshBtnText: { fontSize: 16 },
  predLoading: { flexDirection: "row", alignItems: "center", gap: 8 },
  predLoadingText: { color: "#888", fontSize: 12 },
  predError: { color: "#ef5350", fontSize: 12 },

  predChamp: { marginBottom: 6 },
  predChampLabel: { color: "#888", fontSize: 10, marginBottom: 2 },
  predChampName: { color: "#a78bfa", fontSize: 15, fontWeight: "700" },
  confRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  confBar: {
    flex: 1, height: 4, backgroundColor: "#2a2a4a", borderRadius: 2, overflow: "hidden",
  },
  confFill: { height: 4, backgroundColor: "#7c3aed", borderRadius: 2 },
  confText: { color: "#888", fontSize: 10, width: 32, textAlign: "right" },

  expandBtn: { marginTop: 6 },
  expandBtnText: { color: "#7c3aed", fontSize: 11 },
  expandedContent: { marginTop: 8 },
  top3: { marginBottom: 8 },
  top3Item: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },
  top3Medal: { fontSize: 14 },
  top3Name: { color: "#ccc", fontSize: 12 },
  reasoning: { color: "#888", fontSize: 11, lineHeight: 16, fontStyle: "italic" },

  legendScroll: { maxHeight: 30, backgroundColor: "#1a1a2e" },
  legend: { flexDirection: "row", paddingHorizontal: 12, paddingBottom: 4, gap: 16 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: "#888", fontSize: 10 },

  tableHeader: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#16213e",
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#2a2a4a",
  },
  posHeader: { width: 28, color: "#aaa", fontSize: 11, textAlign: "center", fontWeight: "700" },
  teamHeader: { flex: 1, color: "#aaa", fontSize: 11, fontWeight: "700", paddingLeft: 4 },
  statHeader: { width: 30, color: "#aaa", fontSize: 11, textAlign: "center", fontWeight: "700" },
  zoneStripe: { width: 3, alignSelf: "stretch", marginRight: 3, borderRadius: 2 },
  row: {
    flexDirection: "row", alignItems: "center", paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "#2a2a4a",
  },
  rowAlt: { backgroundColor: "#16213e" },
  posContainer: { width: 28, alignItems: "center" },
  pos: { color: "#aaa", fontSize: 12, fontWeight: "700" },
  teamContainer: { flex: 1, paddingLeft: 4, paddingRight: 6 },
  teamName: { color: "#fff", fontSize: 13, fontWeight: "600", flex: 1 },
  deleteBtnIcon: { fontSize: 11, opacity: 0.8, paddingHorizontal: 4 },
  progressBg: { height: 2, backgroundColor: "#2a2a4a", borderRadius: 1, marginTop: 4, overflow: "hidden" },
  progressFill: { height: 2, borderRadius: 1 },
  statCol: { width: 30, color: "#aaa", fontSize: 12, textAlign: "center" },
  pointsCol: { width: 30, color: "#fff", fontWeight: "800" },
  loaderWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  loaderText: { color: "#aaa", marginTop: 12, fontSize: 13 },
  emptyWrap: { alignItems: "center", paddingTop: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  emptyHint: { color: "#aaa", fontSize: 12, marginTop: 6 },
});
