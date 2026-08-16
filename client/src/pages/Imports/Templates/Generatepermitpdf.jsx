const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const fs = require("fs");

/**
 * Generates the CEVA / CBP "Application and Permit to Transfer
 * Containerized Cargo" PDF, pre-filled with a shipment's data.
 *
 * @param {Object} data
 * @param {string} data.ordNumber
 * @param {string} data.fromPierName
 * @param {string} data.fromPierAddress   // multi-line, \n separated
 * @param {string} data.toPierName
 * @param {string} data.toPierAddress     // multi-line, \n separated
 * @param {string} data.containerNumber
 * @param {string} data.piecesAndTypes    // e.g. "24 PLT   4,092 KG"
 * @param {string} data.airline
 * @param {string} data.flightNumber
 * @param {string} data.eta               // "08/01/2026 10:40"
 * @param {string} data.origin            // "Taipei"
 * @param {string} data.mawb
 * @param {string} data.irsNumber
 * @param {string} data.ourRef
 * @param {string} data.firmsNumber
 * @param {string} data.approvedDate
 * @param {string} [data.logoPath]        // optional PNG/JPG path for the CEVA logo
 * @param {string} [data.controlNo]       // hand-stamped permit/control number
 * @param {string} [data.shortageNote]    // e.g. "Shortage -12"
 * @param {boolean} [data.isGDP]          // temperature-controlled (cold chain)
 * @param {string} [data.gdpTemperatureRange] // e.g. "2-8°C"
 * @param {boolean} [data.isHazmat]       // dangerous goods
 * @param {string} [data.hazmatClass]     // e.g. "Class 9, UN3480"
 * @param {string} [data.deliveryConfirmationNote] // e.g. "Delivered on Aug 6th at 11:46"
 * @param {string} [data.deliveryConfirmedBy]
 * @returns {Promise<Uint8Array>} PDF bytes
 */
function generateOurRef(shipmentSeed) {
  if (!shipmentSeed) return "";
  let hash = 0;
  const seed = String(shipmentSeed);
  for (let i = 0; i < seed.length; i++)
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const part1 = String(hash % 100000000).padStart(8, "0");
  const part2 = String((hash * 7 + 13) % 100000000).padStart(8, "0");
  return `TB${part1} - C${part2}`;
}

