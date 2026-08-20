const express = require("express");
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ---- CONFIG ----
const MARKETCALL_NUMBER = "+18448331170"; // Affiliate number (1st try)
const LEADSMART_NUMBER  = "+14049945211"; // Backup number (retry after fail)
const RETRY_WINDOW_MIN  = 60;             // Kitne minute tak "retry" gina jaye

const callerHistory = new Map();

function isRecentRetry(from) {
  const record = callerHistory.get(from);
  if (!record) return false;
  const diffMin = (Date.now() - record.failedAt) / 60000;
  return diffMin <= RETRY_WINDOW_MIN;
}

app.post("/voice", (req, res) => {
  const from = req.body.From;
  const useLeadSmart = isRecentRetry(from);
  const targetNumber = useLeadSmart ? LEADSMART_NUMBER : MARKETCALL_NUMBER;

  console.log(`Incoming call from ${from} -> routing to ${targetNumber}`);

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

  console.log(`Dial result for ${from}: ${dialStatus}`);

  if (dialStatus !== "completed") {
    callerHistory.set(from, { failedAt: Date.now() });
  } else {
    callerHistory.delete(from);
  }

  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
