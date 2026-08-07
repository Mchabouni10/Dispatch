import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getTrips,
  getShipments,
  getDrivers,
  getEquipment,
  getAirlines,
  getWarehouses,
} from "../../../api/api.js";
import {
  isDispatchEligible,
  isPowerUnit,
  isTrailer,
} from "../utils/dispatchHelpers.js";

export default function useDispatchResources() {
  const [trips, setTrips] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [airlines, setAirlines] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [t, s, d, e, a, w] = await Promise.all([
        getTrips(),
        getShipments(),
        getDrivers(),
        getEquipment(),
        getAirlines(),
        getWarehouses(),
      ]);
      setTrips(t);
      setShipments(s);
      setDrivers(d);
      setEquipment(e);
      setAirlines(a);
      setWarehouses(w);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Re-render every 30s while any run is En Route
  useEffect(() => {
    if (!trips.some((t) => t.status === "En Route")) return;
    const id = setInterval(() => setTrips((current) => [...current]), 30000);
    return () => clearInterval(id);
  }, [trips]);

  const availableShipments = useMemo(
    () => shipments.filter((s) => s.status === "Pending"),
    [shipments],
  );

  const availableDrivers = useMemo(
    () => drivers.filter(isDispatchEligible),
    [drivers],
  );

  const activeTrips = trips.filter(
    (t) => t.status !== "Completed" && t.status !== "Cancelled",
  );

  const busyEquipmentIds = useMemo(
    () =>
      new Set(
        activeTrips.flatMap((t) =>
          [t.truck?.id, t.trailer?.id].filter(Boolean),
        ),
      ),
    [activeTrips],
  );

  const unitAssignedToDriver = useMemo(() => {
    const map = {};
    equipment.forEach((e) => {
      if (e.assignedDriverId) map[e.assignedDriverId] = e;
    });
    return map;
  }, [equipment]);

  const trucks = useMemo(
    () =>
      equipment.filter(
        (e) =>
          isPowerUnit(e) &&
          e.status === "In Service" &&
          !busyEquipmentIds.has(e.id) &&
          (!e.availableAt || new Date(e.availableAt).getTime() <= Date.now()),
      ),
    [equipment, busyEquipmentIds],
  );

  const trailers = useMemo(
    () =>
      equipment.filter(
        (e) =>
          isTrailer(e) &&
          e.status === "In Service" &&
          !busyEquipmentIds.has(e.id) &&
          (!e.availableAt || new Date(e.availableAt).getTime() <= Date.now()),
      ),
    [equipment, busyEquipmentIds],
  );

  return {
    trips,
    shipments,
    drivers,
    equipment,
    airlines,
    warehouses,
    loading,
    error,
    setError,
    load,
    availableShipments,
    availableDrivers,
    activeTrips,
    busyEquipmentIds,
    unitAssignedToDriver,
    trucks,
    trailers,
  };
}