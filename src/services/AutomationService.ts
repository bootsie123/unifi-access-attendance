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

interface Actor {
  name: string;
  id: string;
}

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
   * Adjusts a Moment.js time to have the current date
   * @param date The Moment object to update
   * @returns The new adjusted Moment object
   */
  private static adjustDate(date: moment.Moment): moment.Moment {
    const current = moment();

    return date
      .local()
      .year(current.year())
      .month(current.month())
      .date(current.date());
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
    runImmediately: boolean = false
  ): schedule.Job | null {
    const existingJob = schedule.scheduledJobs[name];

    if (existingJob?.pendingInvocations.length > 0) {
      this.scheduleLogger.warn(
        `Job "${name}" already exists and has pending invocations. Skipping job...`
      );

      return schedule.scheduledJobs[name];
    } else if (existingJob) {
      existingJob.cancel();
    }

    const job = schedule.scheduleJob(name, spec, jobFunc);

    if (job === null) {
      const specObj = spec as schedule.RecurrenceSpecDateRange;

      const date = new Date();

      if (specObj && specObj.end && new Date(specObj.end) < date) {
        this.scheduleLogger.warn(
          `Job "${name}" is set to run in the past: ${specObj.end} vs ${date} --> Skipping job!`
        );
      } else {
        throw `Unable to create job "${name}"`;
      }

      return null;
    }

    job
      .on("scheduled", (next: Date) => {
        this.scheduleLogger.info(`"${name}", next job scheduled for ${next}`);
      })
      .on("success", () => {
        this.scheduleLogger.info(`Job "${name}" completed successfully!`);
      })
      .on("error", err => {
        this.scheduleLogger.error(`Error running "${name}" job:`, err);
      });

    if (runImmediately) {
      this.scheduleLogger.info(
        "Running in development environment. Invoking job immediately..."
      );

      job
        .invoke()
        // @ts-expect-error ts(2339)
        .then(() => {
          this.scheduleLogger.info(
            `Job "${name}" completed successfully! Next job scheduled for ${job.nextInvocation()}`
          );
        })
        .catch((err: any) => {
          this.scheduleLogger.error(
            `Error running job "${name}" on first invocation:`,
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

    const studentIdMap = new Map(
      students.map(student => [student.externalId, student])
    );

    logger.info(
      `Found ${studentIdMap.size} students from SchoolPass with dismissal locations matching "${environment.schoolPass.dismissalLocationRegex}"`
    );

    const start = AutomationService.adjustDate(environment.attendanceStart);
    const end = AutomationService.adjustDate(environment.attendanceEnd);

    logger.info(
      `Querying Unifi Access door logs between ${start.toDate()} and ${end.toDate()}...`
    );

    const logs = await unifiAccess.getDoorLogs(start, end);
    const actors: Set<Actor> = new Set(
      logs.map(log => ({
        name: AutomationService.toTitleCase(log._source.actor.display_name),
        id: log._source.actor.alternate_id
      }))
    );

    logger.info(
      `Found ${logs.length} door access events from ${actors.size} unique actors`
    );

    logger.info("Processing attendance...");

    const totalStudents = studentIdMap.size;

    for (const actor of actors) {
      if (studentIdMap.has(actor.id)) {
        logger.debug(`Marking ${actor.name} as present!`);

        studentIdMap.delete(actor.id);
      }
    }

    const absent = studentIdMap.size;
    const present = totalStudents - absent;

    logger.info(
      `Attendance Report:\n\tPresent: ${present}\n\tAbsent: ${absent}`
    );

    if (present < environment.unifi.threshold) {
      logger.warn(
        `Attendance threshold of ${environment.unifi.threshold} not met! No further action will be taken`
      );

      return;
    }

    logger.info(
      `Attendance threshold of ${environment.unifi.threshold} met! Marking students as absent...`
    );

    const result = await schoolpass.markStudents(
      StudentAttendanceType.Absent,
      studentIdMap.values()
    );

    if (result.success > 0) {
      logger.info(
        `${result.success}/${result.total} students successfully marked as absent!`
      );
    }

    if (result.failure > 0) {
      logger.error(
        `Error marking ${result.failure}/${result.total} students as absent`
      );
    }

    logger.info(`Scheduling "Late Arrivals" job...`);

    const lateArrivalJob = AutomationService.scheduleJob(
      "Late Arrivals Handler",
      {
        end: AutomationService.adjustDate(environment.schoolDismissal).toDate(),
        rule: `*/${environment.updateInterval} * * * *`
      },
      AutomationService.handleLateArrivals.bind(this, studentIdMap),
      false
    );

    if (lateArrivalJob) {
      logger.info(
        `"${lateArrivalJob.name}" next scheduled for ${lateArrivalJob.nextInvocation()}`
      );
    } else {
      logger.error(`Unable to schedule the late arrivals handler!`);
    }

    return result.failure > 0
      ? Promise.reject("Error marking students as absent")
      : Promise.resolve();
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

    const start = AutomationService.adjustDate(environment.attendanceEnd);
    const end = moment();

    logger.info(
      `Querying Unifi Access door logs between ${start.toDate()} and ${end.toDate()}...`
    );

    const logs = await unifiAccess.getDoorLogs(start, end);

    const actors: Set<Actor> = new Set(
      logs.map(log => ({
        name: AutomationService.toTitleCase(log._source.actor.display_name),
        id: log._source.actor.alternate_id
      }))
    );

    logger.info(
      `Found ${logs.length} door access events from ${actors.size} unique actors`
    );

    logger.info("Processing late arrivals...");

    const present: Student[] = [];

    for (const actor of actors) {
      const student = absentStudents.get(actor.id);

      if (student) {
        logger.debug(`Marking ${actor.name} as late arrival!`);

        present.push(student);

        absentStudents.delete(actor.id);
      }
    }

    logger.info(
      `Updated Attendance Report:\n\tNew Late Arrivals: ${present.length}`
    );

    await schoolpass.markStudents(StudentAttendanceType.LateArrival, present);

    logger.info(`${present.length} students now marked as late arrival!`);

    const job = schedule.scheduledJobs["Late Arrivals Handler"];

    if (absentStudents.size < 1) {
      logger.info(
        "All students now marked present! Canceling future late arrival checks"
      );

      job.cancel();
    }

    if (
      new Date() >
      AutomationService.adjustDate(environment.schoolDismissal).toDate()
    ) {
      logger.info(
        "School dissmial time reached. Caneling future late arrival checks"
      );

      job.cancel();
    }
  }
}
