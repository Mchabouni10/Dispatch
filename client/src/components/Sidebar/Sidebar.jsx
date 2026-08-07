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
} from "@fortawesome/free-solid-svg-icons";
import styles from "./Sidebar.module.css";
import logo from "../../../images/app-logo.jpeg";

const navItems = [
  { to: "/", label: "Dashboard", icon: faChartLine, exact: true },
  { to: "/dispatch", label: "Dispatch Board", icon: faBolt },
  { to: "/handoff", label: "Handoff Board", icon: faKey },
  { to: "/calendar", label: "Calendar", icon: faCalendarDays },
  { to: "/imports", label: "Imports", icon: faPlaneArrival },
  { to: "/exports", label: "Exports", icon: faPlaneDeparture },
  { to: "/drivers", label: "Drivers", icon: faIdCard },
  { to: "/equipment", label: "Equipment", icon: faCar },
  { to: "/airlines", label: "Airlines", icon: faPlane },
  { to: "/warehouses", label: "Warehouses", icon: faWarehouse },
  { to: "/analytics", label: "Analytics", icon: faChartPie },
];

export default function Sidebar({ user, theme, onToggleTheme, onLogout, isOpen = false, onClose }) {
  const handleNavClick = () => {
    if (onClose) onClose();
  };

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
          {navItems.map((item) => (
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
          className={styles.themeToggle}
          onClick={onToggleTheme}
          aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
        >
          <span className={styles.themeIcon}>
            <FontAwesomeIcon icon={theme === "light" ? faMoon : faSun} />
          </span>
          <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
        </button>

        <div className={styles.footer}>
          <div className={styles.account}>
            <div className={styles.accountName}>{user.name}</div>
            <div className={styles.accountEmail}>{user.email}</div>
            <button type="button" onClick={onLogout}>Log out</button>
          </div>
          <div className={styles.version}>v1.0.0 · Dispatch Pro</div>
        </div>
      </aside>
    </>
  );
}

