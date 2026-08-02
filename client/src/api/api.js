//src/api/api.js
const isLocal = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

// In local dev, Vite's proxy forwards /api to the backend, so a relative path works.
// In production, the frontend (Vercel) and backend (Render) are different origins,
// so we need the full backend URL here or every request 404s against Vercel itself.
const BASE = isLocal ? '/api' : `${import.meta.env.VITE_API_URL}/api`;
const AUTH_TOKEN_KEY = 'dispatch_auth_token';

export const getAuthToken = () => localStorage.getItem(AUTH_TOKEN_KEY);
export const saveAuthToken = (token) => localStorage.setItem(AUTH_TOKEN_KEY, token);
export const clearAuthToken = () => localStorage.removeItem(AUTH_TOKEN_KEY);
const authHeaders = () => {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Uploaded files (driver photos, airline logos, etc.) are served directly by the
// API server outside the /api prefix. JSON calls to /api work through your dev
// server's proxy, but that proxy usually isn't set up to forward /uploads too —
// so plain <img src="/uploads/..."> requests hit the frontend's own origin and 404.
// This resolves such paths to the API's real origin. In production, where the
// frontend and API are served from the same origin, it's a no-op.
export const API_ORIGIN = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
  ? `${window.location.protocol}//${window.location.hostname}:5001`
  : '';

// ✅ FIXED: resolveUploadUrl - properly handles logo URLs
export const resolveUploadUrl = (filePath) => {
  if (!filePath) return '';
  
  // If it's already an absolute URL (http or https), return as is
  if (/^https?:\/\//i.test(filePath)) return filePath;
  
  // If it starts with /uploads, prepend the API origin
  if (filePath.startsWith('/uploads')) {
    return `${API_ORIGIN}${filePath}`;
  }
  
  // If it's just a filename, assume it's in /uploads
  if (!filePath.startsWith('/')) {
    return `${API_ORIGIN}/uploads/${filePath}`;
  }
  
  // Fallback: prepend API origin
  return `${API_ORIGIN}${filePath}`;
};

async function request(path, options = {}) {
  const token = getAuthToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;
  if (res.status === 401) {
    clearAuthToken();
    window.dispatchEvent(new Event('dispatch:auth-expired'));
  }
  if (!res.ok) throw new Error(data?.message || 'Request failed');
  return data;
}

export const register = (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) });
export const login = (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) });
export const getCurrentUser = () => request('/auth/me');

// ── DRIVERS ──────────────────────────────────────────────────────────────────
export const getDrivers = () => request('/drivers');
export const getDriver = (id) => request(`/drivers/${id}`);
export const createDriver = (body) => request('/drivers', { method: 'POST', body: JSON.stringify(body) });
export const updateDriver = (id, body) => request(`/drivers/${id}`, { method: 'PUT', body: JSON.stringify(body) });
// Accepts either a plain status string ('Available') or a full payload object
// ({ status, statusReason, lastCheckin, shiftStartTime, breakUntil, ... }).
// Previously this always wrapped its argument in { status: ... }, so passing an
// object (as DriversView already did) double-nested it and the server silently
// ignored everything but the outer wrapper. Fixed here.
export const updateDriverStatus = (id, body) => {
  const payload = typeof body === 'string' ? { status: body } : body;
  return request(`/drivers/${id}/status`, { method: 'PATCH', body: JSON.stringify(payload) });
};
export const deleteDriver = (id) => request(`/drivers/${id}`, { method: 'DELETE' });

