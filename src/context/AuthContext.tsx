import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { User, AuthResponse, TwoFactorMethod } from "../types";
import { api, getApiToken, setApiToken } from "../services/api";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAdmin: boolean;
  login: (username: string, pass: string) => Promise<AuthResponse>;
  verify2FA: (payload: {
    challengeId: string;
    method: TwoFactorMethod;
    code?: string;
    totpSecret?: string;
    grid?: any;
    save2FA?: boolean;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  acceptTerms: (version?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const urlTok = urlParams.get("token");
      if (urlTok) {
        setApiToken(urlTok);
        return urlTok;
      }
    }
    return getApiToken() || null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Ignorer erreur réseau au logout
    } finally {
      setApiToken(null);
      setToken(null);
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    let currentTok = getApiToken();
    if (!currentTok && typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const urlTok = urlParams.get("token");
      if (urlTok) {
        setApiToken(urlTok);
        currentTok = urlTok;
      }
    }
    if (!currentTok) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const me = await api.getMe();
      setUser(me);
      setToken(currentTok);
    } catch (err) {
      console.warn("Session expirée ou invalide :", err);
      setApiToken(null);
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();

    // Écoute de l'événement global 401
    const handleUnauthorized = () => {
      logout();
    };

    window.addEventListener("cartable:unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("cartable:unauthorized", handleUnauthorized);
    };
  }, [refreshUser, logout]);

  const login = async (username: string, pass: string): Promise<AuthResponse> => {
    const res = await api.login(username, pass);
    if (res.token && res.user) {
      setUser(res.user);
      setToken(res.token);
    }
    return res;
  };

  const verify2FA = async (payload: {
    challengeId: string;
    method: TwoFactorMethod;
    code?: string;
    totpSecret?: string;
    grid?: any;
    save2FA?: boolean;
  }) => {
    const res = await api.verify2FA(payload);
    if (res.token && res.user) {
      setUser(res.user);
      setToken(res.token);
    }
  };

  const acceptTerms = async (version = "1.0") => {
    const res = await api.acceptTerms(version);
    setUser(res.user);
  };

  const isAdmin = user?.role === "admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAdmin,
        login,
        verify2FA,
        logout,
        refreshUser,
        acceptTerms,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
