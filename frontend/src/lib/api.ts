import axios from "axios";
import { useAuthStore } from "@/stores/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = useAuthStore.getState().refreshToken;
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_URL}/auth/refresh`, {
            refreshToken,
          });
          useAuthStore.getState().setTokens(data.accessToken, data.refreshToken);
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(original);
        } catch {
          useAuthStore.getState().logout();
        }
      } else {
        useAuthStore.getState().logout();
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  register: (email: string, password: string) =>
    api.post("/auth/register", { email, password }),
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }),
  refresh: (refreshToken: string) =>
    api.post("/auth/refresh", { refreshToken }),
  me: () => api.get("/auth/me"),
  googleUrl: () => `${API_URL}/auth/google`,
};

// Documents API
export const documentsApi = {
  upload: (files: File | File[], hipaaMode: boolean) => {
    const form = new FormData();
    const fileList = Array.isArray(files) ? files : [files];
    for (const f of fileList) {
      form.append("files", f);
    }
    form.append("hipaaMode", String(hipaaMode));
    return api.post("/documents/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  list: (page = 1, limit = 20) =>
    api.get("/documents", { params: { page, limit } }),
  get: (id: string) => api.get(`/documents/${id}`),
  statusStream: (id: string) => {
    const token = useAuthStore.getState().accessToken;
    return new EventSource(
      `${API_URL}/documents/${id}/status?token=${token}`
    );
  },
};
