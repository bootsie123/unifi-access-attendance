import { Range } from "node-schedule";
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

const job = AutomationService.scheduleJob(
  "Automated Attendance",
  {
    dayOfWeek: new Range(1, 5),
    hour: environment.attendanceEnd.local().hour(),
    minute: environment.attendanceEnd.local().minute() + 1
  },
  AutomationService.runAttendance,
  environment.runImmediately
);

if (job) {
  logger.info(
    `Automated Attendance initially scheduled for ${job.nextInvocation()}`
  );
} else {
  logger.error("Error! Unable to schedule Automated Attendance!");
}
