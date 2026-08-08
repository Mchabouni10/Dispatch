-- CreateEnum
CREATE TYPE "EquipmentHandoffAction" AS ENUM ('CHECKOUT', 'SWAP', 'RETURN', 'REPLACE');

-- CreateEnum
CREATE TYPE "EquipmentHandoffReason" AS ENUM ('SHIFT_START', 'SHIFT_END', 'MECHANICAL', 'MAINTENANCE', 'ROUTE_CHANGE', 'DRIVER_REQUEST', 'DISPATCH', 'EMERGENCY', 'TRAILER_SWAP', 'RELOCATION', 'BREAKDOWN');

-- CreateTable
CREATE TABLE "Airline" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "awbPrefix" TEXT NOT NULL,
    "logoUrl" VARCHAR(255),
    "terminalAddress" TEXT,
    "contactPhone" VARCHAR(20),
    "openTime" VARCHAR(5),
    "closeTime" VARCHAR(5),
    "open24h" BOOLEAN NOT NULL DEFAULT false,
    "defaultCutoffHours" INTEGER NOT NULL DEFAULT 4,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Airline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "photo" VARCHAR(255),
    "address" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" VARCHAR(10),
    "status" TEXT NOT NULL DEFAULT 'Available',
    "statusReason" TEXT,
    "leaveStart" TIMESTAMP(3),
    "leaveEnd" TIMESTAMP(3),
    "schedule" VARCHAR(100) NOT NULL,
    "shiftStart" VARCHAR(5),
    "shiftEnd" VARCHAR(5),
    "daysOff" TEXT[],
    "availableOnDaysOff" BOOLEAN NOT NULL DEFAULT false,
    "overtimePreference" BOOLEAN NOT NULL DEFAULT false,
    "maxWeeklyHours" INTEGER NOT NULL DEFAULT 60,
    "licenseNumber" TEXT,
    "licenseClass" VARCHAR(1) NOT NULL DEFAULT 'A',
    "licenseExpiration" TIMESTAMP(3),
    "licensePhoto" VARCHAR(255),
    "medicalCertExpiration" TIMESTAMP(3),
    "endorsements" TEXT[],
    "vehicleTypes" TEXT[],
    "trailerEligible" BOOLEAN NOT NULL DEFAULT true,
    "hazmatCertified" BOOLEAN NOT NULL DEFAULT false,
    "gdpTrained" BOOLEAN NOT NULL DEFAULT false,
    "currentLocation" TEXT,
    "currentLatitude" DOUBLE PRECISION,
    "currentLongitude" DOUBLE PRECISION,
    "lastCheckin" TIMESTAMP(3),
    "hoursDrivenToday" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "onDutyHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastBreakTime" TIMESTAMP(3),
    "breakUntil" TIMESTAMP(3),
    "shiftStartTime" TIMESTAMP(3),
    "shiftEndTime" TIMESTAMP(3),
    "preferredRunTypes" TEXT[],
    "homeBase" TEXT,
    "maxRadius" INTEGER,
    "overnightAllowed" BOOLEAN NOT NULL DEFAULT true,
    "crossBorder" BOOLEAN NOT NULL DEFAULT false,
    "performanceRating" DOUBLE PRECISION DEFAULT 3.0,
    "totalTripsCompleted" INTEGER NOT NULL DEFAULT 0,
    "onTimeDeliveryRate" DOUBLE PRECISION DEFAULT 100.0,
    "safetyScore" DOUBLE PRECISION DEFAULT 100.0,
    "incidents" INTEGER NOT NULL DEFAULT 0,
    "hireDate" TIMESTAMP(3),
    "employmentStatus" TEXT NOT NULL DEFAULT 'Active',
    "payType" TEXT NOT NULL DEFAULT 'Hourly',
    "payRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeRate" DOUBLE PRECISION,
    "bonusEligible" BOOLEAN NOT NULL DEFAULT false,
    "lastPayRaise" TIMESTAMP(3),
    "emergencyContactName" TEXT,
    "emergencyContactPhone" VARCHAR(20),
    "emergencyContactRelation" TEXT,
    "notes" TEXT,
    "specialSkills" TEXT,
    "medicalConditions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "equipmentType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'In Service',
    "licensePlate" TEXT,
    "vin" TEXT,
    "year" INTEGER,
    "modelDetails" TEXT,
    "capacityLbs" INTEGER,
    "palletPositions" INTEGER,
    "registrationExpiration" TIMESTAMP(3),
    "nextMaintenanceDue" TIMESTAMP(3),
    "outOfServiceReason" TEXT,
    "notes" TEXT,
    "insuranceProvider" TEXT,
    "insurancePolicyNumber" TEXT,
    "insuranceExpiration" TIMESTAMP(3),
    "iftaIrpExpiration" TIMESTAMP(3),
    "ownershipType" TEXT NOT NULL DEFAULT 'Owned',
    "leaseCompany" TEXT,
    "leaseEndDate" TIMESTAMP(3),
    "monthlyPaymentAmount" DOUBLE PRECISION,
    "assignedDriverId" TEXT,
    "availableAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentHandoff" (
    "id" TEXT NOT NULL,
    "action" "EquipmentHandoffAction" NOT NULL,
    "reason" "EquipmentHandoffReason",
    "reasonNote" TEXT,
    "driverId" TEXT NOT NULL,
    "dispatcherId" TEXT,
    "equipmentId" TEXT NOT NULL,
    "replacedEquipmentId" TEXT,
    "trailerId" TEXT,
    "previousTrailerId" TEXT,
    "tripId" TEXT,
    "checkOutTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnTime" TIMESTAMP(3),
    "shiftStartTime" TIMESTAMP(3),
    "shiftEndTime" TIMESTAMP(3),
    "checkOutLocation" TEXT,
    "returnLocation" TEXT,
    "odometerStart" INTEGER,
    "fuelLevelStart" TEXT,
    "odometerEnd" INTEGER,
    "fuelLevelEnd" TEXT,
    "preTripCompleted" BOOLEAN NOT NULL DEFAULT false,
    "preTripNotes" TEXT,
    "postTripCompleted" BOOLEAN NOT NULL DEFAULT false,
    "postTripNotes" TEXT,
    "damageReported" BOOLEAN NOT NULL DEFAULT false,
    "damageDescription" TEXT,
    "damagePhoto" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "returnedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "pieces" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "weightUnit" TEXT NOT NULL DEFAULT 'lb',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "airwaybillNumber" TEXT,
    "pmcCount" INTEGER NOT NULL DEFAULT 0,
    "ordNumber" TEXT,
    "lastFreeDay" TIMESTAMP(3),
    "storageFeePerDay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storageFeeDaysOver" INTEGER NOT NULL DEFAULT 0,
    "storageFeePaid" BOOLEAN NOT NULL DEFAULT false,
    "terminalFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "terminalFeePaid" BOOLEAN NOT NULL DEFAULT false,
    "isGDP" BOOLEAN NOT NULL DEFAULT false,
    "gdpTemperatureRange" TEXT,
    "flightDate" TIMESTAMP(3),
    "lockoutTime" TIMESTAMP(3),
    "trailerNumber" TEXT,
    "doorNumber" TEXT,
    "truckType" TEXT,
    "pickupReadyAt" TIMESTAMP(3),
    "deliveryAppointmentAt" TIMESTAMP(3),
    "airlineId" TEXT,
    "warehouseId" TEXT,
    "parentShipmentId" TEXT,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "truckType" TEXT,
    "trailerNumber" TEXT,
    "doorNumber" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentGroupShipment" (
    "shipmentId" TEXT NOT NULL,
    "shipmentGroupId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentGroupShipment_pkey" PRIMARY KEY ("shipmentId","shipmentGroupId")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "tripNumber" TEXT NOT NULL,
    "runType" TEXT NOT NULL,
    "plannedDepartureTime" TIMESTAMP(3),
    "expectedCompletionTime" TIMESTAMP(3),
    "startTime" TIMESTAMP(3),
    "finishTime" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Scheduled',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "driverId" TEXT,
    "truckId" TEXT,
    "trailerId" TEXT,
    "shipmentIds" TEXT[],
    "parentTripId" TEXT,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripShipmentSplit" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "pieces" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripShipmentSplit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripHandoff" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "finishTime" TIMESTAMP(3) NOT NULL,
    "podImageUrl" TEXT,
    "signatureImageUrl" TEXT,
    "receivedByName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentException" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "piecesAffected" INTEGER,
    "reason" TEXT,
    "photoUrl" TEXT,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "contactPhone" VARCHAR(20),
    "is24Hours" BOOLEAN NOT NULL DEFAULT false,
    "daysOpen" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "openTime" VARCHAR(5),
    "closeTime" VARCHAR(5),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripSequence" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastUsed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TripSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ShipmentTrips" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Airline_code_key" ON "Airline"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Airline_awbPrefix_key" ON "Airline"("awbPrefix");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_employeeId_key" ON "Driver"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_unitNumber_key" ON "Equipment"("unitNumber");

-- CreateIndex
CREATE INDEX "EquipmentHandoff_driverId_idx" ON "EquipmentHandoff"("driverId");

-- CreateIndex
CREATE INDEX "EquipmentHandoff_equipmentId_idx" ON "EquipmentHandoff"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentHandoff_trailerId_idx" ON "EquipmentHandoff"("trailerId");

-- CreateIndex
CREATE INDEX "EquipmentHandoff_checkOutTime_idx" ON "EquipmentHandoff"("checkOutTime");

-- CreateIndex
CREATE INDEX "EquipmentHandoff_isActive_idx" ON "EquipmentHandoff"("isActive");

-- CreateIndex
CREATE INDEX "EquipmentHandoff_action_idx" ON "EquipmentHandoff"("action");

-- CreateIndex
CREATE INDEX "EquipmentHandoff_tripId_idx" ON "EquipmentHandoff"("tripId");

-- CreateIndex
CREATE INDEX "Shipment_parentShipmentId_idx" ON "Shipment"("parentShipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_tripNumber_key" ON "Trip"("tripNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TripShipmentSplit_tripId_shipmentId_key" ON "TripShipmentSplit"("tripId", "shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "TripHandoff_tripId_key" ON "TripHandoff"("tripId");

-- CreateIndex
CREATE INDEX "ShipmentException_tripId_idx" ON "ShipmentException"("tripId");

-- CreateIndex
CREATE INDEX "ShipmentException_shipmentId_idx" ON "ShipmentException"("shipmentId");

-- CreateIndex
CREATE INDEX "ShipmentException_type_idx" ON "ShipmentException"("type");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "_ShipmentTrips_AB_unique" ON "_ShipmentTrips"("A", "B");

-- CreateIndex
CREATE INDEX "_ShipmentTrips_B_index" ON "_ShipmentTrips"("B");

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentHandoff" ADD CONSTRAINT "EquipmentHandoff_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentHandoff" ADD CONSTRAINT "EquipmentHandoff_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentHandoff" ADD CONSTRAINT "EquipmentHandoff_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentHandoff" ADD CONSTRAINT "EquipmentHandoff_replacedEquipmentId_fkey" FOREIGN KEY ("replacedEquipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentHandoff" ADD CONSTRAINT "EquipmentHandoff_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentHandoff" ADD CONSTRAINT "EquipmentHandoff_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_airlineId_fkey" FOREIGN KEY ("airlineId") REFERENCES "Airline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_parentShipmentId_fkey" FOREIGN KEY ("parentShipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentGroupShipment" ADD CONSTRAINT "ShipmentGroupShipment_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentGroupShipment" ADD CONSTRAINT "ShipmentGroupShipment_shipmentGroupId_fkey" FOREIGN KEY ("shipmentGroupId") REFERENCES "ShipmentGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_parentTripId_fkey" FOREIGN KEY ("parentTripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripShipmentSplit" ADD CONSTRAINT "TripShipmentSplit_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripShipmentSplit" ADD CONSTRAINT "TripShipmentSplit_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripHandoff" ADD CONSTRAINT "TripHandoff_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentException" ADD CONSTRAINT "ShipmentException_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentException" ADD CONSTRAINT "ShipmentException_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ShipmentTrips" ADD CONSTRAINT "_ShipmentTrips_A_fkey" FOREIGN KEY ("A") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ShipmentTrips" ADD CONSTRAINT "_ShipmentTrips_B_fkey" FOREIGN KEY ("B") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

