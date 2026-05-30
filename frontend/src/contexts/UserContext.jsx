import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "../api/client";

const UserContext = createContext({
  user: null,
  mainCurrency: "RUB",
  loading: true,
  limits: null,
  isPremium: false,
  refresh: () => {},
  refreshLimits: () => {},
  updateMainCurrency: async () => {},
  upgrade: async () => {},
});

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [limits, setLimits] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get("/api/me/");
      setUser(res.data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshLimits = useCallback(async () => {
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

  const upgrade = useCallback(async () => {
    const res = await api.post("/api/me/upgrade");
    setUser(res.data);
    refreshLimits();
  }, [refreshLimits]);

  return (
    <UserContext.Provider value={{
      user,
      mainCurrency: user?.main_currency || "RUB",
      loading,
      limits,
      isPremium: !!limits?.premium || !!user?.is_premium,
      refresh,
      refreshLimits,
      updateMainCurrency,
      upgrade,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
