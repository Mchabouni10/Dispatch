//src/pages/Dispatch/components/BuildRunModal/BuildRunModal.jsx
import React, { useEffect, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faChevronRight,
  faDoorOpen,
  faLocationDot,
  faPlaneArrival,
  faPlaneDeparture,
  faTriangleExclamation,
  faTruck,
  faUserPlus,
} from "@fortawesome/free-solid-svg-icons";
import Modal from "../../../../components/Modal/Modal.jsx";
import ShipmentLane from "../ShipmentLane/ShipmentLane.jsx";
import {
  awbLabel,
  checkedInToday,
  isBreakOver,
  isPowerUnit,
  detectAirlineFromShipments,
  detectWarehouseFromShipments,
  toDatetimeLocal,
} from "../../utils/dispatchHelpers.js";
import {
  driverIneligibleReason,
  getRequiredCertifications,
  isDriverCertifiedForShipments,
  isDriverLicensedForEquipment,
  isTrailerPairingValid,
} from "../../utils/dispatchEligibility.js";
import { DOOR_OPTIONS } from "../../utils/dispatchConstants.js";
import formStyles from "../../shared/FormControls.module.css";
import DateTimePicker, { toLocalISO } from "../../../../styles/Datetimepicker.jsx";
import styles from "./BuildRunModal.module.css";

