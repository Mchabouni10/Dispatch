import React, { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
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
import { clearAuthToken, getAuthToken, getCurrentUser } from "./api/api.js";
import logo from "../images/app-logo.jpeg";

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
    window.addEventListener('dispatch:auth-expired', expire);
    if (!getAuthToken()) {
      setCheckingAuth(false);
      return () => window.removeEventListener('dispatch:auth-expired', expire);
    }
    getCurrentUser()
      .then((result) => setUser(result.user))
      .catch(() => clearAuthToken())
      .finally(() => setCheckingAuth(false));
    return () => window.removeEventListener('dispatch:auth-expired', expire);
  }, []);

  if (checkingAuth) return null;
  if (!user) return <AuthView onAuthenticated={setUser} />;

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
          <Route path="/" element={<DashboardView />} />
          <Route path="/dispatch" element={<DispatchView />} />
          <Route path="/handoff" element={<HandoffView />} />
          <Route path="/calendar" element={<CalendarView />} />
          <Route path="/imports" element={<ImportsView />} />
          <Route path="/exports" element={<ExportsView />} />
          <Route path="/drivers" element={<DriversView />} />
          <Route path="/equipment" element={<EquipmentView />} />
          <Route path="/airlines" element={<AirlinesView />} />
          <Route path="/warehouses" element={<WarehousesView />} />
          <Route path="/analytics" element={<AnalyticsView />} />
        </Routes>
      </main>
    </div>
  );
}

