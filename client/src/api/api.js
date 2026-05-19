import axios from "axios";

// Убери пробел перед https
const BASE_URL = "https://flashscore-backend-r1js.onrender.com/api";

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  timeout: 120000,
});

// --- AUTH ---
export const register = (email, password) =>
  api.post("/auth/register", { email, password });
export const verifyEmail = (email, code) =>
  api.post("/auth/verify", { email, code });
export const login = (email, password) =>
  api.post("/auth/login", { email, password });
export const logout = () => api.post("/auth/logout");
export const getMe = () => api.get("/auth/me");

// --- MATCHES ---
// getMatches теперь принимает params (status, league_id и т.д.), это отлично
export const getMatches = (params = {}) => api.get("/matches", { params });
export const getMatch = (id) => api.get(`/matches/${id}`);

// --- LEAGUES & STANDINGS & AI ---
export const getLeagues = () => api.get("/leagues");
export const createLeague = (data) => api.post("/leagues", data); // Раньше было в admin, теперь в общем роуте
export const updateLeague = (id, data) => api.put(`/leagues/${id}`, data);

// Теперь мы берем таблицу и состояние через один эндпоинт
export const getLeagueStandings = (leagueId) =>
  api.get(`/leagues/${leagueId}/standings`);

// НОВЫЙ ИИ-РОУТ: отправляем данные таблицы для получения прогноза
export const getAiPrediction = (leagueId, data) =>
  api.post(`/leagues/${leagueId}/ai-prediction`, data);

// --- TEAMS ---
export const getTeams = (params = {}) => api.get("/teams", { params });
export const createTeam = (data) => api.post("/teams", data);
export const updateTeam = (id, data) => api.patch(`/teams/${id}`, data); // Используем patch, как договорились
export const deleteTeam = (id) => api.delete(`/teams/${id}`);

// --- USER (Favorites, Notifications, History) ---
export const getFavorites = () => api.get("/user/favorites");
export const addFavorite = (data) => api.post("/user/favorites", data);
export const removeFavorite = (id) => api.delete(`/user/favorites/${id}`);
export const getNotifications = () => api.get("/user/notifications");
export const markNotificationRead = (id) =>
  api.patch(`/user/notifications/${id}/read`);
export const getHistory = () => api.get("/user/history");

// --- ADMIN (Оставь здесь только специфичные админские вещи, если они остались) ---
// Если ты перенес создание команд/лиг в основные роуты, то в админских роутах они больше не нужны
export const adminCreateMatch = (data) => api.post("/matches", data); // Если роут теперь основной
export const adminUpdateMatch = (id, data) => api.patch(`/matches/${id}`, data);
export const adminDeleteMatch = (id) => api.delete(`/matches/${id}`);
export const adminAddEvent = (matchId, data) =>
  api.post(`/matches/${matchId}/events`, data);

export default api;
