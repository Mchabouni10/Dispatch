// src/pages/Drivers/DriversView.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faPencil,
  faTrash,
  faMagnifyingGlass,
  faIdCard,
  faPhone,
  faCalendar,
  faCircleUser,
  faCamera,
  faTriangleExclamation,
  faTruck,
  faClock,
  faStar,
  faMapPin,
  faTimes,
  faCheckCircle,
  faBan,
  faPlane,
  faRoad,
  faBell,
  faUserClock,
  faUserCheck,
  faUserSlash,
  faEnvelope,
  faAward,
  faShieldHalved,
  faFlag,
  faDollarSign,
  faHeart,
  faGraduationCap,
  faFileImage,
} from "@fortawesome/free-solid-svg-icons";
import {
  getDrivers,
  createDriver,
  updateDriver,
  deleteDriver,
  updateDriverStatus,
  uploadDriverPhoto,
  uploadDriverLicensePhoto,
  resolveUploadUrl,
} from "../../api/api.js";
import Modal from "../../components/Modal/Modal.jsx";
import styles from "./DriversView.module.css";

const INITIAL_FORM = {
  name: "",
  employeeId: "",
  phone: "",
  email: "",
  address: "",
  dateOfBirth: "",
  gender: "",
  status: "Available",
  statusReason: "",
  leaveStart: "",
  leaveEnd: "",
  workDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  shiftStart: "08:00",
  shiftEnd: "17:00",
  availableOnDaysOff: false,
  overtimePreference: false,
  maxWeeklyHours: 60,
  licenseNumber: "",
  licenseClass: "A",
  licenseExpiration: "",
  medicalCertExpiration: "",
  endorsements: "",
  vehicleTypes: [],
  trailerEligible: true,
  hazmatCertified: false,
  gdpTrained: false,
  currentLocation: "",
  hoursDrivenToday: 0,
  onDutyHours: 0,
  preferredRunTypes: [],
  homeBase: "",
  maxRadius: "",
  overnightAllowed: true,
  crossBorder: false,
  performanceRating: 3.0,
  totalTripsCompleted: 0,
  onTimeDeliveryRate: 100.0,
  safetyScore: 100.0,
  incidents: 0,
  hireDate: "",
  employmentStatus: "Active",
  payType: "Hourly",
  payRate: "",
  overtimeRate: "",
  bonusEligible: false,
  lastPayRaise: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyContactRelation: "",
  notes: "",
  specialSkills: "",
  medicalConditions: "",
};

const STATUS_OPTIONS = [
  "Available",
  "On Trip",
  "Break",
  "Absent",
  "Vacation",
  "Sick Leave",
  "Training",
  "On Call",
  "Off Duty",
  "Terminated",
];

// Statuses that require a leave date range
const LEAVE_STATUSES = ["Vacation", "Sick Leave", "Absent", "Training"];

const VEHICLE_TYPES = ["Tractor", "Straight Truck", "Cube Truck", "Any"];
const RUN_TYPES = ["Import", "Export", "Local", "Long Haul"];
const LICENSE_CLASSES = ["A", "B", "C"];
const PAY_TYPES = ["Hourly", "Salary", "Per Mile"];
const GENDER_OPTIONS = ["Male", "Female", "Non-Binary", "Prefer not to say"];

// Ordered Mon->Sun so presets and the complement (days off) are easy to compute.
const WORK_DAYS = [
  { key: "Mon", label: "M", full: "Monday" },
  { key: "Tue", label: "T", full: "Tuesday" },
  { key: "Wed", label: "W", full: "Wednesday" },
  { key: "Thu", label: "T", full: "Thursday" },
  { key: "Fri", label: "F", full: "Friday" },
  { key: "Sat", label: "S", full: "Saturday" },
  { key: "Sun", label: "S", full: "Sunday" },
];
const WORK_DAY_KEYS = WORK_DAYS.map((d) => d.key);

const DAY_PRESETS = [
  { label: "Every day", days: [...WORK_DAY_KEYS] },
  { label: "Weekdays", days: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
  { label: "Weekdays + Sat", days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] },
];

// Drivers clock in/out on the hour, never on the quarter or half hour.
const HOUR_OPTIONS = Array.from(
  { length: 24 },
  (_, h) => `${String(h).padStart(2, "0")}:00`,
);

