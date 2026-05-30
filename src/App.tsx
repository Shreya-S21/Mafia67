// App root: routing, auth gate, layout
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { Landing } from "./components/Landing";
import { AuthPage } from "./components/Auth";
import { Lobby } from "./components/Lobby";
import { Game } from "./components/Game";
import { Profile } from "./components/Profile";
import { Leaderboard } from "./components/Leaderboard";
import { Spinner } from "./components/ui";

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Spinner size={32} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={user ? <Navigate to="/" replace /> : <AuthPage />} />
        <Route
          path="/lobby/:code"
          element={user ? <Lobby /> : <Navigate to="/auth" replace />}
        />
        <Route
          path="/game/:code"
          element={user ? <Game /> : <Navigate to="/auth" replace />}
        />
        <Route
          path="/profile"
          element={user ? <Profile /> : <Navigate to="/auth" replace />}
        />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
