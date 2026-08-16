import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faMoon, faSun } from "@fortawesome/free-solid-svg-icons";
import Sidebar from "./components/Sidebar/Sidebar.jsx";
import DashboardView from "./pages/Dashboard/DashboardView.jsx";
import DriversView from "./pages/Drivers/DriversView.jsx";
import EquipmentView from "./pages/Equipment/EquipmentView.jsx";
import AirlinesView from "./pages/Airlines/AirlinesView.jsx";
import WarehousesView from "./pages/Warehouses/WarehousesView.jsx";
import ImportsView from "./pages/Imports/ImportsView.jsx";
import ExportsView from "./pages/Exports/ExportsView.jsx";
import DispatchView from "./pages/Dispatch/DispatchView.jsx";
import HandoffView from "./pages/Handoff/HandoffView.jsx";
import CalendarView from "./pages/Calendar/CalendarView.jsx";
import AnalyticsView from "./pages/Analytics/AnalyticsView.jsx";
import styles from "./App.module.css";
import AuthView from "./pages/Auth/AuthView.jsx";
import ForceChangePassword from "./pages/Auth/ForceChangePassword.jsx";
import { clearAuthToken, getAuthToken, getCurrentUser } from "./api/api.js";
import logo from "../images/app-logo.jpeg";
import UsersView from "./pages/Users/UsersView.jsx";
import { getPermission } from "./permissions.js";

const getInitialTheme = () => {
  if (typeof window === "undefined") return "dark";

  const storedTheme = window.localStorage.getItem("dispatch-theme");
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
};

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [theme, setTheme] = useState(getInitialTheme);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("dispatch-theme", theme);
  }, [theme]);

  useEffect(() => {
    const expire = () => setUser(null);
    // Fires if a protected call comes back 403 PASSWORD_CHANGE_REQUIRED mid-session
    // (e.g. an admin reset this person's password while they were still logged in
    // elsewhere) — flips the flag locally so the guard below takes over immediately,
    // no need to log the person out and back in.
    const forcePasswordChange = () =>
      setUser((current) => (current ? { ...current, mustChangePassword: true } : current));
    window.addEventListener('dispatch:auth-expired', expire);
    window.addEventListener('dispatch:password-change-required', forcePasswordChange);
    if (!getAuthToken()) {
      setCheckingAuth(false);
      return () => {
        window.removeEventListener('dispatch:auth-expired', expire);
        window.removeEventListener('dispatch:password-change-required', forcePasswordChange);
      };
    }
    getCurrentUser()
      .then((result) => setUser(result.user))
      .catch(() => clearAuthToken())
      .finally(() => setCheckingAuth(false));
    return () => {
      window.removeEventListener('dispatch:auth-expired', expire);
      window.removeEventListener('dispatch:password-change-required', forcePasswordChange);
    };
  }, []);

  if (checkingAuth) return null;
  if (!user) return <AuthView onAuthenticated={setUser} />;
  if (user.mustChangePassword) {
    return (
      <ForceChangePassword
        user={user}
        onChanged={setUser}
        onLogout={() => { clearAuthToken(); setUser(null); }}
      />
    );
  }

  const ModuleRoute = ({ module, element }) => (
    getPermission(user.role, module) === 'none' ? <Navigate to="/" replace /> : element
  );

  return (
    <div className={styles.app}>
      {/* Mobile top header bar */}
      <header className={styles.mobileHeader}>
        <button
          type="button"
          className={styles.hamburgerBtn}
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open menu"
        >
          <FontAwesomeIcon icon={faBars} />
        </button>
        <div className={styles.mobileBrand}>
          <img src={logo} alt="Geanto's Trucking" className={styles.mobileLogo} />
          <span>Geanto's Trucking</span>
        </div>
        <button
          type="button"
          className={styles.mobileThemeBtn}
          onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
          aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
        >
          <FontAwesomeIcon icon={theme === "light" ? faMoon : faSun} />
        </button>
      </header>

      <Sidebar
        user={user}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
        onLogout={() => { clearAuthToken(); setUser(null); }}
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />
      <main className={styles.main}>
        <Routes>
          <Route path="/" element={<DashboardView user={user} />} />
          <Route path="/dispatch" element={<ModuleRoute module="dispatch" element={<DispatchView user={user} />} />} />
          <Route path="/handoff" element={<ModuleRoute module="handoff" element={<HandoffView user={user} />} />} />
          <Route path="/calendar" element={<ModuleRoute module="calendar" element={<CalendarView user={user} />} />} />
          <Route path="/imports" element={<ModuleRoute module="shipments" element={<ImportsView user={user} />} />} />
          <Route path="/exports" element={<ModuleRoute module="shipments" element={<ExportsView user={user} />} />} />
          <Route path="/drivers" element={<ModuleRoute module="drivers_hr" element={<DriversView user={user} />} />} />
          <Route path="/equipment" element={<ModuleRoute module="equipment" element={<EquipmentView user={user} />} />} />
          <Route path="/airlines" element={<ModuleRoute module="airlines" element={<AirlinesView user={user} />} />} />
          <Route path="/warehouses" element={<ModuleRoute module="warehouses" element={<WarehousesView user={user} />} />} />
          <Route path="/analytics" element={<ModuleRoute module="analytics" element={<AnalyticsView user={user} />} />} />
          <Route path="/admin/users" element={getPermission(user.role, 'users') === 'none' ? <Navigate to="/" replace /> : <UsersView user={user} />} />
        </Routes>
      </main>
    </div>
  );
}
