import environment from "./environment";
import logger from "./lib/Logger";
import { StudentAttendanceType } from "./lib/SchoolPassAPI";
import SchoolPassService from "./services/SchoolPassService";
import UnifiAccessService from "./services/UnifiAccessService";

(async () => {
  try {
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
  } catch (err) {
    logger.error("Error with server:", err);
  }
})();
