//src/pages/Handoff/Notcheckedincolumn.jsx
import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faKey,
  faHouse,
  faTriangleExclamation,
  faIdCard,
  faBell,
  faCalendarDay,
  faClock,
  faHourglassHalf,
  faMagnifyingGlass,
  faXmark,
  faArrowDownWideShort,
  faBiohazard,
  faCertificate,
} from "@fortawesome/free-solid-svg-icons";
import {
  isScheduledToday,
  minutesPastExpectedStart,
  shiftStartToday,
  formatHour12,
  formatDuration,
  initials,
} from "./handoffHelpers.js";
import DriverAvatar from "./DriverAvatar.jsx";
import styles from "./HandoffView.module.css";
import localStyles from "./NotCheckedInColumn.module.css";

/**
 * Splits A-Z into `groupCount` roughly-even letter ranges, e.g. for 6:
 * ["A–D", "E–H", "I–L", "M–P", "Q–T", "U–Z"]
 * Bump groupCount to 8 (or any number) for narrower buckets — everything
 * else adapts automatically.
 */
function buildAlphabetGroups(groupCount = 6) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const perGroup = Math.ceil(letters.length / groupCount);
  const groups = [];
  for (let i = 0; i < letters.length; i += perGroup) {
    const chunk = letters.slice(i, i + perGroup);
    if (chunk.length === 0) continue;
    groups.push({
      label:
        chunk.length > 1
          ? `${chunk[0]}–${chunk[chunk.length - 1]}`
          : chunk[0],
      start: chunk[0],
      end: chunk[chunk.length - 1],
    });
  }
  return groups;
}

const ALPHABET_GROUPS = buildAlphabetGroups(6);

// A handful of possible "driver id" field names — different backends call
// this different things. Add/remove keys here if your API uses another
// field name and the search box will pick it up automatically.
const ID_FIELD_CANDIDATES = [
  "id",
  "driverId",
  "employeeId",
  "badgeNumber",
  "licenseNumber",
];

const SORT_OPTIONS = [
  { value: "urgency", label: "Most urgent first" },
  { value: "name", label: "Name (A–Z)" },
  { value: "shiftStart", label: "Shift start time" },
];

/** Wraps the part of `name` matching `query` in a <mark> for search feedback. */
function highlightMatch(name, query) {
  if (!query) return name;
  const idx = name.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return name;
  return (
    <>
      {name.slice(0, idx)}
      <mark className={localStyles.matchHighlight}>
        {name.slice(idx, idx + query.length)}
      </mark>
      {name.slice(idx + query.length)}
    </>
  );
}

