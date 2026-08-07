export const KNOWN_AWB_PREFIXES = {
  "020": "Lufthansa Cargo",
  "057": "Air France",
  "014": "Air Canada Cargo",
  "016": "United Cargo",
  "006": "Delta Cargo",
  125: "British Airways",
  "074": "KLM Cargo",
  160: "Cathay Pacific",
  176: "Emirates SkyCargo",
  "081": "Qantas Freight",
  618: "Singapore Airlines",
  999: "IAG Cargo",
  205: "ANA Cargo",
  131: "Japan Airlines",
};

export const EMPTY_FORM = {
  runType: "",
  driver: "",
  truck: "",
  trailer: "",
  shipments: [],
  plannedDepartureTime: "",
  expectedCompletionTime: "",
  notes: "",
  doorNumber: "",
};

export const DOOR_OPTIONS = Array.from({ length: 30 }, (_, i) => String(i + 1));