function formatHour12(hhmm) {
  if (!hhmm) return "";
  const h = Number(hhmm.split(":")[0]);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:00 ${period}`;
}

function daysOffFromWorkDays(workDays) {
  return WORK_DAY_KEYS.filter((d) => !workDays.includes(d));
}

function workDaysFromDaysOff(daysOff) {
  const off = new Set(daysOff || []);
  return WORK_DAY_KEYS.filter((d) => !off.has(d));
}

// Best-effort parse of shiftStart/shiftEnd back out of a legacy free-text
// schedule string like "Mon-Fri (08:00-17:00)" for records saved before
// shiftStart/shiftEnd existed as their own fields.
function parseShiftFromSchedule(scheduleStr) {
  if (!scheduleStr) return { shiftStart: "", shiftEnd: "" };
  const match = /(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/.exec(scheduleStr);
  if (!match) return { shiftStart: "", shiftEnd: "" };
  return { shiftStart: match[1], shiftEnd: match[2] };
}

function buildScheduleSummary(workDays, shiftStart, shiftEnd) {
  const daysLabel =
    workDays.length === 7
      ? "Every day"
      : workDays.length === 0
        ? "No work days"
        : workDays.join(", ");
  const timeLabel =
    shiftStart && shiftEnd ? ` (${shiftStart}-${shiftEnd})` : "";
  return `${daysLabel}${timeLabel}`;
}

const STATUS_ICONS = {
  Available: faUserCheck,
  "On Trip": faTruck,
  Break: faClock,
  Absent: faUserSlash,
  Vacation: faPlane,
  "Sick Leave": faBan,
  Training: faGraduationCap,
  "On Call": faBell,
  "Off Duty": faTimes,
  Terminated: faTimes,
};

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}

function expiryClass(dateStr) {
  const days = daysUntil(dateStr);
  if (days === null) return "";
  if (days < 0) return styles.expired;
  if (days <= 30) return styles.expiringSoon;
  return "";
}

function expiryLabel(dateStr) {
  const days = daysUntil(dateStr);
  if (days === null) return null;
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today";
  return `Expires in ${days}d`;
}

function toDateInput(value) {
  return value ? String(value).slice(0, 10) : "";
}

function formatLeaveRange(start, end) {
  if (!start && !end) return null;
  const opts = { month: "short", day: "numeric" };
  const s = start ? new Date(start).toLocaleDateString(undefined, opts) : "?";
  const e = end ? new Date(end).toLocaleDateString(undefined, opts) : "?";
  return `${s} – ${e}`;
}

function getInitials(name) {
  if (!name) return "??";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function DriversView() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterVehicle, setFilterVehicle] = useState("all");
  const [filterAvailability, setFilterAvailability] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [licensePhotoFile, setLicensePhotoFile] = useState(null);
  const [licensePhotoPreview, setLicensePhotoPreview] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await getDrivers();
      setDrivers(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm(INITIAL_FORM);
    setPhotoFile(null);
    setPhotoPreview("");
    setLicensePhotoFile(null);
    setLicensePhotoPreview("");
    setError("");
    setModalOpen(true);
  };

  const openEdit = (d) => {
    setEditing(d);
    const fallbackShift = parseShiftFromSchedule(d.schedule);
    setForm({
      ...INITIAL_FORM,
      ...d,
      workDays: workDaysFromDaysOff(d.daysOff),
      shiftStart:
        d.shiftStart || fallbackShift.shiftStart || INITIAL_FORM.shiftStart,
      shiftEnd: d.shiftEnd || fallbackShift.shiftEnd || INITIAL_FORM.shiftEnd,
      gdpTrained: !!d.gdpTrained,
      endorsements: (d.endorsements || []).join(", "),
      vehicleTypes: d.vehicleTypes || [],
      preferredRunTypes: d.preferredRunTypes || [],
      licenseExpiration: toDateInput(d.licenseExpiration),
      medicalCertExpiration: toDateInput(d.medicalCertExpiration),
      hireDate: toDateInput(d.hireDate),
      dateOfBirth: toDateInput(d.dateOfBirth),
      leaveStart: toDateInput(d.leaveStart),
      leaveEnd: toDateInput(d.leaveEnd),
      payRate: d.payRate ?? "",
      overtimeRate: d.overtimeRate ?? "",
      maxRadius: d.maxRadius ?? "",
      performanceRating: d.performanceRating ?? 3.0,
      totalTripsCompleted: d.totalTripsCompleted ?? 0,
      onTimeDeliveryRate: d.onTimeDeliveryRate ?? 100.0,
      safetyScore: d.safetyScore ?? 100.0,
      incidents: d.incidents ?? 0,
    });
    setPhotoFile(null);
    setPhotoPreview(d.photo ? resolveUploadUrl(d.photo) : "");
    setLicensePhotoFile(null);
    setLicensePhotoPreview(
      d.licensePhoto ? resolveUploadUrl(d.licensePhoto) : "",
    );
    setError("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setError("");
    setPhotoFile(null);
    setPhotoPreview("");
    setLicensePhotoFile(null);
    setLicensePhotoPreview("");
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleLicensePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLicensePhotoFile(file);
    setLicensePhotoPreview(URL.createObjectURL(file));
  };

  const isLeaveStatus = LEAVE_STATUSES.includes(form.status);

  const validateForm = () => {
    if (!form.name.trim()) return "Full name is required";
    if (!form.phone.trim()) return "Phone number is required";
    if (!form.email.trim()) return "Email is required";
    if (!form.workDays || form.workDays.length === 0)
      return "Select at least one working day";
    if (form.workDays.length === 7) return "At least one day off is required";
    if (!form.shiftStart) return "Shift start time is required";
    if (!form.shiftEnd) return "Shift end time is required";
    if (!form.licenseNumber.trim()) return "Driver license number is required";
    if (!form.licenseExpiration)
      return "Driver license expiration date is required";

    const requiresMedical =
      ["A", "B"].includes(form.licenseClass) ||
      (form.vehicleTypes || []).includes("Tractor");
    if (requiresMedical && !String(form.medicalCertExpiration || "").trim()) {
      return "DOT medical card expiration is required for CDL (Class A/B) or tractor drivers";
    }

    // Leave date range required for leave-related statuses
    if (isLeaveStatus) {
      if (!form.leaveStart)
        return "Leave start date is required for this status";
      if (!form.leaveEnd) return "Leave end date is required for this status";
      if (new Date(form.leaveEnd) < new Date(form.leaveStart)) {
        return "Leave end date must be on or after the start date";
      }
    }

    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      const daysOffArr = daysOffFromWorkDays(form.workDays);
      const { workDays: _workDays, id: _id, ...formForApi } = form;
      const payload = {
        ...formForApi,
        daysOff: daysOffArr,
        schedule: buildScheduleSummary(
          form.workDays,
          form.shiftStart,
          form.shiftEnd,
        ),
        endorsements: form.endorsements
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        vehicleTypes: form.vehicleTypes || [],
        preferredRunTypes: form.preferredRunTypes || [],
        maxRadius: form.maxRadius ? Number(form.maxRadius) : null,
        payRate: form.payRate ? Number(form.payRate) : 0,
        overtimeRate: form.overtimeRate ? Number(form.overtimeRate) : null,
        performanceRating: form.performanceRating
          ? Number(form.performanceRating)
          : 3.0,
        totalTripsCompleted: form.totalTripsCompleted
          ? Number(form.totalTripsCompleted)
          : 0,
        onTimeDeliveryRate: form.onTimeDeliveryRate
          ? Number(form.onTimeDeliveryRate)
          : 100.0,
        safetyScore: form.safetyScore ? Number(form.safetyScore) : 100.0,
        incidents: form.incidents ? Number(form.incidents) : 0,
        maxWeeklyHours: Number(form.maxWeeklyHours) || 60,
        hoursDrivenToday: Number(form.hoursDrivenToday) || 0,
        onDutyHours: Number(form.onDutyHours) || 0,
        licenseExpiration: form.licenseExpiration || undefined,
        medicalCertExpiration: form.medicalCertExpiration || undefined,
        hireDate: form.hireDate || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        // Only send leave dates when status needs them; otherwise clear
        leaveStart: isLeaveStatus ? form.leaveStart || undefined : null,
        leaveEnd: isLeaveStatus ? form.leaveEnd || undefined : null,
      };

      let saved;
      if (editing) {
        saved = await updateDriver(editing.id, payload);
      } else {
        saved = await createDriver(payload);
      }
      if (photoFile && saved?.id) {
        await uploadDriverPhoto(saved.id, photoFile);
      }
      if (licensePhotoFile && saved?.id) {
        await uploadDriverLicensePhoto(saved.id, licensePhotoFile);
      }
      await load();
      closeModal();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteDriver(deleteId);
      setDeleteId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleStatusChange = async (id, status, statusReason = "") => {
    try {
      await updateDriverStatus(id, { status, statusReason });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const filteredDrivers = useMemo(() => {
    let result = [...drivers];

    if (search) {
      const term = search.toLowerCase();
      result = result.filter(
        (d) =>
          d.name?.toLowerCase().includes(term) ||
          d.employeeId?.toLowerCase().includes(term) ||
          d.phone?.includes(term) ||
          d.licenseNumber?.toLowerCase().includes(term) ||
          d.email?.toLowerCase().includes(term),
      );
    }

    if (filterStatus !== "all") {
      result = result.filter((d) => d.status === filterStatus);
    }

    if (filterVehicle !== "all") {
      if (filterVehicle === "Trailer Eligible") {
        result = result.filter((d) => d.trailerEligible);
      } else if (filterVehicle === "Hazmat Certified") {
        result = result.filter((d) => d.hazmatCertified);
      } else if (filterVehicle === "GDP Trained") {
        result = result.filter((d) => d.gdpTrained);
      } else {
        result = result.filter(
          (d) =>
            d.vehicleTypes?.includes(filterVehicle) ||
            d.vehicleTypes?.includes("Any"),
        );
      }
    }

    if (filterAvailability === "available") {
      result = result.filter(
        (d) => d.status === "Available" || d.status === "On Call",
      );
    } else if (filterAvailability === "unavailable") {
      result = result.filter((d) =>
        ["Absent", "Vacation", "Sick Leave", "Off Duty", "Terminated"].includes(
          d.status,
        ),
      );
    } else if (filterAvailability === "on-trip") {
      result = result.filter((d) => d.status === "On Trip");
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return (a.name || "").localeCompare(b.name || "");
        case "status":
          return (a.status || "").localeCompare(b.status || "");
        case "rating":
          return (b.performanceRating || 0) - (a.performanceRating || 0);
        case "trips":
          return (b.totalTripsCompleted || 0) - (a.totalTripsCompleted || 0);
        case "seniority":
          return new Date(a.hireDate) - new Date(b.hireDate);
        default:
          return 0;
      }
    });

    return result;
  }, [
    drivers,
    search,
    filterStatus,
    filterVehicle,
    filterAvailability,
    sortBy,
  ]);

  const stats = useMemo(() => {
    const total = drivers.length;
    const available = drivers.filter((d) => d.status === "Available").length;
    const onTrip = drivers.filter((d) => d.status === "On Trip").length;
    const onBreak = drivers.filter((d) => d.status === "Break").length;
    const unavailable = drivers.filter((d) =>
      ["Absent", "Vacation", "Sick Leave", "Off Duty"].includes(d.status),
    ).length;
    const certified = drivers.filter((d) => d.hazmatCertified).length;
    const trailerEligible = drivers.filter((d) => d.trailerEligible).length;
    const active = drivers.filter(
      (d) => d.employmentStatus === "Active",
    ).length;
    return {
      total,
      available,
      onTrip,
      onBreak,
      unavailable,
      certified,
      trailerEligible,
      active,
    };
  }, [drivers]);

  const StatusBadgeWithIcon = ({ status }) => {
    const icon = STATUS_ICONS[status] || faCircleUser;
    const statusClass = status?.replace(" ", "_") || "Unknown";
    return (
      <span
        className={`${styles.statusBadge} ${styles[`status_${statusClass}`]}`}
      >
        <FontAwesomeIcon icon={icon} />
        {status}
      </span>
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>Drivers</h1>
          <p className={styles.pageSub}>
            {drivers.length} driver{drivers.length !== 1 ? "s" : ""} registered
          </p>
        </div>
        <button className={styles.addBtn} onClick={openAdd} id="add-driver-btn">
          <FontAwesomeIcon icon={faPlus} />
          Add Driver
        </button>
      </div>

      <div className={styles.statsBar}>
        <div className={`${styles.statCard} ${styles.statTotal}`}>
          <span className={styles.statValue}>{stats.total}</span>
          <span className={styles.statLabel}>Total</span>
        </div>
        <div className={`${styles.statCard} ${styles.statAvailable}`}>
          <span className={styles.statValue}>{stats.available}</span>
          <span className={styles.statLabel}>Available</span>
        </div>
        <div className={`${styles.statCard} ${styles.statOnTrip}`}>
          <span className={styles.statValue}>{stats.onTrip}</span>
          <span className={styles.statLabel}>On Trip</span>
        </div>
        <div className={`${styles.statCard} ${styles.statUnavailable}`}>
          <span className={styles.statValue}>{stats.unavailable}</span>
          <span className={styles.statLabel}>Unavailable</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCertified}`}>
          <span className={styles.statValue}>{stats.certified}</span>
          <span className={styles.statLabel}>Hazmat</span>
        </div>
        <div className={`${styles.statCard} ${styles.statActive}`}>
          <span className={styles.statValue}>{stats.active}</span>
          <span className={styles.statLabel}>Active</span>
        </div>
      </div>

      <div className={styles.filtersBar}>
        <div className={styles.searchWrap}>
          <FontAwesomeIcon
            icon={faMagnifyingGlass}
            className={styles.searchIcon}
          />
          <input
            id="driver-search"
            className={styles.searchInput}
            placeholder="Search by name, ID, phone, license..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className={styles.filterSelect}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          id="filter-status"
        >
          <option value="all">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          className={styles.filterSelect}
          value={filterVehicle}
          onChange={(e) => setFilterVehicle(e.target.value)}
          id="filter-vehicle"
        >
          <option value="all">All Vehicles</option>
          {VEHICLE_TYPES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
          <option value="Trailer Eligible">Trailer Eligible</option>
          <option value="Hazmat Certified">Hazmat Certified</option>
          <option value="GDP Trained">GDP Trained</option>
        </select>

        <select
          className={styles.filterSelect}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          id="sort-by"
        >
          <option value="name">Sort: Name</option>
          <option value="status">Sort: Status</option>
          <option value="rating">Sort: Rating</option>
          <option value="trips">Sort: Trips</option>
          <option value="seniority">Sort: Seniority</option>
        </select>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading ? (
        <div className={styles.loading}>Loading drivers...</div>
      ) : (
        <div className={styles.grid}>
          {filteredDrivers.length === 0 ? (
            <div className={styles.empty}>
              No drivers found matching your criteria.
            </div>
          ) : (
            filteredDrivers.map((driver) => {
              const licenseWarn = expiryClass(driver.licenseExpiration);
              const medWarn = expiryClass(driver.medicalCertExpiration);
              const statusClass = driver.status?.replace(" ", "_") || "Unknown";
              const leaveRange = formatLeaveRange(
                driver.leaveStart,
                driver.leaveEnd,
              );
              const showLeave =
                LEAVE_STATUSES.includes(driver.status) && leaveRange;

              return (
                <div
                  key={driver.id}
                  className={`${styles.card} ${styles[`status_${statusClass}`]}`}
                >
                  <div className={styles.cardTop}>
                    {driver.photo ? (
                      <img
                        className={styles.avatarImg}
                        src={resolveUploadUrl(driver.photo)}
                        alt={driver.name}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className={styles.avatar}>
                        {getInitials(driver.name)}
                      </div>
                    )}
                    <div className={styles.driverInfo}>
                      <div className={styles.driverName}>
                        {driver.name}
                        {driver.performanceRating >= 4 && (
                          <FontAwesomeIcon
                            icon={faStar}
                            className={styles.starIcon}
                          />
                        )}
                      </div>
                      <div className={styles.driverSubline}>
                        <StatusBadgeWithIcon status={driver.status} />
                        <span className={styles.driverNumber}>
                          #{driver.employeeId}
                        </span>
                      </div>
                    </div>
                    <div className={styles.cardActions}>
                      <button
                        className={styles.editBtn}
                        onClick={() => openEdit(driver)}
                        title="Edit"
                      >
                        <FontAwesomeIcon icon={faPencil} />
                      </button>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => setDeleteId(driver.id)}
                        title="Delete"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                  </div>

                  <div className={styles.cardBody}>
                    <div className={styles.infoRow}>
                      <FontAwesomeIcon icon={faIdCard} />
                      <span>
                        Class {driver.licenseClass} ·{" "}
                        {driver.licenseNumber || "No license"}
                      </span>
                      {driver.licensePhoto && (
                        <a
                          href={resolveUploadUrl(driver.licensePhoto)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.licenseScanLink}
                          title="View scanned license"
                        >
                          <FontAwesomeIcon icon={faFileImage} /> Scan
                        </a>
                      )}
                      {driver.hazmatCertified && (
                        <span className={styles.hazmatBadge}>Hazmat</span>
                      )}
                      {driver.trailerEligible && (
                        <span className={styles.trailerBadge}>Trailer</span>
                      )}
                      {driver.gdpTrained && (
                        <span
                          className={styles.gdpBadge}
                          title="GDP Trained: reefer handling, pickups & checklist"
                        >
                          GDP
                        </span>
                      )}
                    </div>

                    <div className={styles.infoRow}>
                      <FontAwesomeIcon icon={faPhone} />
                      <span>{driver.phone}</span>
                      {driver.email && (
                        <>
                          <span className={styles.dot}>·</span>
                          <FontAwesomeIcon
                            icon={faEnvelope}
                            className={styles.iconSmall}
                          />
                          <span>{driver.email}</span>
                        </>
                      )}
                    </div>

                    {driver.currentLocation && (
                      <div className={styles.infoRow}>
                        <FontAwesomeIcon icon={faMapPin} />
                        <span>📍 {driver.currentLocation}</span>
                      </div>
                    )}

                    {driver.vehicleTypes?.length > 0 && (
                      <div className={styles.infoRow}>
                        <FontAwesomeIcon icon={faTruck} />
                        <span>Vehicles: {driver.vehicleTypes.join(", ")}</span>
                      </div>
                    )}

                    {(driver.shiftStart || driver.shiftEnd) && (
                      <div className={styles.infoRow}>
                        <FontAwesomeIcon icon={faClock} />
                        <span>
                          {formatHour12(driver.shiftStart)} –{" "}
                          {formatHour12(driver.shiftEnd)}
                        </span>
                        {driver.daysOff?.length > 0 && (
                          <>
                            <span className={styles.dot}>·</span>
                            <span>
                              Off {driver.daysOff.join(", ")}
                              {driver.availableOnDaysOff ? " (flexible)" : ""}
                            </span>
                          </>
                        )}
                      </div>
                    )}

                    {showLeave && (
                      <div className={styles.infoRow}>
                        <FontAwesomeIcon icon={faCalendar} />
                        <span className={styles.leaveRange}>
                          Leave: {leaveRange}
                        </span>
                      </div>
                    )}

                    {driver.hoursDrivenToday > 0 && (
                      <div className={styles.hosBar}>
                        <div className={styles.hosLabel}>
                          <span>Hours of Service</span>
                          <span className={styles.hosText}>
                            {driver.hoursDrivenToday.toFixed(1)}h /{" "}
                            {driver.maxWeeklyHours || 60}h
                          </span>
                        </div>
                        <div className={styles.hosTrack}>
                          <div
                            className={`${styles.hosFill} ${driver.hoursDrivenToday > 8 ? styles.hosWarning : ""}`}
                            style={{
                              width: `${Math.min((driver.hoursDrivenToday / 11) * 100, 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {(driver.licenseExpiration ||
                      driver.medicalCertExpiration) && (
                      <div className={styles.complianceRow}>
                        {driver.licenseExpiration && (
                          <span
                            className={`${styles.complianceTag} ${licenseWarn}`}
                          >
                            {licenseWarn && (
                              <FontAwesomeIcon icon={faTriangleExclamation} />
                            )}
                            License: {expiryLabel(driver.licenseExpiration)}
                          </span>
                        )}
                        {driver.medicalCertExpiration && (
                          <span
                            className={`${styles.complianceTag} ${medWarn}`}
                          >
                            {medWarn && (
                              <FontAwesomeIcon icon={faTriangleExclamation} />
                            )}
                            DOT: {expiryLabel(driver.medicalCertExpiration)}
                          </span>
                        )}
                      </div>
                    )}

                    {driver.statusReason && (
                      <div className={styles.statusReason}>
                        <FontAwesomeIcon icon={faClock} />
                        <span>{driver.statusReason}</span>
                      </div>
                    )}

                    {driver.notes && (
                      <p className={styles.notes}>{driver.notes}</p>
                    )}
                  </div>

                  <div className={styles.cardFooter}>
                    <span className={styles.tripsCompleted}>
                      <FontAwesomeIcon icon={faRoad} />
                      {driver.totalTripsCompleted || 0} trips
                    </span>
                    <span className={styles.onTimeRate}>
                      <FontAwesomeIcon icon={faCheckCircle} />
                      {driver.onTimeDeliveryRate || 100}%
                    </span>
                    <span className={styles.rating}>
                      <FontAwesomeIcon icon={faStar} />
                      {driver.performanceRating?.toFixed(1) || "3.0"}
                    </span>
                    {driver.status === "Available" && (
                      <button
                        className={styles.dispatchBtn}
                        title="Dispatch this driver"
                      >
                        Dispatch
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editing ? "Edit Driver" : "Add Driver"}
        size="lg"
      >
        <form className={styles.form} onSubmit={handleSubmit}>
          {error && <div className={styles.formError}>{error}</div>}

          {/* Profile photo */}
          <div className={styles.photoRow}>
            <div className={styles.photoPreviewWrap}>
              {photoPreview ? (
                <img
                  className={styles.photoPreview}
                  src={photoPreview}
                  alt="Preview"
                />
              ) : (
                <div className={styles.photoPlaceholder}>
                  <FontAwesomeIcon icon={faCamera} />
                </div>
              )}
            </div>
            <label className={styles.photoUploadBtn}>
              <FontAwesomeIcon icon={faCamera} />
              {photoPreview ? "Change Photo" : "Upload Photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoChange}
                hidden
              />
            </label>
          </div>

          <div className={styles.formGrid}>
            <div
              className={`${styles.formGroup} ${styles.fullWidth} ${styles.sectionTitle}`}
            >
              <FontAwesomeIcon icon={faCircleUser} /> Identity
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Full Name *</label>
              <input
                id="driver-name"
                className={styles.input}
                required
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="John Smith"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Employee ID</label>
              <input
                id="driver-employee-id"
                className={styles.input}
                value={form.employeeId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, employeeId: e.target.value }))
                }
                placeholder="Leave blank to auto-generate"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Phone *</label>
              <input
                id="driver-phone"
                className={styles.input}
                required
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
                placeholder="(312) 555-0100"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Email *</label>
              <input
                id="driver-email"
                className={styles.input}
                type="email"
                required
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                placeholder="john.smith@dispatch.com"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Date of Birth</label>
              <input
                id="driver-dob"
                className={styles.input}
                type="date"
                value={form.dateOfBirth}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dateOfBirth: e.target.value }))
                }
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Gender</label>
              <select
                id="driver-gender"
                className={styles.input}
                value={form.gender}
                onChange={(e) =>
                  setForm((f) => ({ ...f, gender: e.target.value }))
                }
              >
                <option value="">Select...</option>
                {GENDER_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div
              className={`${styles.formGroup} ${styles.fullWidth} ${styles.sectionTitle}`}
            >
              <FontAwesomeIcon icon={faUserClock} /> Availability
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Status</label>
              <select
                id="driver-status"
                className={styles.input}
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value }))
                }
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Status Reason</label>
              <input
                id="driver-status-reason"
                className={styles.input}
                value={form.statusReason}
                onChange={(e) =>
                  setForm((f) => ({ ...f, statusReason: e.target.value }))
                }
                placeholder="Optional notes..."
              />
            </div>

            {/* Leave date range — only when status is leave-related */}
            {isLeaveStatus && (
              <>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Leave Start *</label>
                  <input
                    id="driver-leave-start"
                    className={styles.input}
                    type="date"
                    required
                    value={form.leaveStart}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, leaveStart: e.target.value }))
                    }
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Leave End *</label>
                  <input
                    id="driver-leave-end"
                    className={styles.input}
                    type="date"
                    required
                    value={form.leaveEnd}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, leaveEnd: e.target.value }))
                    }
                  />
                </div>
              </>
            )}

            <div
              className={`${styles.formGroup} ${styles.fullWidth} ${styles.sectionTitle}`}
            >
              <FontAwesomeIcon icon={faCalendar} /> Schedule
            </div>

            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label className={styles.label}>Working Days *</label>
              <div className={styles.presetRow}>
                {DAY_PRESETS.map((preset) => {
                  const isActive =
                    preset.days.length === form.workDays.length &&
                    preset.days.every((d) => form.workDays.includes(d));
                  return (
                    <button
                      type="button"
                      key={preset.label}
                      className={`${styles.presetBtn} ${isActive ? styles.presetBtnActive : ""}`}
                      onClick={() =>
                        setForm((f) => ({ ...f, workDays: [...preset.days] }))
                      }
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <div className={styles.dayToggleRow} id="driver-workdays">
                {WORK_DAYS.map((day) => {
                  const active = form.workDays.includes(day.key);
                  return (
                    <button
                      type="button"
                      key={day.key}
                      title={day.full}
                      className={`${styles.dayToggleBtn} ${active ? styles.dayToggleBtnActive : ""}`}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          workDays: active
                            ? f.workDays.filter((d) => d !== day.key)
                            : WORK_DAY_KEYS.filter(
                                (d) => f.workDays.includes(d) || d === day.key,
                              ),
                        }))
                      }
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
              <small>
                {form.workDays.length === 7
                  ? "No day off selected — pick at least one day off"
                  : `Day${daysOffFromWorkDays(form.workDays).length > 1 ? "s" : ""} off: ${daysOffFromWorkDays(form.workDays).join(", ") || "none"}`}
              </small>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Shift Start *</label>
              <select
                id="driver-shift-start"
                className={styles.input}
                required
                value={form.shiftStart}
                onChange={(e) =>
                  setForm((f) => ({ ...f, shiftStart: e.target.value }))
                }
              >
                {HOUR_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {formatHour12(h)}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Shift End *</label>
              <select
                id="driver-shift-end"
                className={styles.input}
                required
                value={form.shiftEnd}
                onChange={(e) =>
                  setForm((f) => ({ ...f, shiftEnd: e.target.value }))
                }
              >
                {HOUR_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {formatHour12(h)}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Max Weekly Hours</label>
              <input
                id="driver-max-hours"
                className={styles.input}
                type="number"
                value={form.maxWeeklyHours}
                onChange={(e) =>
                  setForm((f) => ({ ...f, maxWeeklyHours: e.target.value }))
                }
                placeholder="60"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={form.availableOnDaysOff}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      availableOnDaysOff: e.target.checked,
                    }))
                  }
                />
                Willing to Work on Day(s) Off
              </label>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={form.overtimePreference}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      overtimePreference: e.target.checked,
                    }))
                  }
                />
                Willing to Work Overtime
              </label>
            </div>

            <div
              className={`${styles.formGroup} ${styles.fullWidth} ${styles.sectionTitle}`}
            >
              <FontAwesomeIcon icon={faTruck} /> Vehicle Eligibility & License
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>License Number *</label>
              <input
                id="driver-license"
                className={styles.input}
                required
                value={form.licenseNumber}
                onChange={(e) =>
                  setForm((f) => ({ ...f, licenseNumber: e.target.value }))
                }
                placeholder="IL-DL-123456"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>License Class</label>
              <select
                id="driver-license-class"
                className={styles.input}
                value={form.licenseClass}
                onChange={(e) =>
                  setForm((f) => ({ ...f, licenseClass: e.target.value }))
                }
              >
                {LICENSE_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    Class {c}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>License Expiration *</label>
              <input
                id="driver-license-exp"
                className={styles.input}
                type="date"
                required
                value={form.licenseExpiration}
                onChange={(e) =>
                  setForm((f) => ({ ...f, licenseExpiration: e.target.value }))
                }
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>
                DOT Medical Card Expiration
                {["A", "B"].includes(form.licenseClass) ||
                (form.vehicleTypes || []).includes("Tractor")
                  ? " *"
                  : ""}
              </label>
              <input
                id="driver-med-exp"
                className={styles.input}
                type="date"
                value={form.medicalCertExpiration}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    medicalCertExpiration: e.target.value,
                  }))
                }
              />
              {(["A", "B"].includes(form.licenseClass) ||
                (form.vehicleTypes || []).includes("Tractor")) && (
                <small>Required for CDL Class A/B or Tractor drivers</small>
              )}
            </div>

            {/* Scanned license upload */}
            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label className={styles.label}>
                Scanned License (for record)
              </label>
              <div className={styles.licenseUploadRow}>
                <div className={styles.licensePreviewWrap}>
                  {licensePhotoPreview ? (
                    <img
                      className={styles.licensePreview}
                      src={licensePhotoPreview}
                      alt="License scan preview"
                    />
                  ) : (
                    <div className={styles.licensePlaceholder}>
                      <FontAwesomeIcon icon={faFileImage} />
                      <span>No scan</span>
                    </div>
                  )}
                </div>
                <label className={styles.photoUploadBtn}>
                  <FontAwesomeIcon icon={faCamera} />
                  {licensePhotoPreview ? "Change Scan" : "Upload License Scan"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleLicensePhotoChange}
                    hidden
                  />
                </label>
              </div>
              <small>
                JPEG, PNG or WEBP · max 5 MB · stored for compliance records
              </small>
            </div>

            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label className={styles.label}>Vehicle Types</label>
              <select
                id="driver-vehicle-types"
                className={styles.input}
                multiple
                value={form.vehicleTypes}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    vehicleTypes: Array.from(
                      e.target.selectedOptions,
                      (opt) => opt.value,
                    ),
                  }))
                }
              >
                {VEHICLE_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <small>Hold Ctrl/Cmd to select multiple</small>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={form.trailerEligible}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      trailerEligible: e.target.checked,
                    }))
                  }
                />
                Trailer Eligible
              </label>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={form.hazmatCertified}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      hazmatCertified: e.target.checked,
                    }))
                  }
                />
                Hazmat Certified
              </label>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  id="driver-gdp-trained"
                  type="checkbox"
                  checked={form.gdpTrained}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, gdpTrained: e.target.checked }))
                  }
                />
                GDP Trained
              </label>
              <small>Reefer handling, pickups &amp; checklist compliance</small>
            </div>

            <div
              className={`${styles.formGroup} ${styles.fullWidth} ${styles.sectionTitle}`}
            >
              <FontAwesomeIcon icon={faFlag} /> Preferences
            </div>

            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label className={styles.label}>Preferred Run Types</label>
              <select
                id="driver-preferred-runs"
                className={styles.input}
                multiple
                value={form.preferredRunTypes}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    preferredRunTypes: Array.from(
                      e.target.selectedOptions,
                      (opt) => opt.value,
                    ),
                  }))
                }
              >
                {RUN_TYPES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <small>Hold Ctrl/Cmd to select multiple</small>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Home Base</label>
              <input
                id="driver-home-base"
                className={styles.input}
                value={form.homeBase}
                onChange={(e) =>
                  setForm((f) => ({ ...f, homeBase: e.target.value }))
                }
                placeholder="ORD, LAX, etc."
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Max Radius (miles)</label>
              <input
                id="driver-max-radius"
                className={styles.input}
                type="number"
                value={form.maxRadius}
                onChange={(e) =>
                  setForm((f) => ({ ...f, maxRadius: e.target.value }))
                }
                placeholder="200"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={form.overnightAllowed}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      overnightAllowed: e.target.checked,
                    }))
                  }
                />
                Overnight Allowed
              </label>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={form.crossBorder}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, crossBorder: e.target.checked }))
                  }
                />
                Cross Border (US/Canada/Mexico)
              </label>
            </div>

            <div
              className={`${styles.formGroup} ${styles.fullWidth} ${styles.sectionTitle}`}
            >
              <FontAwesomeIcon icon={faAward} /> Performance
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Performance Rating (1-5)</label>
              <input
                id="driver-rating"
                className={styles.input}
                type="number"
                min="1"
                max="5"
                step="0.1"
                value={form.performanceRating}
                onChange={(e) =>
                  setForm((f) => ({ ...f, performanceRating: e.target.value }))
                }
                placeholder="3.0"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Total Trips Completed</label>
              <input
                id="driver-trips"
                className={styles.input}
                type="number"
                min="0"
                value={form.totalTripsCompleted}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    totalTripsCompleted: e.target.value,
                  }))
                }
                placeholder="0"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>On-Time Delivery Rate (%)</label>
              <input
                id="driver-on-time"
                className={styles.input}
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={form.onTimeDeliveryRate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, onTimeDeliveryRate: e.target.value }))
                }
                placeholder="100"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Safety Score</label>
              <input
                id="driver-safety"
                className={styles.input}
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={form.safetyScore}
                onChange={(e) =>
                  setForm((f) => ({ ...f, safetyScore: e.target.value }))
                }
                placeholder="100"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Incidents</label>
              <input
                id="driver-incidents"
                className={styles.input}
                type="number"
                min="0"
                value={form.incidents}
                onChange={(e) =>
                  setForm((f) => ({ ...f, incidents: e.target.value }))
                }
                placeholder="0"
              />
            </div>

            <div
              className={`${styles.formGroup} ${styles.fullWidth} ${styles.sectionTitle}`}
            >
              <FontAwesomeIcon icon={faDollarSign} /> Compensation
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Hire Date</label>
              <input
                id="driver-hire-date"
                className={styles.input}
                type="date"
                value={form.hireDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, hireDate: e.target.value }))
                }
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Employment Status</label>
              <select
                id="driver-employment-status"
                className={styles.input}
                value={form.employmentStatus}
                onChange={(e) =>
                  setForm((f) => ({ ...f, employmentStatus: e.target.value }))
                }
              >
                <option value="Active">Active</option>
                <option value="On Leave">On Leave</option>
                <option value="Terminated">Terminated</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Pay Type</label>
              <select
                id="driver-pay-type"
                className={styles.input}
                value={form.payType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, payType: e.target.value }))
                }
              >
                {PAY_TYPES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Pay Rate ($)</label>
              <input
                id="driver-pay-rate"
                className={styles.input}
                type="number"
                min="0"
                step="0.01"
                value={form.payRate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, payRate: e.target.value }))
                }
                placeholder="24.50"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Overtime Rate ($)</label>
              <input
                id="driver-overtime-rate"
                className={styles.input}
                type="number"
                min="0"
                step="0.01"
                value={form.overtimeRate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, overtimeRate: e.target.value }))
                }
                placeholder="36.75"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={form.bonusEligible}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, bonusEligible: e.target.checked }))
                  }
                />
                Bonus Eligible
              </label>
            </div>

            <div
              className={`${styles.formGroup} ${styles.fullWidth} ${styles.sectionTitle}`}
            >
              <FontAwesomeIcon icon={faHeart} /> Emergency Contact
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Emergency Contact Name</label>
              <input
                id="driver-ec-name"
                className={styles.input}
                value={form.emergencyContactName}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    emergencyContactName: e.target.value,
                  }))
                }
                placeholder="Jane Smith"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Emergency Contact Phone</label>
              <input
                id="driver-ec-phone"
                className={styles.input}
                value={form.emergencyContactPhone}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    emergencyContactPhone: e.target.value,
                  }))
                }
                placeholder="(312) 555-0199"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Emergency Contact Relation</label>
              <input
                id="driver-ec-relation"
                className={styles.input}
                value={form.emergencyContactRelation}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    emergencyContactRelation: e.target.value,
                  }))
                }
                placeholder="Spouse, Parent, etc."
              />
            </div>

            <div
              className={`${styles.formGroup} ${styles.fullWidth} ${styles.sectionTitle}`}
            >
              <FontAwesomeIcon icon={faShieldHalved} /> Additional Info
            </div>

            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label className={styles.label}>Address</label>
              <input
                id="driver-address"
                className={styles.input}
                value={form.address}
                onChange={(e) =>
                  setForm((f) => ({ ...f, address: e.target.value }))
                }
                placeholder="123 Main St, Chicago, IL"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Special Skills</label>
              <input
                id="driver-skills"
                className={styles.input}
                value={form.specialSkills}
                onChange={(e) =>
                  setForm((f) => ({ ...f, specialSkills: e.target.value }))
                }
                placeholder="Forklift, Hazmat, etc."
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Medical Conditions</label>
              <input
                id="driver-medical"
                className={styles.input}
                value={form.medicalConditions}
                onChange={(e) =>
                  setForm((f) => ({ ...f, medicalConditions: e.target.value }))
                }
                placeholder="Self-reported conditions"
              />
            </div>
            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label className={styles.label}>Notes</label>
              <textarea
                id="driver-notes"
                className={styles.textarea}
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                rows={3}
                placeholder="Additional information..."
              />
            </div>
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={closeModal}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.saveBtn}
              disabled={saving}
              id="driver-save-btn"
            >
              {saving ? "Saving..." : editing ? "Save Changes" : "Add Driver"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Driver"
        size="sm"
      >
        <p className={styles.confirmText}>
          Are you sure you want to delete this driver? This action cannot be
          undone.
        </p>
        <div className={styles.formActions}>
          <button
            className={styles.cancelBtn}
            onClick={() => setDeleteId(null)}
          >
            Cancel
          </button>
          <button
            className={styles.deleteConfirmBtn}
            onClick={handleDelete}
            id="driver-delete-confirm"
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
