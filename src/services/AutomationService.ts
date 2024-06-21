import schedule, { JobCallback } from "node-schedule";

import logger from "../lib/Logger";
import { StudentAttendanceType } from "../lib/SchoolPassAPI";
import environment from "../environment";
import SchoolPassService from "./SchoolPassService";
import UnifiAccessService from "./UnifiAccessService";

process.on("SIGINT", () => {
  schedule.gracefulShutdown().then(() => process.exit(0));
});

/**
 * Allows for jobs to be scheduled and ran
 */
export default class AutomationService {
  private static scheduleLogger = logger.child({ label: "Scheduler" });

  /**
   * Schedules the specified job
   * @param name The name of the job
   * @param cron The cron schedule to use
   * @param jobFunc The function to invoke
   */
  static scheduleJob(name: string, cron: string, jobFunc: JobCallback): void {
    const job = schedule.scheduleJob(name, cron, jobFunc);

    job
      .on("scheduled", (next: Date) => {
        this.scheduleLogger.info(`Next job scheduled for ${next}`);
      })
      .on("success", () => {
        this.scheduleLogger.info("Job completed successfully!");
      })
      .on("error", err => {
        this.scheduleLogger.error("Error running job:", err);
      });

    if (!environment.production) {
      this.scheduleLogger.info(
        "Running in development environment. Invoking job immediately..."
      );

      job
        .invoke()
        // @ts-expect-error ts(2339)
        .then(() => {
          this.scheduleLogger.info("Job completed successfully!");
        })
        .catch((err: any) => {
          this.scheduleLogger.error(
            "Error running job on first invocation:",
            err
          );
        });
    }
  }

  /**
   * The automated attendance job
   */
  static async runAttendance(): Promise<void> {
    const schoolpass = new SchoolPassService();
    const unifiAccess = new UnifiAccessService();

    await schoolpass.init();

    logger.info(`Fetching students from SchoolPass...`);

    const students = await schoolpass.getStudents();

    const studentMap = new Map(
      students.map(x => [x.fullName.toLowerCase(), x])
    );

    logger.info(
      `Found ${studentMap.size} students from SchoolPass with dismissal locations matching "${environment.schoolPass.dismissalLocationRegex}"`
    );

    const start = environment.attendanceStart;
    const end = environment.attendanceEnd;

    logger.info(
      `Querying Unifi Access door logs between ${start.toDate().toTimeString()} and ${end.toDate().toTimeString()}...`
    );

    const logs = await unifiAccess.getDoorLogs(start, end);
    const actors = new Set(
      logs.map(log => log._source.actor.display_name.toLowerCase())
    );

    logger.info(
      `Found ${logs.length} door access events from ${actors.size} unique actors`
    );

    logger.info("Processing attendance...");

    const totalStudents = studentMap.size;

    const toTitleCase = (str: string) => {
      const parts = str.toLowerCase().split(" ");

      return parts.map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(" ");
    };

    for (const name of actors) {
      if (studentMap.has(name)) {
        logger.debug(`Marking ${toTitleCase(name)} as present!`);

        studentMap.delete(name);
      }
    }

    const absent = studentMap.size;
    const present = totalStudents - absent;

    logger.info(
      `Attendance Report:\n\tPresent: ${present}\n\tAbsent: ${absent}`
    );

    if (present < environment.unifi.threshold) {
      logger.warn(
        `Attendance threshold of ${environment.unifi.threshold} not met! No further action will be taken`
      );
    } else {
      logger.info(
        `Attendance threshold of ${environment.unifi.threshold} met! Marking students as absent...`
      );

      await schoolpass.markStudents(
        StudentAttendanceType.Absent,
        studentMap.values()
      );

      logger.info(`${studentMap.size} students marked as absent!`);
    }
  }
}
