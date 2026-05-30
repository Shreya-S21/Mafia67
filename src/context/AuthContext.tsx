import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, auth, isFirebaseConfigured, type FBUser } from "../lib/firebase";
import { createProfile, loadProfile, saveProfile, addMatchToProfile } from "../lib/storage";
import { saveUserToDB, updateUserStats, getLeaderboardDB } from "../lib/db";
import { cryptoId } from "../lib/db";
import type { UserProfile, Role } from "../lib/types";

interface AuthUser {
  uid: string;
  username: string;
  email?: string | null;
  avatar?: string | null;
  isDemo?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  profile: UserProfile | null;
  loading: boolean;
  firebaseReady: boolean;
  signInDemo: (username: string) => void;
  signOutUser: () => Promise<void>;
  refreshProfile: () => void;
  setProfile: (p: UserProfile) => void;
  updateUserStats: (role: Role, won: boolean, points: number, playersCount: number, roundsPlayed: number) => Promise<void>;
  getLeaderboard: () => Promise<{ uid: string; username: string; avatar?: string; totalPoints: number; gamesWon: number; totalGamesPlayed: number }[]>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const DEMO_USER_KEY = "mafia.demoUser";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      // Demo mode
      const raw = localStorage.getItem(DEMO_USER_KEY);
      if (raw) {
        try {
          const demo = JSON.parse(raw) as AuthUser;
          setUser(demo);
          const prof = loadProfile(demo.uid);
          if (prof) setProfileState(prof);
        } catch {}
      }
      setLoading(false);
      return;
    }

    // Firebase mode
    const unsub = onAuthStateChanged(auth!, (fbUser: FBUser | null) => {
      if (fbUser) {
        const u: AuthUser = {
          uid: fbUser.uid,
          username: fbUser.displayName || fbUser.email?.split("@")[0] || "Player",
          email: fbUser.email,
          avatar: fbUser.photoURL,
        };
        setUser(u);
        const existing = loadProfile(u.uid);
        if (existing) {
          setProfileState(existing);
        } else {
          const p = createProfile(u.uid, u.username, u.email ?? undefined, u.avatar ?? undefined);
          saveProfile(p);
          setProfileState(p);
        }
        // Save to Firebase DB
        saveUserToDB(u.uid, u.username, u.email ?? undefined, u.avatar ?? undefined);
      } else {
        setUser(null);
        setProfileState(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  function signInDemo(username: string) {
    const uid = "demo_" + cryptoId().slice(0, 8);
    const u: AuthUser = { uid, username, isDemo: true };
    localStorage.setItem(DEMO_USER_KEY, JSON.stringify(u));
    setUser(u);
    const p = createProfile(uid, username);
    saveProfile(p);
    setProfileState(p);
  }

  async function signOutUser() {
    if (user?.isDemo) {
      localStorage.removeItem(DEMO_USER_KEY);
      setUser(null);
      setProfileState(null);
      return;
    }
    if (isFirebaseConfigured && auth) {
      const { signOut } = await import("../lib/firebase");
      await signOut();
    }
    setUser(null);
    setProfileState(null);
  }

  function refreshProfile() {
    if (user) {
      const p = loadProfile(user.uid);
      if (p) setProfileState(p);
    }
  }

  function setProfile(p: UserProfile) {
    setProfileState(p);
  }

  async function updateUserStatsFn(role: Role, won: boolean, points: number, playersCount: number, roundsPlayed: number) {
    if (!user) return;
    if (isFirebaseConfigured) {
      await updateUserStats(user.uid, role, won, points, playersCount, roundsPlayed);
    }
    // Also update local storage
    if (profile) {
      const updated = addMatchToProfile(profile, {
        id: cryptoId(), date: Date.now(), role, won, pointsEarned: points, playersCount, roundsPlayed,
      });
      setProfileState(updated);
    }
  }

  async function getLeaderboardFn() {
    if (isFirebaseConfigured) {
      return await getLeaderboardDB();
    }
    // Fallback to local storage
    const { getLeaderboard, seedDemoLeaderboard } = await import("../lib/storage");
    seedDemoLeaderboard();
    const local = getLeaderboard();
    return local.map(l => ({ uid: l.id, username: l.username, avatar: l.avatar, totalPoints: l.totalPoints, gamesWon: l.gamesWon, totalGamesPlayed: l.totalGamesPlayed }));
  }

  return (
    <AuthContext.Provider
      value={{
        user, profile, loading, firebaseReady: isFirebaseConfigured,
        signInDemo, signOutUser, refreshProfile, setProfile,
        updateUserStats: updateUserStatsFn, getLeaderboard: getLeaderboardFn,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