export default function BuildRunModal({
  open,
  editingTrip,
  form,
  setForm,
  error,
  saving,
  drivers,
  availableDrivers,
  equipment,
  airlines,
  unitAssignedToDriver,
  busyEquipmentIds,
  trucks,
  trailers,
  availableShipments,
  importCount,
  exportCount,
  onClose,
  onSubmit,
  onOpenBackup,
}) {
  /* ── Derived options ── */

  const driverOptions = useMemo(() => {
    const list = [...availableDrivers];
    if (
      editingTrip &&
      editingTrip.driver &&
      !list.some((d) => d.id === editingTrip.driver.id)
    ) {
      list.unshift(editingTrip.driver);
    }
    const selectedTruckId = form.truck;
    list.sort((a, b) => {
      const aMatchTruck =
        selectedTruckId && unitAssignedToDriver[a.id]?.id === selectedTruckId
          ? 0
          : 1;
      const bMatchTruck =
        selectedTruckId && unitAssignedToDriver[b.id]?.id === selectedTruckId
          ? 0
          : 1;
      if (aMatchTruck !== bMatchTruck) return aMatchTruck - bMatchTruck;
      const aIn = checkedInToday(a) ? 0 : 1;
      const bIn = checkedInToday(b) ? 0 : 1;
      if (aIn !== bIn) return aIn - bIn;
      const aBreak = isBreakOver(a) ? 1 : 0;
      const bBreak = isBreakOver(b) ? 1 : 0;
      if (aBreak !== bBreak) return aBreak - bBreak;
      return (a.name || "").localeCompare(b.name || "");
    });
    return list;
  }, [availableDrivers, editingTrip, form.truck, unitAssignedToDriver]);

  const truckOptions = useMemo(() => {
    let list =
      trucks.length > 0
        ? [...trucks]
        : equipment.filter(
            (e) =>
              e.status === "In Service" &&
              !busyEquipmentIds.has(e.id) &&
              !isPowerUnit(e) === false &&
              (!e.availableAt ||
                new Date(e.availableAt).getTime() <= Date.now()),
          );
    if (
      editingTrip &&
      editingTrip.truck &&
      !list.some((t) => t.id === editingTrip.truck.id)
    ) {
      list = [editingTrip.truck, ...list];
    }
    const preferredId = form.driver
      ? unitAssignedToDriver[form.driver]?.id
      : null;
    list.sort((a, b) => {
      const aPref = preferredId && a.id === preferredId ? 0 : 1;
      const bPref = preferredId && b.id === preferredId ? 0 : 1;
      if (aPref !== bPref) return aPref - bPref;
      const aOther =
        a.assignedDriverId && a.assignedDriverId !== form.driver ? 1 : 0;
      const bOther =
        b.assignedDriverId && b.assignedDriverId !== form.driver ? 1 : 0;
      if (aOther !== bOther) return aOther - bOther;
      return (a.unitNumber || "").localeCompare(b.unitNumber || "");
    });
    return list;
  }, [trucks, equipment, busyEquipmentIds, editingTrip, form.driver, unitAssignedToDriver]);

  const trailerOptions = useMemo(() => {
    let list =
      trailers.length > 0
        ? [...trailers]
        : equipment.filter(
            (e) =>
              e.status === "In Service" &&
              !busyEquipmentIds.has(e.id) &&
              (!e.availableAt ||
                new Date(e.availableAt).getTime() <= Date.now()),
          );
    if (
      editingTrip &&
      editingTrip.trailer &&
      !list.some((t) => t.id === editingTrip.trailer.id)
    ) {
      list = [editingTrip.trailer, ...list];
    }
    return list;
  }, [trailers, equipment, busyEquipmentIds, editingTrip]);

  const lockedTruckForDriver = useMemo(() => {
    if (!form.driver) return null;
    const unit = unitAssignedToDriver[form.driver];
    if (!unit || !isPowerUnit(unit)) return null;
    if (unit.status !== "In Service") return null;
    if (busyEquipmentIds.has(unit.id)) return null;
    if (unit.availableAt && new Date(unit.availableAt).getTime() > Date.now())
      return null;
    return unit;
  }, [form.driver, unitAssignedToDriver, busyEquipmentIds]);

  /* ── Manifest ── */

  const manifestOptions = useMemo(() => {
    if (!form.runType) return [];
    const unassigned = availableShipments.filter(
      (s) => s.type === form.runType,
    );
    if (!editingTrip) return unassigned;
    const currentTripShipments = (editingTrip.shipments || []).filter(
      (s) => s.type === form.runType,
    );
    const map = new Map();
    unassigned.forEach((s) => map.set(s.id, s));
    currentTripShipments.forEach((s) => map.set(s.id, s));
    return Array.from(map.values());
  }, [availableShipments, form.runType, editingTrip]);

  const selectedShipments = manifestOptions.filter((s) =>
    form.shipments.includes(s.id),
  );

  // ─── Eligibility filtering ──────────────────────────────────────
  // Cross-checks driver ↔ truck ↔ trailer ↔ manifest so the three fields
  // narrow each other down as the dispatcher fills the form, instead of
  // letting an incompatible combination reach submit and bounce off the
  // server's authoritative check (lib/dispatchEligibility.js on the server).
  const requiredCerts = useMemo(
    () => getRequiredCertifications(selectedShipments),
    [selectedShipments],
  );

  const selectedDriver = useMemo(
    () => drivers.find((d) => d.id === form.driver) || null,
    [drivers, form.driver],
  );

  const selectedTruck = useMemo(() => {
    const pool = editingTrip?.truck
      ? [editingTrip.truck, ...truckOptions]
      : truckOptions;
    return pool.find((t) => t.id === form.truck) || null;
  }, [truckOptions, editingTrip, form.truck]);

  // Drivers filtered to only those certified for this manifest's hazmat/GDP
  // requirements AND (once a truck is picked) licensed for that truck.
  const eligibleDriverOptions = useMemo(
    () =>
      driverOptions.filter(
        (d) =>
          isDriverCertifiedForShipments(d, selectedShipments) &&
          (!selectedTruck || isDriverLicensedForEquipment(d, selectedTruck)),
      ),
    [driverOptions, selectedShipments, selectedTruck],
  );
  const hiddenDriverCount = driverOptions.length - eligibleDriverOptions.length;

  // Real, per-driver reasons for anyone the filter above hid — instead of
  // guessing from which requirements exist at all (hazmat/gdp/license can
  // each be true without being the reason a *specific* driver disappeared),
  // this asks driverIneligibleReason() what actually disqualified them and
  // groups drivers by that exact reason so the banner never overstates or
  // misattributes why the list emptied out.
  const hiddenDriverReasons = useMemo(() => {
    const hidden = driverOptions.filter(
      (d) => !eligibleDriverOptions.some((e) => e.id === d.id),
    );
    const counts = new Map();
    hidden.forEach((d) => {
      const reason =
        driverIneligibleReason(d, {
          shipments: selectedShipments,
          truck: selectedTruck,
        }) || "not eligible for this combination";
      counts.set(reason, (counts.get(reason) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([reason, count]) => ({
      reason,
      count,
    }));
  }, [driverOptions, eligibleDriverOptions, selectedShipments, selectedTruck]);

  // Trucks filtered to only what the selected driver's license class covers.
  const eligibleTruckOptions = useMemo(
    () =>
      truckOptions.filter(
        (t) => !selectedDriver || isDriverLicensedForEquipment(selectedDriver, t),
      ),
    [truckOptions, selectedDriver],
  );
  const hiddenTruckCount = truckOptions.length - eligibleTruckOptions.length;

  // A trailer can only ride behind a Tractor, and only if the driver is
  // trailer-eligible — otherwise there's nothing valid to offer at all.
  const trailerPairingAllowed = isTrailerPairingValid(selectedDriver, selectedTruck);
  const eligibleTrailerOptions = trailerPairingAllowed ? trailerOptions : [];

  // If the truck/driver combo stops supporting a trailer (e.g. dispatcher
  // switches from a Tractor to a Straight Truck), drop whatever trailer was
  // selected instead of silently submitting an invalid combination.
  useEffect(() => {
    if (!trailerPairingAllowed && form.trailer) {
      setForm((f) => ({ ...f, trailer: "" }));
    }
  }, [trailerPairingAllowed, form.trailer, setForm]);

  const routeFromPermit = useMemo(() => {
    if (selectedShipments.length === 0)
      return { airline: null, warehouse: null, door: "" };
    const airline = detectAirlineFromShipments(selectedShipments, airlines);
    const warehouse = detectWarehouseFromShipments(selectedShipments);
    const door =
      selectedShipments.find((s) => s.doorNumber)?.doorNumber || "";
    return { airline, warehouse, door };
  }, [selectedShipments, airlines]);

  const suggestedAirline = routeFromPermit.airline;

  // Auto-fill door on export
  useEffect(() => {
    if (!open || form.runType !== "Export") return;
    if (form.doorNumber) return;
    if (routeFromPermit.door) {
      setForm((f) => ({ ...f, doorNumber: String(routeFromPermit.door) }));
    }
  }, [open, form.runType, form.doorNumber, routeFromPermit.door, setForm]);

  /* ── Handlers ── */

  const chooseRunType = (runType) =>
    setForm((f) => ({ ...f, runType, shipments: [], doorNumber: "" }));

  const toggleShipment = (id) =>
    setForm((current) => ({
      ...current,
      shipments: current.shipments.includes(id)
        ? current.shipments.filter((value) => value !== id)
        : [...current.shipments, id],
    }));

  const selectDriver = (driverId) => {
    setForm((f) => {
      const next = { ...f, driver: driverId };
      if (!driverId) {
        next.truck = "";
        return next;
      }
      const unit = unitAssignedToDriver[driverId];
      if (
        unit &&
        isPowerUnit(unit) &&
        unit.status === "In Service" &&
        !busyEquipmentIds.has(unit.id) &&
        (!unit.availableAt || new Date(unit.availableAt).getTime() <= Date.now())
      ) {
        next.truck = unit.id;
      }
      return next;
    });
  };

  function driverOptionLabel(d) {
    const parts = [d.name];
    if (d.phone) parts.push(d.phone);
    const tags = [];
    if (checkedInToday(d)) tags.push("checked in");
    const unit = unitAssignedToDriver[d.id];
    if (unit) tags.push(`has ${unit.unitNumber}`);
    if (isBreakOver(d)) tags.push("break over");
    else if (d.status === "On Call") tags.push("on call");
    if (tags.length) parts.push(`[${tags.join(" · ")}]`);
    return parts.join(" · ");
  }

  function truckOptionLabel(t) {
    const parts = [t.unitNumber, t.equipmentType || t.category].filter(Boolean);
    if (t.capacityLbs) parts.push(`${t.capacityLbs.toLocaleString()} lb`);
    if (form.driver && t.assignedDriverId === form.driver) {
      parts.push("★ their unit");
    } else if (t.assignedDriverId) {
      const owner = drivers.find((d) => d.id === t.assignedDriverId);
      parts.push(owner ? `with ${owner.name}` : "assigned");
    }
    return parts.join(" · ");
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={
        editingTrip
          ? `Edit run ${editingTrip.tripNumber}`
          : "Build an air-cargo run"
      }
      size="lg"
    >
      <form className={formStyles.form} onSubmit={onSubmit}>
        <p className={formStyles.formIntro}>
          Choose Import or Export, pick cargo permits (route auto-fills from
          the permit), assign the vehicle team, then set the timing window.
        </p>
        {error && <div className={formStyles.error}>{error}</div>}

        {/* ── Run type picker ── */}
        <div className={styles.runTypePicker}>
          <button
            type="button"
            className={`${styles.runTypeBtn} ${
              form.runType === "Import" ? styles.runTypeBtnActive : ""
            }`}
            onClick={() => chooseRunType("Import")}
          >
            <FontAwesomeIcon icon={faPlaneArrival} /> Import{" "}
            <span>{importCount} ready</span>
          </button>
          <button
            type="button"
            className={`${styles.runTypeBtn} ${
              form.runType === "Export" ? styles.runTypeBtnActive : ""
            } ${form.runType === "Export" ? styles.runTypeBtnExport : ""}`}
            onClick={() => chooseRunType("Export")}
          >
            <FontAwesomeIcon icon={faPlaneDeparture} /> Export{" "}
            <span>{exportCount} ready</span>
          </button>
        </div>

        {/* ── Route banner ── */}
        {form.runType && (
          <div className={styles.routeBanner}>
            <div className={styles.routeStep}>
              <span className={styles.routeBadge}>
                {form.runType === "Export"
                  ? "PICKUP ORIGIN"
                  : "PICKUP TERMINAL"}
              </span>
              <div className={styles.routeInfo}>
                <FontAwesomeIcon
                  icon={
                    form.runType === "Export" ? faLocationDot : faPlaneArrival
                  }
                />
                <strong>
                  {form.runType === "Export"
                    ? routeFromPermit.warehouse?.name ||
                      "Select cargo to show warehouse"
                    : suggestedAirline
                      ? `${suggestedAirline.name} Air Cargo Terminal`
                      : "Select cargo to show airline terminal"}
                </strong>
              </div>
            </div>
            <div className={styles.routeArrow}>
              <FontAwesomeIcon icon={faChevronRight} />
              <span className={styles.routeTruckTag}>
                <FontAwesomeIcon icon={faTruck} /> Ground Transit
              </span>
            </div>
            <div className={styles.routeStep}>
              <span className={styles.routeBadge}>
                {form.runType === "Export"
                  ? "DELIVERY DESTINATION"
                  : "DELIVERY WAREHOUSE"}
              </span>
              <div className={styles.routeInfo}>
                <FontAwesomeIcon
                  icon={
                    form.runType === "Export"
                      ? faPlaneDeparture
                      : faLocationDot
                  }
                />
                <strong>
                  {form.runType === "Export"
                    ? suggestedAirline
                      ? `${suggestedAirline.name} Cargo Terminal${
                          form.doorNumber ? ` (Door ${form.doorNumber})` : ""
                        }`
                      : `Select cargo to show airline${
                          form.doorNumber ? ` (Door ${form.doorNumber})` : ""
                        }`
                    : routeFromPermit.warehouse?.name ||
                      "Select cargo to show warehouse"}
                </strong>
              </div>
            </div>
          </div>
        )}

        {/* ── Airline suggestion ── */}
        {suggestedAirline && form.runType && selectedShipments.length > 0 && (
          <div className={styles.airlineSuggestionBanner}>
            <FontAwesomeIcon icon={faPlaneArrival} />
            <div>
              <strong>Route from permit: {suggestedAirline.name}</strong>
              <span>
                {suggestedAirline.awbPrefix
                  ? `AWB Prefix ${suggestedAirline.awbPrefix} · `
                  : ""}
                {form.runType === "Import"
                  ? `Pickup at airline terminal → deliver to ${
                      routeFromPermit.warehouse?.name || "warehouse"
                    }`
                  : `Pickup at ${
                      routeFromPermit.warehouse?.name || "warehouse"
                    } → deliver to airline terminal`}
              </span>
            </div>
          </div>
        )}

        {/* ── Form fields ── */}
        <div className={formStyles.formGrid}>
          <label>
            Driver
            <select
              required
              value={form.driver}
              onChange={(e) => selectDriver(e.target.value)}
            >
              <option value="">Select driver</option>
              {eligibleDriverOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {driverOptionLabel(d)}
                </option>
              ))}
            </select>
            {hiddenDriverCount > 0 && (
              <div className={styles.eligibilityWarning}>
                <FontAwesomeIcon icon={faTriangleExclamation} />
                <div>
                  <strong>
                    {hiddenDriverCount} driver
                    {hiddenDriverCount === 1 ? "" : "s"} hidden
                    {eligibleDriverOptions.length === 0
                      ? " — no one currently qualifies for this run"
                      : ""}
                  </strong>
                  <ul>
                    {hiddenDriverReasons.map(({ reason, count }) => (
                      <li key={reason}>
                        {count} driver{count === 1 ? "" : "s"} {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {form.driver && (
              <span className={formStyles.fieldHint}>
                {(() => {
                  const d = drivers.find((x) => x.id === form.driver);
                  if (!d) return null;
                  const unit = unitAssignedToDriver[d.id];
                  if (isBreakOver(d)) {
                    return "Break ended — soft-available for dispatch.";
                  }
                  if (unit) {
                    return `Morning handoff: ${unit.unitNumber} · auto-selected when free.`;
                  }
                  if (checkedInToday(d)) {
                    return "Checked in today — no unit on the Handoff board yet.";
                  }
                  return "Not checked in on the Handoff board today.";
                })()}
              </span>
            )}
          </label>

          <label>
            Power unit / Truck
            <select
              required
              value={form.truck}
              disabled={!!lockedTruckForDriver}
              onChange={(e) =>
                setForm((f) => ({ ...f, truck: e.target.value }))
              }
            >
              <option value="">
                {eligibleTruckOptions.length === 0
                  ? "No available power units"
                  : "Select in-service power unit"}
              </option>
              {eligibleTruckOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {truckOptionLabel(t)}
                </option>
              ))}
            </select>
            {lockedTruckForDriver ? (
              <span className={formStyles.fieldHintGood}>
                Locked to morning handoff unit{" "}
                {lockedTruckForDriver.unitNumber}. Change driver to pick a
                different truck.
              </span>
            ) : form.driver &&
              form.truck &&
              unitAssignedToDriver[form.driver]?.id === form.truck ? (
              <span className={formStyles.fieldHintGood}>
                Matches this driver's morning handoff unit.
              </span>
            ) : hiddenTruckCount > 0 ? (
              <span className={formStyles.fieldHint}>
                {hiddenTruckCount} unit{hiddenTruckCount === 1 ? "" : "s"}{" "}
                hidden — {selectedDriver?.name || "this driver"}'s license
                class ({selectedDriver?.licenseClass || "?"}) doesn't cover
                them.
              </span>
            ) : null}
          </label>

          <label>
            Trailer <span>(optional)</span>
            <select
              value={form.trailer}
              disabled={!trailerPairingAllowed}
              onChange={(e) =>
                setForm((f) => ({ ...f, trailer: e.target.value }))
              }
            >
              <option value="">
                {trailerPairingAllowed ? "No trailer" : "Not applicable"}
              </option>
              {eligibleTrailerOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.unitNumber} · {t.equipmentType || t.category}
                  {t.capacityLbs
                    ? ` · ${t.capacityLbs.toLocaleString()} lb`
                    : ""}
                </option>
              ))}
            </select>
            {!trailerPairingAllowed && selectedTruck && (
              <span className={formStyles.fieldHint}>
                {selectedTruck.equipmentType || "This unit"} doesn't pull a
                trailer — only a Tractor does.
              </span>
            )}
            {!trailerPairingAllowed &&
              !selectedTruck &&
              selectedDriver &&
              selectedDriver.trailerEligible === false && (
                <span className={formStyles.fieldHint}>
                  {selectedDriver.name} isn't marked trailer-eligible.
                </span>
              )}
          </label>

          {form.runType === "Export" && (
            <label>
              <FontAwesomeIcon icon={faDoorOpen} style={{ marginRight: 6 }} />
              Warehouse door (1–30) *
              <select
                required
                value={form.doorNumber}
                onChange={(e) =>
                  setForm((f) => ({ ...f, doorNumber: e.target.value }))
                }
              >
                <option value="">Select door…</option>
                {DOOR_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    Door {n}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            Dispatcher notes
            <input
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              placeholder="Dock, terminal or handling instructions"
            />
          </label>

          <label>
            Planned departure
            <DateTimePicker
              value={form.plannedDepartureTime}
              onChange={(date) =>
                setForm((f) => ({
                  ...f,
                  plannedDepartureTime: date ? toLocalISO(date) : "",
                }))
              }
            />
          </label>

          <label>
            Expected completion <span>(driver empty)</span>
            <DateTimePicker
              value={form.expectedCompletionTime}
              onChange={(date) =>
                setForm((f) => ({
                  ...f,
                  expectedCompletionTime: date ? toLocalISO(date) : "",
                }))
              }
            />
          </label>
        </div>

        {/* ── Manifest picker ── */}
        <div className={formStyles.manifestPicker}>
          <div className={formStyles.pickerTitle}>
            Cargo manifest{" "}
            <span>{selectedShipments.length} selected</span>
          </div>
          {(requiredCerts.hazmat || requiredCerts.gdp) && (
            <p className={formStyles.fieldHint}>
              This manifest requires{" "}
              {[
                requiredCerts.hazmat && "a hazmat-certified driver",
                requiredCerts.gdp && "a GDP-trained driver",
              ]
                .filter(Boolean)
                .join(" and ")}
              .
            </p>
          )}
          {!form.runType ? (
            <p className={formStyles.noCargo}>
              Choose Import or Export above to see matching cargo.
            </p>
          ) : manifestOptions.length === 0 ? (
            <p className={formStyles.noCargo}>
              No pending {form.runType.toLowerCase()} shipments are available.
            </p>
          ) : (
            manifestOptions.map((s) => (
              <button
                type="button"
                key={s.id}
                className={`${formStyles.pickRow} ${
                  form.shipments.includes(s.id) ? formStyles.picked : ""
                }`}
                onClick={() => toggleShipment(s.id)}
              >
                <span className={formStyles.checkbox}>
                  <FontAwesomeIcon icon={faCheck} />
                </span>
                <div>
                  <strong>{awbLabel(s)}</strong>
                  <span>
                    {s.type} · {s.airline?.name || "—"} · {s.pieces} pcs /{" "}
                    {s.weight} {s.weightUnit || "lb"}
                    {s.warehouse?.name ? ` · ${s.warehouse.name}` : ""}
                    {s.doorNumber ? ` · Door ${s.doorNumber}` : ""}
                  </span>
                  <ShipmentLane shipment={s} compact />
                </div>
              </button>
            ))
          )}
        </div>

        {/* ── Actions ── */}
        <div className={formStyles.formActions}>
          {editingTrip &&
            ["Scheduled", "En Route"].includes(editingTrip.status) && (
              <button
                type="button"
                className={formStyles.cancel}
                onClick={onOpenBackup}
              >
                <FontAwesomeIcon icon={faUserPlus} /> Add backup driver
              </button>
            )}
          <button
            type="button"
            className={formStyles.cancel}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className={formStyles.primaryButton} disabled={saving}>
            {saving
              ? editingTrip
                ? "Saving changes…"
                : "Building run…"
              : editingTrip
                ? "Save Changes"
                : "Create dispatch run"}
          </button>
        </div>
      </form>
    </Modal>
  );
}