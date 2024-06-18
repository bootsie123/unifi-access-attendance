import "dotenv/config";
import moment from "moment";

const timeFormat = ["h:m a Z", "H:m Z", "h a Z", "H Z"];

export default {
  production: process.env.NODE_ENV === "production",
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
  attendanceStart: moment(process.env.ATTENDANCE_START, timeFormat).utc(),
  attendanceEnd: moment(process.env.ATTENDANCE_END, timeFormat).utc(),
  dryRun: (() => {
    if (process.env.DRY_RUN === "true") return true;

    if (process.env.DRY_RUN === "false") return false;

    return process.env.NODE_ENV !== "production";
  })()
};
