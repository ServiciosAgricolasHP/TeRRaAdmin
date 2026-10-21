import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import NoAccess from "../screens/NoAccess";
import ScreenLoader from "./ScreenLoader";

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading, hasAccess, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) {
    return <ScreenLoader className="h-screen" />;
  }

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!hasAccess) return <NoAccess />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;

  return children;
}
