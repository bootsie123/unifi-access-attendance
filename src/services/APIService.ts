import express from "express";
import moment from "moment";

import AutomationService, { AttendanceOptions } from "./AutomationService";
import logger from "../lib/Logger";
import environment from "../environment";

/**
 * Handles the HTTP REST API server
 */
export default class APIService {
  private static apiLogger = logger.child({ label: "API" });

  private static app = express();

  /**
   * Starts the HTTP server
   */
  public static start() {
    APIService.app.use(express.urlencoded({ extended: true }));

    APIService.app.get("/health", (req, res) => {
      return res.json({
        status: "ok"
      });
    });

    APIService.app.post("/attendance/start", async (req, res) => {
      const body = req.body;

      const options: AttendanceOptions = {
        dismissalLocationRegex: body.dismissalLocationRegex,
        attendanceStart: moment(body.attendanceStart, environment.timeFormat),
        attendanceEnd: moment(body.attendanceEnd, environment.timeFormat),
        unifiThreshold: body.unifiThreshold,
        schoolDismissal: moment(body.schoolDismissal, environment.timeFormat),
        updateInterval: body.updateInterval,
        replaceExistingJobs: true
      };

      this.apiLogger.debug(`Request Body: ${JSON.stringify(body)}`);
      this.apiLogger.debug(
        `Parsed Attendance Options: ${JSON.stringify(options)}`
      );

      AutomationService.runAttendance(options);

      return res.json({
        status: "Job started"
      });
    });

    APIService.app.listen(environment.apiPort, () => {
      this.apiLogger.info(`Listening on port ${environment.apiPort}`);
    });
  }
}
