const express = require("express");
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ---- CONFIG ----
const MARKETCALL_NUMBER = "+18448331170"; // Affiliate number (1st try - din ke time)
const LEADSMART_NUMBER  = "+14049945211"; // Backup number (retry + raat ke time)
const RETRY_WINDOW_MIN  = 60;             // Kitne minute tak "retry" gina jaye
const MIN_VALID_DURATION_SEC = 30;        // Isse kam duration = fail samjha jaye

// Business timezone - 404 area code = Atlanta, Georgia (Eastern Time)
const BUSINESS_TIMEZONE = "America/New_York";
const NIGHT_START_HOUR = 20; // 8:00 PM
const NIGHT_END_HOUR   = 6;  // 6:00 AM

const callerHistory = new Map();

function isRecentRetry(from) {
  const record = callerHistory.get(from);
  if (!record) return false;
  const diffMin = (Date.now() - record.failedAt) / 60000;
  return diffMin <= RETRY_WINDOW_MIN;
}

function isNightTime() {
  const hour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone: BUSINESS_TIMEZONE,
    }).format(new Date()),
    10
  );
  // Raat 8 PM (20) se subah 6 AM (6) tak
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
}

app.post("/voice", (req, res) => {
  const from = req.body.From;

  let targetNumber;
  let reason;

  if (isNightTime()) {
    // Raat ke time - seedha LeadSmart, chahe pehli call ho ya retry
    targetNumber = LEADSMART_NUMBER;
    reason = "NIGHT TIME (8PM-6AM) -> LeadSmart";
  } else if (isRecentRetry(from)) {
    // Din ka time, lekin pehli attempt fail ho chuki thi
    targetNumber = LEADSMART_NUMBER;
    reason = "RETRY after failed attempt -> LeadSmart";
  } else {
    // Normal din ka time, pehli attempt
    targetNumber = MARKETCALL_NUMBER;
    reason = "1st attempt (day time) -> MarketCall";
  }

  console.log(`Incoming call from ${from} -> ${targetNumber} (${reason})`);

  const cxml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${from}" timeout="20" action="/dial-status?from=${encodeURIComponent(from)}" method="POST">
    <Number>${targetNumber}</Number>
  </Dial>
</Response>`;

  res.type("text/xml").send(cxml);
});

app.post("/dial-status", (req, res) => {
  const from = req.query.from;
  const dialStatus = req.body.DialCallStatus;
  const duration = parseInt(req.body.DialCallDuration || "0", 10);

  // Fail conditions:
  // 1) Call status "completed" nahi (no-answer/busy/failed)
  // 2) Ya "completed" hai lekin duration 30 sec se kam (IVR decline jaisa case)
  const isFailed = (dialStatus !== "completed") || (duration < MIN_VALID_DURATION_SEC);

  console.log(`Dial result for ${from}: status=${dialStatus}, duration=${duration}s, treatedAsFailed=${isFailed}`);

  if (isFailed) {
    callerHistory.set(from, { failedAt: Date.now() });
  } else {
    callerHistory.delete(from);
  }

  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