async function generatePermitPdf(data) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // US Letter
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  const black = rgb(0, 0, 0);

  // ---- helpers -------------------------------------------------------
  const text = (str, x, yFromTop, opts = {}) => {
    page.drawText(str ?? "", {
      x,
      y: height - yFromTop,
      size: opts.size ?? 9,
      font: opts.bold ? bold : font,
      color: opts.color ?? black,
    });
  };

  const centerText = (str, yFromTop, opts = {}) => {
    const size = opts.size ?? 9;
    const f = opts.bold ? bold : font;
    const w = f.widthOfTextAtSize(str, size);
    text(str, (width - w) / 2, yFromTop, opts);
  };

  const line = (x1, yFromTop, x2, y2FromTop) => {
    page.drawLine({
      start: { x: x1, y: height - yFromTop },
      end: { x: x2, y: height - y2FromTop },
      thickness: 0.75,
      color: black,
    });
  };

  const multiline = (str, x, yFromTop, opts = {}) => {
    const lines = (str ?? "").split("\n");
    const gap = opts.gap ?? 11;
    lines.forEach((l, i) => text(l, x, yFromTop + i * gap, opts));
  };

  // Same yFromTop convention as text()/line() above, so callers never have
  // to think in PDF's bottom-up coordinate space.
  const rectFromTop = (x, yFromTop, w, h, opts = {}) => {
    page.drawRectangle({
      x,
      y: height - yFromTop - h,
      width: w,
      height: h,
      borderColor: opts.borderColor,
      borderWidth: opts.borderWidth ?? 1,
      color: opts.color,
    });
  };

  // ---- logo / header ---------------------------------------------------
  if (data.logoPath && fs.existsSync(data.logoPath)) {
    const ext = data.logoPath.toLowerCase();
    const imgBytes = fs.readFileSync(data.logoPath);
    const img = ext.endsWith(".png")
      ? await pdfDoc.embedPng(imgBytes)
      : await pdfDoc.embedJpg(imgBytes);
    const logoW = 110;
    const logoH = (img.height / img.width) * logoW;
    page.drawImage(img, {
      x: 40,
      y: height - 30 - logoH,
      width: logoW,
      height: logoH,
    });
  } else {
    // Fallback text logo if no image supplied
    text("CEVA", 40, 45, { size: 22, bold: true });
    text("LOGISTICS", 40, 58, { size: 8 });
  }

  // ---- ORD number (top right, mirrors the logo in the top left) ----
  const ordLabel = "ORD No.";
  const ordValue = data.ordNumber || "";
  const ordLabelSize = 7;
  const ordValueSize = 12;
  const ordLabelW = font.widthOfTextAtSize(ordLabel, ordLabelSize);
  const ordValueW = bold.widthOfTextAtSize(ordValue, ordValueSize);
  text(ordLabel, width - 40 - ordLabelW, 30, { size: ordLabelSize });
  text(ordValue, width - 40 - ordValueW, 46, {
    size: ordValueSize,
    bold: true,
  });

  if (data.shortageNote) {
    text(data.shortageNote, 40, 15, {
      size: 11,
      bold: true,
      color: rgb(0.7, 0, 0),
    });
  }
  if (data.controlNo) {
    const cnSize = 13;
    const cnW = bold.widthOfTextAtSize(data.controlNo, cnSize);
    text(data.controlNo, width - 40 - cnW, 15, {
      size: cnSize,
      bold: true,
      color: rgb(0.7, 0, 0),
    });
  }

  centerText("Department of Homeland Security", 38, { bold: true, size: 11 });
  centerText("U.S. Customs and Border Protection", 52, {
    bold: true,
    size: 11,
  });

  centerText("APPLICATION AND PERMIT TO TRANSFER CONTAINERIZED CARGO", 74, {
    bold: true,
    size: 10,
  });
  centerText("FROM PIER/TERMINAL TO A CONTAINER STATION", 87, {
    bold: true,
    size: 10,
  });
  centerText("District Director   CHICAGO, IL", 100, { size: 9 });

  // ---- cold-chain / hazmat stamps -------------------------------------
  const blue = rgb(0.04, 0.43, 0.74);
  const red = rgb(0.77, 0, 0);
  const stampSize = 8.5;

  if (data.isGDP) {
    const label = `COLD CHAIN   ${data.gdpTemperatureRange || "2-8°C"}`;
    const labelW = bold.widthOfTextAtSize(label, stampSize) + 12;
    rectFromTop(40, 108, labelW, 15, {
      borderColor: blue,
      color: rgb(0.92, 0.97, 1),
    });
    text(label, 46, 105, { size: stampSize, bold: true, color: blue });
  }

  if (data.isHazmat) {
    const label = `DANGEROUS GOODS   ${data.hazmatClass || "HAZMAT"}`;
    const labelW = bold.widthOfTextAtSize(label, stampSize) + 12;
    const boxX = width - 40 - labelW;
    rectFromTop(boxX, 108, labelW, 15, {
      borderColor: red,
      color: rgb(1, 0.94, 0.94),
    });
    text(label, boxX + 6, 105, { size: stampSize, bold: true, color: red });
  }

  text(
    "Application is made to transfer the following listed containers and their contents from:",
    40,
    120,
    { size: 9 },
  );

  // ---- From / To pier columns -----------------------------------------
  text("From Pier/Terminal", 40, 140, { bold: true, size: 8 });
  multiline(`${data.fromPierName}\n${data.fromPierAddress}`, 40, 152, {
    size: 9,
  });

  text("To Pier/terminal", 320, 140, { bold: true, size: 8 });
  multiline(`${data.toPierName}\n${data.toPierAddress}`, 320, 152, { size: 9 });

  // ---- Container marks / pieces ----------------------------------------
  text("Container Marks & Numbers:", 40, 225, { size: 8 });
  text("Container #", 40, 237, { size: 9 });
  text(data.containerNumber || "", 130, 237, { size: 9 });

  text("Pieces & Types", 320, 225, { size: 8 });
  text(data.piecesAndTypes || "", 320, 237, { size: 9 });

  // ---- Arrival line -----------------------------------------------------
  text(
    `The above container(s) arrived on the ${data.airline || ""}  FLT#: ${data.flightNumber || ""}  ETA: ${data.eta || ""}`,
    40,
    262,
    { size: 9 },
  );

  text("From:", 60, 290, { size: 9 });
  text(data.origin || "", 95, 290, { size: 9, bold: true });
  text("MAWB:", 320, 290, { size: 9 });
  text(data.mawb || "", 355, 290, { size: 9, bold: true });

  text(
    "are entered as INSTRUMENTS OF INTERNATIONAL TRAFFIC under IIT Bond No.",
    40,
    315,
    { size: 9 },
  );

  text(
    "As abstract of the vessels manifest covering the containers by B/L No., Marks, Numbers, Contents, Consignee, etc, is",
    40,
    335,
    { size: 9 },
  );
  text("attached to each copy of this document.", 40, 347, { size: 9 });

  text("We Concur:", 400, 360, { size: 9 });

  if (data.deliveryConfirmationNote) {
    const note = data.deliveryConfirmedBy
      ? `${data.deliveryConfirmationNote} — ${data.deliveryConfirmedBy}`
      : data.deliveryConfirmationNote;
    text(note, 40, 372, { size: 8.5 });
  }

  // ---- Signature lines ----------------------------------------------
  line(40, 390, 280, 390);
  text("(Signature of Authorized Agent of Container Station)", 55, 402, {
    size: 8,
  });

  line(320, 390, 560, 390);
  centerBetween("(Signature of Agnt. Of Imp. Carrier)", 320, 560, 402);

  function centerBetween(str, x1, x2, yFromTop) {
    const size = 8;
    const w = font.widthOfTextAtSize(str, size);
    text(str, x1 + (x2 - x1 - w) / 2, yFromTop, { size });
  }

  text("IRS No.", 40, 420, { size: 9 });
  text(data.irsNumber || "", 75, 420, { size: 9, bold: true });

  text("Our Ref. #:", 320, 420, { size: 9 });
  text(data.ourRef || generateOurRef(data.mawb || data.ordNumber), 365, 420, {
    size: 9,
    bold: true,
  });

  text("Firms No.", 40, 438, { size: 9 });
  text(data.firmsNumber || "", 80, 438, { size: 9, bold: true });

  // ---- Approved / date -------------------------------------------------
  text("Above request approved:", 40, 470, { size: 9 });
  line(180, 470, 460, 470);
  text(data.approvedDate || "", 480, 470, { size: 9, bold: true });
  centerBetween("(Signature of Customs Officer)", 180, 460, 482);
  text("(Date)", 480, 482, { size: 8 });

  // ---- Transfer record ---------------------------------------------------
  centerText("TRANSFER RECORD", 505, { bold: true, size: 10 });
  text("Delivered to as noted:", 40, 522, { size: 9 });
  text("in apparent good order except", 400, 522, { size: 9 });

  const tableTop = 535;
  const tableLeft = 40;
  const tableRight = 572;
  const colWidths = [80, 88, 78, 100, 90, 96]; // sums to 532
  const rowHeight = 24;
  const headers = [
    "Truck No.",
    "Container No.",
    "Date",
    "Releasing Inspector",
    "Truckman",
    "Receiving Officer",
  ];

  // outer + header row
  let x = tableLeft;
  const colX = [tableLeft];
  colWidths.forEach((w) => {
    x += w;
    colX.push(x);
  });

  const rows = 4; // header + 3 data rows
  // horizontal lines
  for (let r = 0; r <= rows; r++) {
    const y = tableTop + r * rowHeight;
    line(tableLeft, y, tableRight, y);
  }
  // vertical lines
  colX.forEach((cx) => line(cx, tableTop, cx, tableTop + rows * rowHeight));

  headers.forEach((h, i) => {
    text(h, colX[i] + 4, tableTop + 15, { size: 8, bold: true });
  });

  text("(SUBMIT IN DUPLICATE)", 40, tableTop + rows * rowHeight + 18, {
    size: 9,
    bold: true,
  });

  return pdfDoc.save();
}

module.exports = { generatePermitPdf };
