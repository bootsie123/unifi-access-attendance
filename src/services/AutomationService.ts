import schedule, { JobCallback } from "node-schedule";
import moment from "moment";

import logger from "../lib/Logger";
import { StudentAttendanceType } from "../lib/SchoolPassAPI";
import environment from "../environment";
import SchoolPassService, { Student } from "./SchoolPassService";
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
   * Converts a string to Title Case
   * @param str The string to convert
   * @returns The string in title case format
   */
  private static toTitleCase(str: string) {
    const parts = str.toLowerCase().split(" ");

    return parts.map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(" ");
  }

  /**
   * Schedules the specified job
   * @param name The name of the job
   * @param spec The schedule to use
   * @param jobFunc The function to invoke
   * @returns The scheduled job
   */
  static scheduleJob(
    name: string,
    spec: schedule.Spec,
    jobFunc: JobCallback,
    runImmediately: boolean = !environment.production
  ): schedule.Job {
    const job = schedule.scheduleJob(name, spec, jobFunc);

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

    if (runImmediately) {
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

    return job;
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

    for (const name of actors) {
      if (studentMap.has(name)) {
        logger.debug(
          `Marking ${AutomationService.toTitleCase(name)} as present!`
        );

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

      AutomationService.scheduleJob(
        "Late Arrivals Handler",
        {
          end: environment.schoolDismissal.toDate(),
          rule: `*/${environment.updateInterval} * * * *`
        },
        AutomationService.handleLateArrivals.bind(this, studentMap),
        false
      );
    }
  }

  /**
   * Finds late arrivals and updates their attendance in SchoolPass
   * @param absentStudents A map of students currentl marked absent
   */
  private static async handleLateArrivals(
    absentStudents: Map<string, Student>
  ): Promise<void> {
    const schoolpass = new SchoolPassService();
    const unifiAccess = new UnifiAccessService();

    await schoolpass.init();

    logger.info(
      `Recieved ${absentStudents.size} students still marked as absent`
    );

    const start = environment.attendanceEnd;
    const end = moment();

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

    logger.info("Processing late arrivals...");

    const present: Student[] = [];

    for (const name of actors) {
      const student = absentStudents.get(name);

      if (student) {
        logger.debug(
          `Marking ${AutomationService.toTitleCase(name)} as late arrival!`
        );

        present.push(student);
        absentStudents.delete(name);
      }
    }
    
    logger.info(
      `Updated Attendance Report:\n\tNew Late Arrivals: ${present.length}`
    );

    await schoolpass.markStudents(StudentAttendanceType.Present, present);

    logger.info(`${present.length} students now marked as late arrival!`);

    if (absentStudents.size < 1) {
      logger.info(
        "All students now marked present! Canceling future late arrival checks..."
      );

      schedule.scheduledJobs["Late Arrivals Handler"].cancel();
    }
  }
}