export const uploadDriverPhoto = async (id, file) => {
  const formData = new FormData();
  formData.append('photo', file);
  const res = await fetch(`${BASE}/drivers/${id}/photo`, { method: 'POST', body: formData, headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Photo upload failed');
  return data;
};

/** Upload a scanned driver license image (JPEG / PNG / WEBP, max 5 MB) */
export const uploadDriverLicensePhoto = async (id, file) => {
  if (!id) throw new Error('Driver ID is required to upload a license scan');
  if (!file) throw new Error('No file provided');

  const formData = new FormData();
  formData.append('licensePhoto', file);

  const res = await fetch(`${BASE}/drivers/${id}/license-photo`, {
    method: 'POST',
    body: formData,
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'License scan upload failed');
  return data;
};

// ── DRIVER HISTORY ──────────────────────────────────────────────────────────
/** Get complete equipment history for a driver */
export const getDriverHistory = (id, params = {}) => {
  const query = new URLSearchParams(params).toString();
  return request(`/drivers/${id}/history${query ? `?${query}` : ''}`);
};

/** Get active handoffs for a driver */
export const getActiveHandoffs = (driverId) => {
  return request(`/drivers/${driverId}/history?limit=10&includeActive=true`);
};

// ── EQUIPMENT ─────────────────────────────────────────────────────────────────
export const getEquipment = (type) => request(`/equipment${type ? `?type=${type}` : ''}`);
export const createEquipment = (body) => request('/equipment', { method: 'POST', body: JSON.stringify(body) });
export const updateEquipment = (id, body) => request(`/equipment/${id}`, { method: 'PUT', body: JSON.stringify(body) });
// Handoff Board: assign a unit to a driver ({ driverId }) or release it
// ({ release: true, cooldownMinutes }). Kept as its own endpoint since the
// general PUT above strips null values and can't clear assignedDriverId.
export const assignEquipment = (id, body) => request(`/equipment/${id}/assign`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteEquipment = (id) => request(`/equipment/${id}`, { method: 'DELETE' });

// ── EQUIPMENT HISTORY ───────────────────────────────────────────────────────
/** Get complete history for a specific equipment unit */
export const getEquipmentHistory = (equipmentId, params = {}) => {
  const query = new URLSearchParams(params).toString();
  return request(`/equipment/history/equipment/${equipmentId}${query ? `?${query}` : ''}`);
};

/** Get equipment history for a specific driver */
export const getEquipmentHistoryByDriver = (driverId, params = {}) => {
  const query = new URLSearchParams(params).toString();
  return request(`/equipment/history/driver/${driverId}${query ? `?${query}` : ''}`);
};

/** Swap equipment mid-shift */
export const swapEquipment = (equipmentId, data) => {
  return request(`/equipment/${equipmentId}/swap`, { 
    method: 'POST', 
    body: JSON.stringify(data) 
  });
};

// ── AIRLINES ──────────────────────────────────────────────────────────────────
export const getAirlines = () => request('/airlines');
export const createAirline = (body) => request('/airlines', { method: 'POST', body: JSON.stringify(body) });
export const updateAirline = (id, body) => request(`/airlines/${id}`, { method: 'PUT', body: JSON.stringify(body) });
export const deleteAirline = (id) => request(`/airlines/${id}`, { method: 'DELETE' });

// ✅ FIXED: uploadAirlineLogo - better error handling
export const uploadAirlineLogo = async (id, file) => {
  if (!id) {
    throw new Error('Airline ID is required to upload a logo');
  }
  if (!file) {
    throw new Error('No file provided to upload');
  }
  
  const formData = new FormData();
  formData.append('logo', file);
  
  try {
    const res = await fetch(`${BASE}/airlines/${id}/logo`, { 
      method: 'POST', 
      body: formData,
      headers: authHeaders(),
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Logo upload failed');
    return data;
  } catch (err) {
    console.error('Logo upload error:', err);
    throw err;
  }
};

// ── WAREHOUSES ────────────────────────────────────────────────────────────────
export const getWarehouses = () => request('/warehouses');
export const createWarehouse = (body) => request('/warehouses', { method: 'POST', body: JSON.stringify(body) });
export const updateWarehouse = (id, body) => request(`/warehouses/${id}`, { method: 'PUT', body: JSON.stringify(body) });
export const deleteWarehouse = (id) => request(`/warehouses/${id}`, { method: 'DELETE' });

// ── SHIPMENTS ─────────────────────────────────────────────────────────────────
export const getShipments = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/shipments${qs ? `?${qs}` : ''}`);
};
export const createShipment = (body) => request('/shipments', { method: 'POST', body: JSON.stringify(body) });
export const updateShipment = (id, body) => request(`/shipments/${id}`, { method: 'PUT', body: JSON.stringify(body) });
export const deleteShipment = (id) => request(`/shipments/${id}`, { method: 'DELETE' });

// ── DISPATCH ──────────────────────────────────────────────────────────────────
export const getTrips = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/dispatch${qs ? `?${qs}` : ''}`);
};
export const getTrip = (id) => request(`/dispatch/${id}`);
export const createTrip = (body) => request('/dispatch', { method: 'POST', body: JSON.stringify(body) });
export const updateTrip = (id, body) => request(`/dispatch/${id}`, { method: 'PUT', body: JSON.stringify(body) });
export const startTrip = (id, body = {}) => request(`/dispatch/${id}/start`, { method: 'PATCH', body: JSON.stringify(body) });
export const finishTrip = (id, body = {}) => request(`/dispatch/${id}/finish`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteTrip = (id) => request(`/dispatch/${id}`, { method: 'DELETE' });
// One truck/driver can't take the whole manifest — creates a new linked Trip
// (parentTripId = id) with a backup driver/truck/trailer, moving or splitting
// the selected AWBs over. Returns { parentTrip, backupTrip }, both populated.
export const createTripBackup = (id, body) => request(`/dispatch/${id}/backups`, { method: 'POST', body: JSON.stringify(body) });
