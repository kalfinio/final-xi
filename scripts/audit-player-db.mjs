// Phase A — content audit: distributions used as an anomaly detector and for
// the Phase A report.  npm run db:audit
import { auditV2 } from '../src/data/v2/validate.js'
console.log(JSON.stringify(auditV2(), null, 2))
