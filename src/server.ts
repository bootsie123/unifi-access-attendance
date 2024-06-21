import environment from "./environment";
import logger from "./lib/Logger";
import AutomationService from "./services/AutomationService";

process
  .on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled rejection:", reason, promise);
  })
  .on("uncaughtException", err => {
    logger.error("Uncaught exception:", err);
  });

AutomationService.scheduleJob(
  "Automated Attendance",
  environment.schedule,
  AutomationService.runAttendance
);
