import { KNOWN_AWB_PREFIXES } from "./dispatchConstants.js";

/* ─── Date / Time helpers ─────────────────────────────────────── */

export function shortDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function toDatetimeLocal(date) {
  const d = date ? new Date(date) : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function isSameDay(a, b) {
  if (!a) return false;
  const d1 = new Date(a);
  const d2 = b || new Date();
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/* ─── AWB / Label helpers ─────────────────────────────────────── */

export function awbLabel(shipment) {
  if (shipment?.awbDisplay) return shipment.awbDisplay;
  const prefix = shipment?.airline?.awbPrefix;
  const num = shipment?.airwaybillNumber;
  if (prefix && num) return `${prefix}-${num}`;
  if (num) return num;
  if (shipment?.airwaybillNumbers?.length) {
    const list = shipment.airwaybillNumbers;
    return list.length > 1 ? `${list[0]} +${list.length - 1} more` : list[0];
  }
  return "AWB pending";
}

/* ─── Allocation / Weight helpers ─────────────────────────────── */

export function proportionalWeight(piecesOnTrip, totalPieces, totalWeight) {
  if (!totalPieces || totalPieces <= 0) return 0;
  return Math.round((piecesOnTrip / totalPieces) * totalWeight * 100) / 100;
}

export function tripAllocation(shipment, trip) {
  if (shipment?.allocation) {
    return {
      pieces: Number(shipment.allocation.pieces) || 0,
      weight: Number(shipment.allocation.weight) || 0,
      isPartial: !!shipment.allocation.isPartial,
    };
  }
  const totalPieces = Number(shipment?.pieces) || 0;
  const totalWeight = Number(shipment?.weight) || 0;
  const split = (trip?.shipmentSplits || []).find(
    (sp) => sp.shipmentId === shipment?.id,
  );
  if (split) {
    const pcs = Number(split.pieces) || 0;
    const w =
      Number.isFinite(Number(split.weight)) && Number(split.weight) > 0
        ? Number(split.weight)
        : proportionalWeight(pcs, totalPieces, totalWeight);
    return {
      pieces: pcs,
      weight: w,
      isPartial: totalPieces > 0 && pcs < totalPieces,
    };
  }
  return { pieces: totalPieces, weight: totalWeight, isPartial: false };
}

export function heldOnParent(shipment, parentTrip) {
  const split = (parentTrip?.shipmentSplits || []).find(
    (sp) => sp.shipmentId === shipment.id,
  );
  if (split) {
    return {
      pieces: split.pieces,
      weight: split.weight,
      isPartial: split.pieces < shipment.pieces,
    };
  }
  return { pieces: shipment.pieces, weight: shipment.weight, isPartial: false };
}

/* ─── Cutoff helpers ──────────────────────────────────────────── */

export function cutoffState(shipment) {
  if (shipment.type !== "Export" || !shipment.lockoutTime) return null;
  const hours = (new Date(shipment.lockoutTime) - new Date()) / 3600000;
  if (hours <= 0) return { label: "Lockout passed", urgent: true };
  if (hours < 6)
    return { label: `${Math.ceil(hours)}h to airline cutoff`, urgent: true };
  return { label: `Cutoff ${shortDate(shipment.lockoutTime)}`, urgent: false };
}

/* ─── Driver eligibility helpers ──────────────────────────────── */

export function isBreakOver(driver) {
  if (driver?.status !== "Break" || !driver.breakUntil) return false;
  return new Date(driver.breakUntil).getTime() <= Date.now();
}

export function isDispatchEligible(driver) {
  if (!driver) return false;
  if (driver.status === "Available" || driver.status === "On Call") return true;
  return isBreakOver(driver);
}

export function checkedInToday(driver) {
  return isSameDay(driver?.lastCheckin);
}

/* ─── Equipment helpers ───────────────────────────────────────── */

export function isPowerUnit(e) {
  const cat = (e.category || "").toLowerCase();
  const type = (e.equipmentType || "").toLowerCase();
  return (
    cat.includes("power") ||
    cat === "truck" ||
    cat === "tractor" ||
    cat === "power unit" ||
    type.includes("truck") ||
    type.includes("tractor") ||
    type.includes("power") ||
    type.includes("straight") ||
    type.includes("cube")
  );
}

export function isTrailer(e) {
  const cat = (e.category || "").toLowerCase();
  const type = (e.equipmentType || "").toLowerCase();
  return cat.includes("trailer") || type.includes("trailer");
}

/* ─── Route detection helpers ─────────────────────────────────── */

export function detectAirlineFromShipments(selectedShipments, airlinesList = []) {
  if (!selectedShipments || selectedShipments.length === 0) return null;
  const first = selectedShipments[0];
  if (first.airline) return first.airline;
  if (first.airlineId) {
    const byId = airlinesList.find((a) => a.id === first.airlineId);
    if (byId) return byId;
  }
  const awb = first.airwaybillNumber || first.awbDisplay || "";
  const digits = String(awb).replace(/\D/g, "");
  if (digits.length >= 3) {
    const prefix = digits.substring(0, 3);
    const matched = airlinesList.find((a) => a.awbPrefix === prefix);
    if (matched) return matched;
    if (KNOWN_AWB_PREFIXES[prefix]) {
      return { name: KNOWN_AWB_PREFIXES[prefix], awbPrefix: prefix };
    }
  }
  return null;
}

export function detectWarehouseFromShipments(selectedShipments) {
  if (!selectedShipments || selectedShipments.length === 0) return null;
  const first = selectedShipments[0];
  if (first.warehouse) return first.warehouse;
  if (first.warehouseId)
    return { id: first.warehouseId, name: first.warehouse?.name };
  return null;
}