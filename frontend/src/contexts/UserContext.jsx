import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "../api/client";
import { cachedUserData, saveReferenceData } from "../services/offlineReferenceData";

const UserContext = createContext({
  user: null,
  mainCurrency: "RUB",
  loading: true,
  limits: null,
  refresh: () => {},
  refreshLimits: () => {},
  updateMainCurrency: async () => {},
});

export function UserProvider({ children }) {
  const [user, setUser] = useState(() => cachedUserData());
  const [limits, setLimits] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const cached = cachedUserData();
    if (cached) setUser(cached);
    if (navigator.onLine === false) {
      setLoading(false);
      return;
    }
    try {
      const res = await api.get("/api/me/");
      setUser(res.data);
      saveReferenceData({ user: res.data });
    } catch {
      setUser(current => current || cached);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshLimits = useCallback(async () => {
    if (navigator.onLine === false) return;
    try {
      const res = await api.get("/api/me/limits");
      setLimits(res.data);
    } catch {
      setLimits(null);
    }
  }, []);

  useEffect(() => {
    refresh();
    refreshLimits();
  }, [refresh, refreshLimits]);

  const updateMainCurrency = useCallback(async (currency) => {
    const res = await api.put("/api/me/", { main_currency: currency });
    setUser(res.data);
  }, []);

  return (
    <UserContext.Provider value={{
      user,
      mainCurrency: user?.main_currency || "RUB",
      loading,
      limits,
      refresh,
      refreshLimits,
      updateMainCurrency,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