export default function NotCheckedInColumn({
  drivers,
  staleHoldCount,
  busyId,
  onCheckIn,
  onReleaseEquipment,
  truckFor,
  trailerFor,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [quickFilter, setQuickFilter] = useState("all"); // all | late | soon | stale
  const [sortBy, setSortBy] = useState("urgency");

  // Compute each driver's status (late / arriving soon / stale hold / etc)
  // exactly once, up front — both the filter chips and the card list read
  // from this instead of recalculating the same thing twice.
  const enriched = useMemo(() => {
    return drivers.map((driver) => {
      const scheduled = isScheduledToday(driver);
      const pastStart = minutesPastExpectedStart(driver);
      const late = scheduled && pastStart != null;
      const expected = shiftStartToday(driver);
      const minsToStart = expected
        ? Math.round((expected.getTime() - Date.now()) / 60000)
        : null;
      const arrivingSoon =
        scheduled && minsToStart != null && minsToStart > 0 && minsToStart <= 60;
      const staleTruck = truckFor(driver.id);
      const staleTrailer = trailerFor(driver.id);
      const hasStaleHold = !!staleTruck || !!staleTrailer;
      const urgency = late ? "late" : arrivingSoon ? "soon" : hasStaleHold ? "stale" : "idle";

      return {
        driver,
        scheduled,
        pastStart,
        late,
        minsToStart,
        arrivingSoon,
        staleTruck,
        staleTrailer,
        hasStaleHold,
        urgency,
      };
    });
  }, [drivers, truckFor, trailerFor]);

  const chipCounts = useMemo(
    () => ({
      all: enriched.length,
      late: enriched.filter((x) => x.late).length,
      soon: enriched.filter((x) => x.arrivingSoon && !x.late).length,
      stale: enriched.filter((x) => x.hasStaleHold).length,
    }),
    [enriched],
  );

  const filtersActive =
    Boolean(searchTerm) || selectedGroup !== "all" || quickFilter !== "all";

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedGroup("all");
    setQuickFilter("all");
  };

  const filteredDrivers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    let result = enriched.filter((item) => {
      const { driver, late, arrivingSoon, hasStaleHold } = item;

      if (selectedGroup !== "all") {
        const group = ALPHABET_GROUPS.find((g) => g.label === selectedGroup);
        const firstLetter = (driver.name || "").trim().charAt(0).toUpperCase();
        if (!group || firstLetter < group.start || firstLetter > group.end) {
          return false;
        }
      }

      if (quickFilter === "late" && !late) return false;
      if (quickFilter === "soon" && !(arrivingSoon && !late)) return false;
      if (quickFilter === "stale" && !hasStaleHold) return false;

      if (query) {
        const nameMatch = (driver.name || "").toLowerCase().includes(query);
        const idMatch = ID_FIELD_CANDIDATES.some((field) => {
          const value = driver[field];
          return value != null && String(value).toLowerCase().includes(query);
        });
        if (!nameMatch && !idMatch) return false;
      }

      return true;
    });

    result = [...result].sort((a, b) => {
      if (sortBy === "name") {
        return (a.driver.name || "").localeCompare(b.driver.name || "");
      }
      if (sortBy === "shiftStart") {
        if (!a.driver.shiftStart) return 1;
        if (!b.driver.shiftStart) return -1;
        return a.driver.shiftStart.localeCompare(b.driver.shiftStart);
      }
      // "urgency": late (most overdue first) > arriving soon (soonest first)
      // > stale hold > everyone else, alphabetically within each group.
      const rank = { late: 0, soon: 1, stale: 2, idle: 3 };
      const rankDiff = rank[a.urgency] - rank[b.urgency];
      if (rankDiff !== 0) return rankDiff;
      if (a.urgency === "late") return (b.pastStart ?? 0) - (a.pastStart ?? 0);
      if (a.urgency === "soon")
        return (a.minsToStart ?? 0) - (b.minsToStart ?? 0);
      return (a.driver.name || "").localeCompare(b.driver.name || "");
    });

    return result;
  }, [enriched, searchTerm, selectedGroup, quickFilter, sortBy]);

  return (
    <section className={styles.column}>
      <div className={styles.columnHeader}>
        <span>Not Checked In</span>
        <span className={styles.columnCount}>
          {filtersActive
            ? `${filteredDrivers.length} / ${drivers.length}`
            : drivers.length}
        </span>
        {staleHoldCount > 0 && (
          <span className={styles.staleHoldBadge}>
            <FontAwesomeIcon icon={faTriangleExclamation} />
            {staleHoldCount} holding equipment
          </span>
        )}
      </div>

      <div className={localStyles.filterBar}>
        <div className={localStyles.filterRow}>
          <div className={localStyles.searchBox}>
            <FontAwesomeIcon icon={faMagnifyingGlass} className={localStyles.searchIcon} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name or driver ID…"
              className={localStyles.searchInput}
              aria-label="Search drivers by name or ID"
            />
            {searchTerm && (
              <button
                type="button"
                className={localStyles.clearSearchBtn}
                onClick={() => setSearchTerm("")}
                aria-label="Clear search"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            )}
          </div>

          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className={localStyles.groupSelect}
            aria-label="Filter by name"
          >
            <option value="all">All names</option>
            {ALPHABET_GROUPS.map((g) => (
              <option key={g.label} value={g.label}>
                {g.label}
              </option>
            ))}
          </select>

          <div className={localStyles.sortBox}>
            <FontAwesomeIcon icon={faArrowDownWideShort} className={localStyles.sortIcon} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className={localStyles.sortSelect}
              aria-label="Sort drivers"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={localStyles.chipRow}>
          <button
            type="button"
            className={`${localStyles.chip} ${
              quickFilter === "all" ? localStyles.chipActiveAll : ""
            }`}
            onClick={() => setQuickFilter("all")}
          >
            All <span className={localStyles.chipCount}>{chipCounts.all}</span>
          </button>
          <button
            type="button"
            className={`${localStyles.chip} ${localStyles.chipLate} ${
              quickFilter === "late" ? localStyles.chipActiveLate : ""
            }`}
            onClick={() => setQuickFilter(quickFilter === "late" ? "all" : "late")}
            disabled={chipCounts.late === 0}
          >
            Late <span className={localStyles.chipCount}>{chipCounts.late}</span>
          </button>
          <button
            type="button"
            className={`${localStyles.chip} ${localStyles.chipSoon} ${
              quickFilter === "soon" ? localStyles.chipActiveSoon : ""
            }`}
            onClick={() => setQuickFilter(quickFilter === "soon" ? "all" : "soon")}
            disabled={chipCounts.soon === 0}
          >
            Arriving soon <span className={localStyles.chipCount}>{chipCounts.soon}</span>
          </button>
          <button
            type="button"
            className={`${localStyles.chip} ${localStyles.chipStale} ${
              quickFilter === "stale" ? localStyles.chipActiveStale : ""
            }`}
            onClick={() => setQuickFilter(quickFilter === "stale" ? "all" : "stale")}
            disabled={chipCounts.stale === 0}
          >
            Holding equipment <span className={localStyles.chipCount}>{chipCounts.stale}</span>
          </button>

          {filtersActive && (
            <button type="button" className={localStyles.clearFiltersBtn} onClick={clearFilters}>
              Clear
            </button>
          )}
        </div>
      </div>

      <div className={styles.cardList}>
        {drivers.length === 0 && (
          <div className={styles.emptyState}>Everyone eligible is on shift.</div>
        )}
        {drivers.length > 0 && filteredDrivers.length === 0 && (
          <div className={styles.emptyState}>No drivers match your search/filters.</div>
        )}
        {filteredDrivers.map(
          ({ driver, late, pastStart, arrivingSoon, minsToStart, staleTruck, staleTrailer, hasStaleHold, urgency }) => (
            <div
              key={driver.id}
              className={`${styles.card} ${styles.cardIdle} ${late ? styles.cardLate : ""} ${
                arrivingSoon ? styles.cardArriving : ""
              } ${hasStaleHold ? styles.cardStaleHold : ""}`}
            >
              <div className={styles.cardTop}>
                <DriverAvatar driver={driver} urgency={urgency} />
                <div className={styles.driverInfo}>
                  <div className={styles.driverName}>
                    {highlightMatch(driver.name || "", searchTerm)}
                  </div>
                  <div className={styles.driverSubline}>
                    <FontAwesomeIcon icon={faIdCard} className={styles.iconSmall} />
                    Class {driver.licenseClass}
                    {driver.vehicleTypes?.length > 0 && (
                      <>
                        <span className={styles.dot}>·</span>
                        {driver.vehicleTypes.join(", ")}
                      </>
                    )}
                    {driver.status === "On Call" && (
                      <span className={styles.onCallBadge}>
                        <FontAwesomeIcon icon={faBell} /> On Call
                      </span>
                    )}
                    {driver.hazmatCertified && (
                      <span className={localStyles.hazmatBadge}>
                        <FontAwesomeIcon icon={faBiohazard} /> Hazmat
                      </span>
                    )}
                    {driver.dotTrained && (
                      <span className={localStyles.dotBadge}>
                        <FontAwesomeIcon icon={faCertificate} /> DOT trained
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.scheduleRow}>
                  <FontAwesomeIcon icon={faCalendarDay} className={styles.iconSmall} />
                  {driver.shiftStart && driver.shiftEnd ? (
                    <span>
                      Shift {formatHour12(driver.shiftStart)} – {formatHour12(driver.shiftEnd)}
                    </span>
                  ) : (
                    <span className={styles.textMuted}>No shift times on file</span>
                  )}
                </div>
                {!isScheduledToday(driver) && (
                  <div className={styles.notScheduledTag}>
                    Not scheduled today
                    {driver.availableOnDaysOff ? " (willing on day off)" : ""}
                  </div>
                )}
                {late && (
                  <div className={styles.lateTag}>
                    <FontAwesomeIcon icon={faTriangleExclamation} />
                    Late by {formatDuration(pastStart)}
                  </div>
                )}
                {arrivingSoon && !late && (
                  <div className={styles.arrivingTag}>
                    <FontAwesomeIcon icon={faHourglassHalf} />
                    Starts in {formatDuration(minsToStart)}
                  </div>
                )}
                {isScheduledToday(driver) && !late && !arrivingSoon && driver.shiftStart && (
                  <div className={styles.onTimeHint}>
                    <FontAwesomeIcon icon={faClock} />
                    Expected by {formatHour12(driver.shiftStart)}
                  </div>
                )}
                {hasStaleHold && (
                  <div className={styles.staleHoldTag}>
                    <FontAwesomeIcon icon={faTriangleExclamation} />
                    Still holds{" "}
                    {[staleTruck?.unitNumber, staleTrailer?.unitNumber].filter(Boolean).join(" + ")}{" "}
                    from a prior shift — never released
                  </div>
                )}

                <button
                  className={styles.checkInBtn}
                  onClick={() => onCheckIn(driver)}
                  disabled={busyId === driver.id}
                >
                  <FontAwesomeIcon icon={faKey} />
                  Check In
                </button>

                {hasStaleHold && (
                  <button
                    className={styles.releaseStaleBtn}
                    onClick={() => onReleaseEquipment(driver)}
                    disabled={busyId === driver.id}
                  >
                    <FontAwesomeIcon icon={faHouse} />
                    Release equipment
                  </button>
                )}
              </div>
            </div>
          ),
        )}
      </div>
    </section>
  );
}