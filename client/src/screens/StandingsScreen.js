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
import { getLeagues, getStandings, adminDeleteTeam, getMe } from "../api/api";

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
    return "transparent";
  }

  if (sportId === 2 || sportId === 3) {
    if (position <= 8) return "#00c853";
    return "transparent";
  }

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
  }, [index, fadeAnim, slideAnim]);

  const zoneColor = getZoneColor(index, total, sportId);
  const goalDiff = (item.goals_for || 0) - (item.goals_against || 0);
  const goalDiffText = goalDiff > 0 ? `+${goalDiff}` : `${goalDiff}`;
  const goalDiffColor =
    goalDiff > 0 ? "#00c853" : goalDiff < 0 ? "#ef5350" : "#aaa";

  const winRate = item.played > 0 ? item.wins / item.played : 0;
  const progressRatio =
    sportId === 3
      ? winRate
      : maxPoints > 0
        ? (item.points || 0) / maxPoints
        : 0;
  const isTop = index === 0;

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
        <Text style={[styles.pos, isTop && { color: "#ffd700" }]}>
          {index + 1}
        </Text>
      </View>

      <View style={[styles.teamContainer, isAdmin && { marginRight: 4 }]}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 4,
          }}
        >
          <Text
            style={[styles.teamName, isTop && { color: "#ffd700" }]}
            numberOfLines={1}
          >
            {item.team_name}
          </Text>
          {isAdmin && (
            <TouchableOpacity
              onPress={() => onDelete(item.team_id, item.team_name)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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

      <Text style={[styles.statCol, { color: goalDiffColor }]}>
        {goalDiffText}
      </Text>

      <Text
        style={[
          styles.statCol,
          styles.pointsCol,
          sportId === 3 && { width: 40 },
        ]}
      >
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

  // СТЕЙТЫ ДЛЯ РАБОТЫ С ИИ ПРЕДИКТОРOM
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState(null);

  // Проверка прав администратора (строго 1 раз при монтировании)
  useEffect(() => {
    getMe()
      .then((res) => {
        setIsAdmin(res.data && res.data.role === "admin");
      })
      .catch(() => setIsAdmin(false));
  }, []);

  // Фокусный эффект для загрузки лиг и безопасного выставления активной лиги
  useFocusEffect(
    useCallback(() => {
      getLeagues().then((res) => {
        const normalized = res.data.map((l) => ({
          ...l,
          sport_id: Number(l.sport_id),
        }));
        setLeagues(normalized);

        // Корректно выбираем или сохраняем текущую лигу без создания бесконечных петель
        setSelectedLeague((prevSelected) => {
          if (prevSelected) {
            const stillExists = normalized.find(
              (l) => l.id === prevSelected.id,
            );
            if (stillExists && stillExists.sport_id === selectedSportId) {
              return stillExists;
            }
          }
          return normalized.find((l) => l.sport_id === selectedSportId) || null;
        });
      });
    }, [selectedSportId]),
  );

  // Фильтруем лиги прямо во время рендеринга
  const filteredLeagues = leagues.filter((l) => l.sport_id === selectedSportId);

  // Слушатель для автоматического переключения на первую доступную лигу при смене вида спорта
  useEffect(() => {
    if (filteredLeagues.length > 0) {
      if (!selectedLeague || selectedLeague.sport_id !== selectedSportId) {
        setSelectedLeague(filteredLeagues[0]);
      }
    } else {
      if (selectedLeague !== null) {
        setSelectedLeague(null);
        setStandings([]);
      }
    }
  }, [selectedSportId, leagues]);

  // Загрузка турнирной таблицы при смене лиги
  useEffect(() => {
    if (!selectedLeague) {
      setStandings([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    getStandings(selectedLeague.id)
      .then((res) => setStandings(res.data))
      .catch(() => setStandings([]))
      .finally(() => setLoading(false));
  }, [selectedLeague]);

  // ФУНКЦИЯ ОПРОСА СЕРВЕРНОГО ИИ-АНАЛИТИКА
  const handleFetchAiPrediction = async () => {
    if (!selectedLeague || standings.length === 0) {
      Alert.alert("Внимание", "Нет данных для генерации прогноза.");
      return;
    }

    setAiLoading(true);
    setAiModalVisible(true);

    try {
      // Меняем URL на твой рабочий хост на Render, когда зальешь туда бэк, либо локальный для тестов
      // Передаем только sportId, а саму таблицу кидаем в body
      const response = await fetch(
        `http://flashscore-backend-r1js.onrender.com/api/teams/ai-prediction?sportId=${selectedSportId}`,
        {
          method: "POST", // Меняем метод на POST
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ teams: standings }), // Передаем актуальные команды с очками
        }
      );
      
      const data = await response.json();
      
      if (response.ok) {
        setAiResponse(data);
      } else {
        setAiResponse({ analysis: data.error || "Произошла ошибка при генерации прогноза." });
      }
    } catch (error) {
      console.error("[FRONT] AI Fetch error:", error);
      setAiResponse({
        analysis: "Ошибка соединения с сервером предиктивной аналитики. Проверьте сеть или статус бэкенда.",
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleDeleteTeam = (teamId, teamName) => {
    Alert.alert(
      "Удаление команды",
      `Вы уверены, что хотите полностью удалить команду "${teamName}" из этой лиги?`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: () => {
            adminDeleteTeam(teamId)
              .then(() => {
                setStandings((prev) =>
                  prev.filter((t) => t.team_id !== teamId),
                );
              })
              .catch((err) => {
                Alert.alert("Ошибка", "Не удалось удалить команду с сервера");
                console.error(err);
              });
          },
        },
      ],
    );
  };

  const maxPoints =
    standings.length > 0 ? Math.max(...standings.map((s) => s.points ?? 0)) : 1;

  const renderLegend = () => {
    if (standings.length === 0) return null;

    let legendItems = [];
    if (selectedSportId === 1) {
      legendItems = [
        { color: "#00c853", label: "Лига чемпионов" },
        { color: "#1e88e5", label: "Лига Европы" },
        { color: "#ef5350", label: "Вылет" },
      ];
    } else if (selectedSportId === 2 || selectedSportId === 3) {
      legendItems = [{ color: "#00c853", label: "Зона Плей-офф" }];
    }

    if (legendItems.length === 0) return null;

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.legendScroll}
      >
        <View style={styles.legend}>
          {legendItems.map((z) => (
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
        {SPORTS.map((sport) => (
          <TouchableOpacity
            key={sport.id}
            style={[
              styles.sportBtn,
              selectedSportId === sport.id && styles.sportBtnActive,
            ]}
            onPress={() => setSelectedSportId(sport.id)}
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

      <View style={styles.leagueRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {filteredLeagues.map((l) => (
            <TouchableOpacity
              key={l.id}
              style={[
                styles.leagueBtn,
                selectedLeague?.id === l.id && styles.leagueActive,
              ]}
              onPress={() => setSelectedLeague(l)}
              activeOpacity={0.7}
            >
              <Text style={styles.leagueBtnText}>{l.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {renderLegend()}

      {standings.length > 0 && (
        <TouchableOpacity
          style={styles.aiButton}
          onPress={handleFetchAiPrediction}
        >
          <Text style={styles.aiButtonText}>
            🤖 Сгенерировать ИИ-прогноз сезона
          </Text>
        </TouchableOpacity>
      )}

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

        <Text
          style={[
            styles.statHeader,
            styles.pointsCol,
            { color: "#00c853" },
            selectedSportId === 3 && { width: 40 },
          ]}
        >
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
          keyExtractor={(item) => String(item.id || item.team_id)}
          renderItem={({ item, index }) => (
            <RowItem
              item={item}
              index={index}
              total={standings.length}
              sportId={selectedSportId}
              maxPoints={maxPoints}
              onDelete={handleDeleteTeam}
              isAdmin={isAdmin}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>📊</Text>
              <Text style={styles.emptyText}>Нет данных для этой лиги</Text>
              <Text style={styles.emptyHint}>
                Данные появятся после завершения матчей
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}

      <Modal
        animationType="fade"
        transparent={true}
        visible={aiModalVisible}
        onRequestClose={() => setAiModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Аналитический ИИ-Прогноз</Text>

            {aiLoading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color="#00c853" />
                <Text style={styles.loadingText}>
                  ИИ генерирует Round-Robin календарь, симулирует оставшиеся
                  туры в памяти сервера и формирует спортивную сводку...
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.scrollContainer}
                showsVerticalScrollIndicator={false}
              >
                {aiResponse?.winner && (
                  <View style={styles.winnerBadge}>
                    <Text style={styles.winnerLabel}>
                      🏆 Потенциальный чемпион:
                    </Text>
                    <Text style={styles.winnerName}>{aiResponse.winner}</Text>
                  </View>
                )}
                <Text style={styles.analysisText}>
                  {aiResponse?.analysis || "Нет доступных данных."}
                </Text>
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setAiModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>Закрыть отчет</Text>
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
    flex: 1,
    maxHeight: 65,
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
  leagueRow: { paddingHorizontal: 12, marginVertical: 10 },
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
  legendScroll: { maxHeight: 30, backgroundColor: "#1a1a2e" },
  legend: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingBottom: 4,
    gap: 16,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: "#888", fontSize: 10 },

  // КНОПКА ИИ
  aiButton: {
    backgroundColor: "#16213e",
    paddingVertical: 12,
    borderRadius: 12,
    marginHorizontal: 12,
    marginBottom: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#00c853",
  },
  aiButtonText: {
    color: "#00c853",
    fontWeight: "bold",
    fontSize: 13,
  },

  // МОДАЛЬНОЕ ОКНО СТИЛИ
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#16213e",
    width: "90%",
    maxHeight: "75%",
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  modalTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "center",
  },
  loadingBox: {
    alignItems: "center",
    marginVertical: 30,
  },
  loadingText: {
    color: "#aaa",
    marginTop: 15,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 20,
  },
  scrollContainer: {
    marginVertical: 10,
  },
  winnerBadge: {
    backgroundColor: "rgba(0, 200, 83, 0.1)",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(0, 200, 83, 0.4)",
    marginBottom: 12,
    alignItems: "center",
  },
  winnerLabel: {
    color: "#aaa",
    fontSize: 12,
  },
  winnerName: {
    color: "#00c853",
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 2,
  },
  analysisText: {
    color: "#ddd",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "left",
  },
  closeButton: {
    backgroundColor: "#2a2a4a",
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 10,
    alignItems: "center",
  },
  closeButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },

  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16213e",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a4a",
  },
  posHeader: {
    width: 28,
    color: "#aaa",
    fontSize: 11,
    textAlign: "center",
    fontWeight: "700",
  },
  teamHeader: {
    flex: 1,
    color: "#aaa",
    fontSize: 11,
    fontWeight: "700",
    paddingLeft: 4,
  },
  statHeader: {
    width: 30,
    color: "#aaa",
    fontSize: 11,
    textAlign: "center",
    fontWeight: "700",
  },
  zoneStripe: {
    width: 3,
    alignSelf: "stretch",
    marginRight: 3,
    borderRadius: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a4a",
  },
  rowAlt: { backgroundColor: "#16213e" },
  posContainer: { width: 28, alignItems: "center" },
  pos: { color: "#aaa", fontSize: 12, fontWeight: "700" },
  teamContainer: { flex: 1, paddingLeft: 4, paddingRight: 6 },
  teamName: { color: "#fff", fontSize: 13, fontWeight: "600", flex: 1 },
  deleteBtnIcon: { fontSize: 11, opacity: 0.8, paddingHorizontal: 4 },
  progressBg: {
    height: 2,
    backgroundColor: "#2a2a4a",
    borderRadius: 1,
    marginTop: 4,
    overflow: "hidden",
  },
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
