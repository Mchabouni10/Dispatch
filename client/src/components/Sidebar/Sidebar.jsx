import React from "react";
import { NavLink } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartLine,
  faChartPie,
  faPlaneArrival,
  faPlaneDeparture,
  faIdCard,
  faCar,
  faPlane,
  faWarehouse,
  faBolt,
  faCalendarDays,
  faKey,
  faMoon,
  faSun,
  faXmark,
  faArrowRightFromBracket,
} from "@fortawesome/free-solid-svg-icons";
import styles from "./Sidebar.module.css";
import logo from "../../../images/app-logo.jpeg";
import { getPermission } from "../../permissions.js";

const navItems = [
  { to: "/", label: "Dashboard", module: "dashboard", icon: faChartLine, exact: true },
  { to: "/dispatch", label: "Dispatch Board", module: "dispatch", icon: faBolt },
  { to: "/handoff", label: "Handoff Board", module: "handoff", icon: faKey },
  { to: "/calendar", label: "Calendar", module: "calendar", icon: faCalendarDays },
  { to: "/imports", label: "Imports", module: "shipments", icon: faPlaneArrival },
  { to: "/exports", label: "Exports", module: "shipments", icon: faPlaneDeparture },
  { to: "/drivers", label: "Drivers", module: "drivers_hr", icon: faIdCard },
  { to: "/equipment", label: "Equipment", module: "equipment", icon: faCar },
  { to: "/airlines", label: "Airlines", module: "airlines", icon: faPlane },
  { to: "/warehouses", label: "Warehouses", module: "warehouses", icon: faWarehouse },
  { to: "/analytics", label: "Analytics", module: "analytics", icon: faChartPie },
  { to: "/admin/users", label: "User Management", module: "users", icon: faIdCard },
];

// Turn "Jane Doe" into "JD", fall back gracefully for single names.
function getInitials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Sidebar({ user, theme, onToggleTheme, onLogout, isOpen = false, onClose }) {
  const handleNavClick = () => {
    if (onClose) onClose();
  };

  const isDark = theme !== "light";

  return (
    <>
      {isOpen && (
        <div
          className={styles.mobileBackdrop}
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>
            <img
              src={logo}
              alt="Geanto's Trucking"
              className={styles.brandLogo}
            />
          </div>
          <div>
            <div className={styles.brandName}>Geanto's Trucking</div>
            <div className={styles.brandSub}>International Air / Ocean</div>
          </div>
          {onClose && (
            <button
              type="button"
              className={styles.mobileCloseBtn}
              onClick={onClose}
              aria-label="Close navigation"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          )}
        </div>

        <nav className={styles.nav}>
          {navItems.filter((item) => getPermission(user?.role, item.module) !== 'none').map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              onClick={handleNavClick}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.active : ""}`
              }
            >
              <span className={styles.navIcon}>
                <FontAwesomeIcon icon={item.icon} />
              </span>
              <span className={styles.navLabel}>{item.label}</span>
              <span className={styles.activeDot} />
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          role="switch"
          aria-checked={isDark}
          className={styles.themeToggle}
          onClick={onToggleTheme}
          aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
        >
          <span className={styles.themeToggleLabel}>
            {theme === "light" ? "Light mode" : "Dark mode"}
          </span>
          <span className={`${styles.themeSwitch} ${isDark ? styles.themeSwitchDark : ""}`}>
            <FontAwesomeIcon icon={faSun} className={styles.themeSwitchIconSun} />
            <FontAwesomeIcon icon={faMoon} className={styles.themeSwitchIconMoon} />
            <span className={styles.themeSwitchThumb}>
              <FontAwesomeIcon icon={isDark ? faMoon : faSun} />
            </span>
          </span>
        </button>

        <div className={styles.footer}>
          <div className={styles.account}>
            <div className={styles.accountAvatar} aria-hidden="true">
              {getInitials(user?.name)}
            </div>
            <div className={styles.accountInfo}>
              <div className={styles.accountName}>{user?.name}</div>
              <div className={styles.accountEmail}>{user?.email}</div>
              <div className={styles.accountEmail}>{user?.role?.replaceAll('_', ' ')}</div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className={styles.logoutBtn}
              aria-label="Log out"
              title="Log out"
            >
              <FontAwesomeIcon icon={faArrowRightFromBracket} />
            </button>
          </div>
          <div className={styles.version}>
            <span className={styles.versionDot} />
            Dispatch Pro <span className={styles.versionNumber}>v1.0.0</span>
          </div>
        </div>
      </aside>
    </>
  );
}
