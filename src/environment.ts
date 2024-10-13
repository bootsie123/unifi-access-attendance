import "dotenv/config";
import moment from "moment";

const timeFormat = ["h:m a Z", "H:m Z", "h a Z", "H Z", "ha Z", "h:ma Z"];

export default {
  production: process.env.NODE_ENV === "production",
  logLevel: (() => {
    if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL;

    return process.env.NODE_ENV === "production" ? "info" : "debug";
  })(),
  schoolPass: {
    username: process.env.SCHOOLPASS_USERNAME || "",
    password: process.env.SCHOOLPASS_PASSWORD || "",
    dismissalLocationRegex:
      process.env.SCHOOLPASS_DISMISSAL_LOCATION_REGEX || ""
  },
  unifi: {
    server: process.env.UNIFI_ACCESS_SERVER || "",
    accessAPIToken: process.env.UNIFI_ACCESS_API_TOKEN || "",
    threshold: parseInt(process.env.UNIFI_ACCESS_THRESHOLD || "10")
  },
  attendanceStart: moment(
    process.env.ATTENDANCE_START || "6am",
    timeFormat
  ).utc(),
  attendanceEnd: moment(process.env.ATTENDANCE_END || "8am", timeFormat).utc(),
  schoolDismissal: moment(
    process.env.SCHOOL_DISMISSAL_TIME || "3pm",
    timeFormat
  ).utc(),
  updateInterval: parseInt(process.env.UPDATE_INTERVAL || "30"),
  dryRun: (() => {
    if (process.env.DRY_RUN === "true") return true;

    if (process.env.DRY_RUN === "false") return false;

    return process.env.NODE_ENV !== "production";
  })(),
  runImmediately: (() => {
    if (process.env.RUN_IMMEDIATELY === "true") return true;

    if (process.env.RUN_IMMEDIATELY === "false") return false;

    return process.env.NODE_ENV !== "production";
  })()
};
