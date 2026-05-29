import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "../api/client";

const UserContext = createContext({
  user: null,
  mainCurrency: "RUB",
  loading: true,
  refresh: () => {},
  updateMainCurrency: async () => {},
});

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
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

  useEffect(() => { refresh(); }, [refresh]);

  const updateMainCurrency = useCallback(async (currency) => {
    const res = await api.put("/api/me/", { main_currency: currency });
    setUser(res.data);
  }, []);

  return (
    <UserContext.Provider value={{
      user,
      mainCurrency: user?.main_currency || "RUB",
      loading,
      refresh,
      updateMainCurrency,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
