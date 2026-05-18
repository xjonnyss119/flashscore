import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import {
  getSimulationStatus,
  startSimulation,
  stopSimulation,
  getMatches,
  adminUpdateMatch,
  adminDeleteMatch,
  getLeagues,
  adminCreateLeague,
  adminDeleteLeague,
  adminCreateTeam,
} from "../api/api";

export default function AdminScreen() {
  const [simRunning, setSimRunning] = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const [matches, setMatches] = useState([]);
  const [leagues, setLeagues] = useState([]);
  const [activeTab, setActiveTab] = useState("simulation");

  const [newLeagueName, setNewLeagueName] = useState("");
  const [newLeagueCountry, setNewLeagueCountry] = useState("");
  const [selectedSportId, setSelectedSportId] = useState(1);

  const [newTeamName, setNewTeamName] = useState("");
  const [selectedLeagueId, setSelectedLeagueId] = useState(null);
  const [newTeamRating, setNewTeamRating] = useState("50");

  const SPORTS = [
    { id: 1, name: "⚽ Футбол" },
    { id: 2, name: "🏒 Хоккей" },
    { id: 3, name: "🏀 Баскетбол" },
  ];

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [simRes, matchRes, leagueRes] = await Promise.all([
        getSimulationStatus(),
        getMatches({ status: "live" }),
        getLeagues(),
      ]);
      setSimRunning(simRes.data.running);
      setMatches(matchRes.data);
      setLeagues(leagueRes.data);

      if (leagueRes.data.length > 0 && !selectedLeagueId) {
        setSelectedLeagueId(leagueRes.data[0].id);
      }
    } catch (err) {
      console.error("Ошибка при первичной загрузке данных:", err);
    }
  };

  const updateLeaguesList = async () => {
    try {
      const leagueRes = await getLeagues();
      setLeagues(leagueRes.data);
      if (leagueRes.data.length > 0 && !selectedLeagueId) {
        setSelectedLeagueId(leagueRes.data[0].id);
      }
    } catch (err) {
      console.error("Не удалось обновить список лиг:", err);
    }
  };

  const toggleSim = async () => {
    setSimLoading(true);
    try {
      if (simRunning) {
        await stopSimulation();
        setSimRunning(false);
      } else {
        await startSimulation();
        setSimRunning(true);
      }
    } catch {
      Alert.alert("Ошибка", "Не удалось изменить статус симуляции");
    } finally {
      setSimLoading(false);
    }
  };

  const finishMatch = async (id) => {
    Alert.alert("Завершить матч?", "", [
      { text: "Отмена" },
      {
        text: "Завершить",
        onPress: async () => {
          try {
            await adminUpdateMatch(id, { status: "finished" });

            const matchRes = await getMatches({ status: "live" });
            setMatches(matchRes.data);
          } catch (err) {
            console.error(err);
            Alert.alert("Ошибка", "Не удалось завершить матч");
          }
        },
      },
    ]);
  };

  const deleteMatch = async (id) => {
    Alert.alert("Удалить матч?", "", [
      { text: "Отмена" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: async () => {
          try {
            await adminDeleteMatch(id);
            setMatches((prev) => prev.filter((m) => m.id !== id));
          } catch (err) {
            console.error(err);
            Alert.alert("Ошибка", "Не удалось удалить матч");
          }
        },
      },
    ]);
  };

  const createLeague = async () => {
    if (!newLeagueName || !newLeagueCountry || !selectedSportId)
      return Alert.alert("Заполните поля");
    try {
      await adminCreateLeague({
        name: newLeagueName,
        country: newLeagueCountry,
        sport_id: selectedSportId,
      });
      Alert.alert("Успех", "Лига успешно создана");
      setNewLeagueName("");
      setNewLeagueCountry("");
      updateLeaguesList();
    } catch (err) {
      Alert.alert("Ошибка", "Не удалось создать лигу");
    }
  };

  const createTeam = async () => {
    if (!newTeamName || !selectedLeagueId)
      return Alert.alert("Введите название и выберите лигу");
    try {
      await adminCreateTeam({
        name: newTeamName,
        league_id: selectedLeagueId,
        rating: parseInt(newTeamRating) || 50,
      });
      Alert.alert("Успех", "Команда добавлена");
      setNewTeamName("");
      setNewTeamRating("50");
      updateLeaguesList();
    } catch (err) {
      Alert.alert("Ошибка", "Не удалось добавить команду");
    }
  };

  const handleDeleteLeague = (leagueId) => {
    Alert.alert(
      "Удаление лиги",
      "Вы уверены? Это удалит лигу, все её команды и матчи!",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: () => {
            adminDeleteLeague(leagueId)
              .then(() => {
                setLeagues((prevLeagues) =>
                  prevLeagues.filter((l) => l.id !== leagueId),
                );

                if (selectedLeagueId === leagueId) {
                  setSelectedLeagueId(null);
                }

                Alert.alert("Успех", "Лига успешно удалена");
              })
              .catch((err) => {
                console.error("Ошибка удаления лиги на фронте:", err);
                Alert.alert("Ошибка", "Не удалось удалить лигу");
              });
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.tabs}>
        {["simulation", "matches", "leagues"].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={styles.tabText}>
              {tab === "simulation"
                ? "⚙️ Симуляция"
                : tab === "matches"
                  ? "⚽ Матчи"
                  : "🏆 Структура"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === "simulation" && (
        <View style={styles.section}>
          <View style={styles.simStatus}>
            <View
              style={[
                styles.simDot,
                { backgroundColor: simRunning ? "#00c853" : "#e53935" },
              ]}
            />
            <Text style={styles.simText}>
              {simRunning ? "Симуляция запущена" : "Симуляция остановлена"}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.btn,
              { backgroundColor: simRunning ? "#b71c1c" : "#00c853" },
            ]}
            onPress={toggleSim}
            disabled={simLoading}
          >
            {simLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>
                {simRunning ? "⏹ Остановить" : "▶️ Запустить"}
              </Text>
            )}
          </TouchableOpacity>
          <Text style={styles.note}>
            При включённой симуляции сервер автоматически обновляет активные
            матчи каждые 10 секунд.
          </Text>
        </View>
      )}

      {activeTab === "matches" && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Live-матчи</Text>
          {matches.length === 0 && (
            <Text style={styles.empty}>Нет активных матчей</Text>
          )}
          {matches.map((m) => (
            <View key={m.id} style={styles.matchCard}>
              <Text style={styles.matchTitle}>
                {m.home_team} {m.home_score}:{m.away_score} {m.away_team}
              </Text>
              <Text style={styles.matchMin}>{m.minute}'</Text>
              <View style={styles.matchActions}>
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: "#e65100" }]}
                  onPress={() => finishMatch(m.id)}
                >
                  <Text style={styles.smallBtnText}>Завершить</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: "#b71c1c" }]}
                  onPress={() => deleteMatch(m.id)}
                >
                  <Text style={styles.smallBtnText}>Удалить</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {activeTab === "leagues" && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Создать новую лигу</Text>
          <TextInput
            style={styles.input}
            placeholder="Название лиги (например: НХЛ, МФЛ)"
            placeholderTextColor="#888"
            value={newLeagueName}
            onChangeText={setNewLeagueName}
          />
          <TextInput
            style={styles.input}
            placeholder="Страна лиги"
            placeholderTextColor="#888"
            value={newLeagueCountry}
            onChangeText={setNewLeagueCountry}
          />

          <Text style={styles.subLabel}>Выберите вид спорта для лиги:</Text>
          <View style={styles.sportSelector}>
            {SPORTS.map((sport) => (
              <TouchableOpacity
                key={sport.id}
                style={[
                  styles.sportSelectorItem,
                  selectedSportId === sport.id &&
                    styles.sportSelectorItemActive,
                ]}
                onPress={() => setSelectedSportId(sport.id)}
              >
                <Text style={styles.sportSelectorText}>{sport.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.btn} onPress={createLeague}>
            <Text style={styles.btnText}>➕ Создать лигу</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>2. Добавить команду в лигу</Text>
          <TextInput
            style={styles.input}
            placeholder="Название команды"
            placeholderTextColor="#888"
            value={newTeamName}
            onChangeText={setNewTeamName}
          />
          <TextInput
            style={styles.input}
            placeholder="Сила / Рейтинг (1-100)"
            placeholderTextColor="#888"
            keyboardType="numeric"
            value={newTeamRating}
            onChangeText={setNewTeamRating}
          />

          <Text style={styles.subLabel}>Выберите лигу назначения:</Text>
          {leagues.length === 0 ? (
            <Text style={styles.empty}>Сначала создайте хотя бы одну лигу</Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.leagueSelector}
            >
              {leagues.map((l) => (
                <TouchableOpacity
                  key={l.id}
                  style={[
                    styles.leagueSelectorItem,
                    selectedLeagueId === l.id &&
                      styles.leagueSelectorItemActive,
                  ]}
                  onPress={() => setSelectedLeagueId(l.id)}
                >
                  <Text style={styles.leagueSelectorText}>
                    {l.name} ({l.country})
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: "#1e88e5" }]}
            onPress={createTeam}
            disabled={leagues.length === 0}
          >
            <Text style={styles.btnText}>⚽ Добавить команду</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <Text style={[styles.sectionTitle, { marginTop: 10 }]}>
            Список созданных лиг
          </Text>
          {leagues.map((l) => (
            <View key={l.id} style={styles.leagueRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.leagueName}>
                  {l.name} ({l.country})
                </Text>
                <Text style={styles.leagueSportSub}>
                  {Number(l.sport_id) === 1
                    ? "⚽ Футбол"
                    : Number(l.sport_id) === 2
                      ? "🏒 Хоккей"
                      : "🏀 Баскетбол"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleDeleteLeague(l.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.deleteText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a2e" },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#16213e",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  tab: { flex: 1, padding: 14, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: "#00c853" },
  tabText: { color: "#ccc", fontSize: 12 },
  section: { padding: 16 },
  sectionTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 12,
  },
  subLabel: { color: "#aaa", fontSize: 13, marginBottom: 8, marginTop: 4 },
  simStatus: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  simDot: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
  simText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  btn: {
    backgroundColor: "#00c853",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  note: { color: "#888", fontSize: 12, lineHeight: 18 },
  matchCard: {
    backgroundColor: "#16213e",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  matchTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  matchMin: { color: "#00c853", fontSize: 12, marginBottom: 8 },
  matchActions: { flexDirection: "row", gap: 8 },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  smallBtnText: { color: "#fff", fontSize: 12 },
  input: {
    backgroundColor: "#16213e",
    color: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#333",
  },
  sportSelector: { flexDirection: "row", gap: 8, marginBottom: 16 },
  sportSelectorItem: {
    flex: 1,
    backgroundColor: "#16213e",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  sportSelectorItemActive: {
    borderColor: "#00c853",
    backgroundColor: "#1a3a2a",
  },
  sportSelectorText: { color: "#fff", fontSize: 12, fontWeight: "500" },
  leagueSelector: { flexDirection: "row", marginBottom: 16, paddingBottom: 4 },
  leagueSelectorItem: {
    backgroundColor: "#16213e",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#333",
  },
  leagueSelectorItemActive: {
    borderColor: "#1e88e5",
    backgroundColor: "#0d2a4a",
  },
  leagueSelectorText: { color: "#fff", fontSize: 12 },
  divider: { height: 1, backgroundColor: "#333", marginVertical: 20 },
  leagueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#16213e",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  leagueName: { color: "#fff", fontSize: 14, fontWeight: "500" },
  leagueSportSub: { color: "#888", fontSize: 11, marginTop: 2 },
  deleteText: { color: "#e53935", fontSize: 18, paddingHorizontal: 6 },
  empty: { color: "#888", textAlign: "center", padding: 10 },
});
