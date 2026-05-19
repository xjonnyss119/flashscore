import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Animated,
  StatusBar,
  Alert,
  Modal,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  getLeagues,
  getLeagueStandings,
  getAiPrediction,
  adminDeleteTeam,
  getMe,
} from "../api/api";

const SPORTS = [
  { id: 1, name: "Футбол", icon: "⚽️" },
  { id: 2, name: "Хоккей", icon: "🏒" },
  { id: 3, name: "Баскетбол", icon: "🏀" },
];

function getZoneColor(index, total, sportId) {
  const position = index + 1;
  if (sportId === 1) {
    if (position <= 4) return "#00c853";
    if (position === 5 || position === 6) return "#1e88e5";
    if (position > total - 3) return "#ef5350";
  }
  if ((sportId === 2 || sportId === 3) && position <= 8) return "#00c853";
  return "transparent";
}

function RowItem({
  item,
  index,
  total,
  sportId,
  maxPoints,
  onDelete,
  isAdmin,
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(15)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        delay: index * 35,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        delay: index * 35,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index]);

  const zoneColor = getZoneColor(index, total, sportId);
  const goalDiff = (item.goals_for || 0) - (item.goals_against || 0);
  const winRate = item.played > 0 ? item.wins / item.played : 0;
  const progressRatio =
    sportId === 3
      ? winRate
      : maxPoints > 0
        ? (item.points || 0) / maxPoints
        : 0;

  return (
    <Animated.View
      style={[
        styles.row,
        index % 2 === 0 && styles.rowAlt,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={[styles.zoneStripe, { backgroundColor: zoneColor }]} />
      <View style={styles.posContainer}>
        <Text style={styles.pos}>{index + 1}</Text>
      </View>
      <View style={styles.teamContainer}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={styles.teamName} numberOfLines={1}>
            {item.team_name}
          </Text>
          {isAdmin && (
            <TouchableOpacity
              onPress={() => onDelete(item.team_id, item.team_name)}
            >
              <Text style={styles.deleteBtnIcon}>❌</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.progressBg}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${progressRatio * 100}%`,
                backgroundColor:
                  zoneColor !== "transparent" ? zoneColor : "#333",
              },
            ]}
          />
        </View>
      </View>
      <Text style={styles.statCol}>{item.played ?? 0}</Text>
      <Text style={styles.statCol}>{item.wins ?? 0}</Text>
      {sportId === 1 && <Text style={styles.statCol}>{item.draws ?? 0}</Text>}
      {sportId === 2 && (
        <>
          <Text style={styles.statCol}>{item.wins_ot ?? 0}</Text>
          <Text style={styles.statCol}>{item.losses_ot ?? 0}</Text>
        </>
      )}
      <Text style={styles.statCol}>{item.losses ?? 0}</Text>
      <Text
        style={[
          styles.statCol,
          { color: goalDiff > 0 ? "#00c853" : "#ef5350" },
        ]}
      >
        {goalDiff > 0 ? `+${goalDiff}` : goalDiff}
      </Text>
      <Text style={[styles.statCol, styles.pointsCol]}>
        {sportId === 3
          ? winRate.toFixed(3).replace(/^0/, "")
          : (item.points ?? 0)}
      </Text>
    </Animated.View>
  );
}

export default function StandingsScreen() {
  const [leagues, setLeagues] = useState([]);
  const [selectedSportId, setSelectedSportId] = useState(1);
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState(null);

  useEffect(() => {
    getMe()
      .then((res) => setIsAdmin(res.data?.role === "admin"))
      .catch(() => setIsAdmin(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      getLeagues().then((res) => {
        const normalized = res.data.map((l) => ({
          ...l,
          sport_id: Number(l.sport_id),
        }));
        setLeagues(normalized);
        setSelectedLeague(
          (prev) =>
            normalized.find((l) => l.sport_id === selectedSportId) || null,
        );
      });
    }, [selectedSportId]),
  );

  useEffect(() => {
    if (!selectedLeague) {
      setStandings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    getLeagueStandings(selectedLeague.id)
      .then((res) => setStandings(res.data))
      .catch(() => setStandings([]))
      .finally(() => setLoading(false));
  }, [selectedLeague]);

  const handleFetchAiPrediction = async () => {
    if (!selectedLeague || standings.length === 0) return;
    setAiLoading(true);
    setAiModalVisible(true);
    try {
      const { data } = await getAiPrediction(selectedLeague.id, {
        teams: standings,
      });
      setAiResponse(data);
    } catch (e) {
      setAiResponse({ analysis: "Ошибка связи с ИИ-сервером." });
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.sportSelector}>
        {SPORTS.map((s) => (
          <TouchableOpacity
            key={s.id}
            style={[
              styles.sportBtn,
              selectedSportId === s.id && styles.sportBtnActive,
            ]}
            onPress={() => setSelectedSportId(s.id)}
          >
            <Text style={styles.sportIcon}>{s.icon}</Text>
            <Text style={styles.sportText}>{s.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.leagueRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {leagues
            .filter((l) => l.sport_id === selectedSportId)
            .map((l) => (
              <TouchableOpacity
                key={l.id}
                style={[
                  styles.leagueBtn,
                  selectedLeague?.id === l.id && styles.leagueActive,
                ]}
                onPress={() => setSelectedLeague(l)}
              >
                <Text style={styles.leagueBtnText}>{l.name}</Text>
              </TouchableOpacity>
            ))}
        </ScrollView>
      </View>
      {standings.length > 0 && (
        <TouchableOpacity
          style={styles.aiButton}
          onPress={handleFetchAiPrediction}
        >
          <Text style={styles.aiButtonText}>🤖 ИИ-Прогноз сезона</Text>
        </TouchableOpacity>
      )}
      <FlatList
        data={standings}
        keyExtractor={(item) => String(item.team_id)}
        renderItem={({ item, index }) => (
          <RowItem
            item={item}
            index={index}
            total={standings.length}
            sportId={selectedSportId}
            maxPoints={Math.max(...standings.map((s) => s.points ?? 0))}
            isAdmin={isAdmin}
            onDelete={(id, name) => {
              /* логика удаления */
            }}
          />
        )}
      />
      <Modal visible={aiModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Аналитика Gemini</Text>
            {aiLoading ? (
              <ActivityIndicator size="large" color="#00c853" />
            ) : (
              <ScrollView>
                {aiResponse?.winner && (
                  <Text style={styles.winnerName}>🏆 {aiResponse.winner}</Text>
                )}
                <Text style={styles.analysisText}>{aiResponse?.analysis}</Text>
              </ScrollView>
            )}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setAiModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  },
  sportBtn: { alignItems: "center", opacity: 0.6 },
  sportBtnActive: {
    opacity: 1,
    borderBottomWidth: 2,
    borderBottomColor: "#00c853",
  },
  sportIcon: { fontSize: 24 },
  sportText: { color: "#fff", fontSize: 12 },
  leagueRow: { paddingHorizontal: 12, marginVertical: 10 },
  leagueBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#16213e",
    marginRight: 8,
  },
  leagueActive: { borderColor: "#00c853", borderWidth: 1 },
  leagueBtnText: { color: "#ccc", fontSize: 11 },
  aiButton: {
    backgroundColor: "#16213e",
    padding: 12,
    marginHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#00c853",
    alignItems: "center",
  },
  aiButtonText: { color: "#00c853", fontWeight: "bold" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#16213e",
    width: "90%",
    maxHeight: "75%",
    padding: 20,
    borderRadius: 16,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 15,
  },
  winnerName: {
    color: "#00c853",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
  },
  analysisText: { color: "#ddd", fontSize: 14, lineHeight: 22 },
  closeButton: {
    backgroundColor: "#2a2a4a",
    padding: 12,
    borderRadius: 10,
    marginTop: 15,
    alignItems: "center",
  },
  closeButtonText: { color: "#fff", fontWeight: "bold" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a4a",
  },
  rowAlt: { backgroundColor: "#16213e" },
  posContainer: { width: 28, alignItems: "center" },
  pos: { color: "#aaa", fontSize: 12 },
  teamContainer: { flex: 1, paddingRight: 6 },
  teamName: { color: "#fff", fontSize: 13, fontWeight: "600" },
  progressBg: {
    height: 2,
    backgroundColor: "#2a2a4a",
    marginTop: 4,
    borderRadius: 1,
  },
  progressFill: { height: 2, borderRadius: 1 },
  statCol: { width: 30, color: "#aaa", fontSize: 12, textAlign: "center" },
  pointsCol: { fontWeight: "800", color: "#fff" },
  zoneStripe: { width: 3, alignSelf: "stretch", marginRight: 3 },
});
