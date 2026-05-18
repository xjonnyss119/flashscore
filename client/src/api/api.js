import axios from "axios";

const BASE_URL = " https://flashscore-backend-r1js.onrender.com/api"

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  timeout: 60000,
});



export const register = (email, password) =>
  api.post("/auth/register", { email, password });

export const verifyEmail = (email, code) => 
  api.post("/auth/verify", { email, code });

export const login = (email, password) =>
  api.post("/auth/login", { email, password });

export const logout = () => api.post("/auth/logout");

export const getMe = () => api.get("/auth/me");



export const getMatches = (params = {}) => api.get("/matches", { params });

export const getMatch = (id) => api.get(`/matches/${id}`);



export const getLeagues = () => api.get("/leagues");

export const getStandings = (leagueId) =>
  api.get(`/leagues/${leagueId}/standings`);



export const getTeams = (search) => api.get("/teams", { params: { search } });


export const getFavorites = () => api.get("/user/favorites");

export const addFavorite = (data) => api.post("/user/favorites", data);

export const removeFavorite = (id) => api.delete(`/user/favorites/${id}`);

export const getNotifications = () => api.get("/user/notifications");

export const markNotificationRead = (id) =>
  api.patch(`/user/notifications/${id}/read`);

export const getHistory = () => api.get("/user/history");




export const adminCreateMatch = (data) => api.post("/admin/matches", data);
export const adminUpdateMatch = (id, data) =>
  api.patch(`/admin/matches/${id}`, data);
export const adminDeleteMatch = (id) => api.delete(`/admin/matches/${id}`);
export const adminAddEvent = (matchId, data) =>
  api.post(`/admin/matches/${matchId}/events`, data);


export const adminCreateLeague = ({ name, country, sport_id }) =>
  api.post("/admin/leagues", { name, country, sport_id });
export const adminUpdateLeague = (id, data) =>
  api.put(`/admin/leagues/${id}`, data);
export const adminDeleteLeague = (id) => api.delete(`/admin/leagues/${id}`);


export const adminCreateTeam = ({ name, league_id, rating }) =>
  api.post("/admin/teams", { name, league_id, rating });
export const adminUpdateTeam = (id, data) =>
  api.put(`/admin/teams/${id}`, data);
export const adminDeleteTeam = (id) => api.delete(`admin/teams/${id}`);


export const getSimulationStatus = () => api.get("/admin/simulation/status");
export const startSimulation = () => api.post("/admin/simulation/start");
export const stopSimulation = () => api.post("/admin/simulation/stop");

export default api;
