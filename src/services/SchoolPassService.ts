import NodeCache from "node-cache";

import {
  SchoolPassAPI,
  SchoolPassStudentProfile,
  StudentAttendanceType,
  StudentCalender,
  StudentChange,
  StudentChangeType
} from "../lib/SchoolPassAPI";
import environment from "../environment";
import logger from "../lib/Logger";
import moment from "moment";

const dryRun = environment.dryRun;

/**
 * Outlines a simplified student
 */
export interface Student {
  studentId: number;
  externalId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  attendanceStatus: string;
}

/**
 * Outlines the results from marking student's attendance
 */
export interface MarkResult {
  success: number;
  failure: number;
  total: number;
}

/**
 * Outlines a student change which has been cached
 */
interface CachedChange {
  change: StudentCalender["dailyList"][0];
  series: StudentChange;
}

/**
 * Handles all interactions with the SchoolPass API
 */
export default class SchoolPassService {
  private static logger = logger.child({
    label: "SchoolPassService"
  });

  private schoolpass = new SchoolPassAPI();

  private static cache = new NodeCache();

  /**
   * Initializes the service
   */
  async init(): Promise<void> {
    await this.schoolpass.init(
      environment.schoolPass.username,
      environment.schoolPass.password
    );
  }

  /**
   * Retrieves students from SchoolPass
   * @returns An array of {@link Student} objects
   */
  async getStudents(): Promise<Student[]> {
    const classrooms = await this.schoolpass.getAttendanceClassrooms();

    const promises: Promise<Student[]>[] = [];

    for (const classroom of classrooms) {
      promises.push(
        new Promise<Student[]>(async resolve => {
          if (
            classroom.dismissalLocationName.search(
              environment.schoolPass.dismissalLocationRegex
            ) < 0
          )
            return resolve([]);

          SchoolPassService.logger.info(
            `Fetching students from "${classroom.dismissalLocationName}" classroom`
          );

          const attendance = await this.schoolpass.getStudentAttendance(
            classroom.dismissalLocationId,
            classroom.date
          );

          const students = [];

          for (const student of attendance) {
            let cachedProfile: SchoolPassStudentProfile | undefined =
              SchoolPassService.cache.get(student.studentId);

            if (!cachedProfile) {
              const profile = await this.schoolpass.getStudentProfile(
                student.studentId
              );

              SchoolPassService.cache.set(student.studentId, profile);

              cachedProfile = profile;
            }

            students.push({
              ...cachedProfile,
              ...student,
              fullName: `${student.firstName} ${student.lastName}`
            });
          }

          resolve(students);
        })
      );
    }

    const students = await Promise.all(promises);

    return students.flat();
  }

  /**
   * Updates the attendance of the given students
   * @param type The attendance mark type
   * @param students An array of students to update the attendance of
   */
  async markStudents(
    type: StudentAttendanceType,
    students: Student[] | IterableIterator<Student>
  ): Promise<MarkResult> {
    const promises: Promise<void>[] = [];

    const day = moment().startOf("day");

    if (day.day() === 0 || day.day() === 6) {
      SchoolPassService.logger.debug(
        `Current day is ${day.format("dddd")}, setting to Monday for testing purposes`
      );

      day.day(1);
    }

    const currentDay = day.toDate();

    for (const student of students) {
      if (student.attendanceStatus === type) {
        SchoolPassService.logger.debug(
          `Student "${student.fullName}" already marked as "${type}"`
        );

        promises.push(new Promise(res => res()));

        continue;
      }

      const changeKey = `${student.studentId}-change`;

      if (type === StudentAttendanceType.Absent) {
        const calendar = await this.schoolpass.getStudentCalendar(
          student.studentId,
          currentDay,
          currentDay
        );

        const change = calendar.dailyList[calendar.dailyList.length - 1];

        const changes = await this.schoolpass.getStudentChanges(
          student.studentId
        );

        if (change.isDefault || change.changeSeriesId === null) {
          SchoolPassService.logger.debug(
            `Student "${student.fullName}" is currently set to their default dismissal location or no change series ID was found. Skipping caching`
          );
        } else {
          SchoolPassService.cache.set(changeKey, {
            series: changes.find(
              series => series.seriesId === change.changeSeriesId
            ),
            change
          });
        }
      }

      promises.push(
        dryRun
          ? new Promise(resolve => {
              SchoolPassService.logger.info(
                `[DRY RUN] Student "${student.fullName}" marked as "${type}"`
              );

              resolve();
            })
          : this.schoolpass.setStudentAttendance(type, student.studentId)
      );

      const cachedChange: CachedChange | undefined =
        SchoolPassService.cache.get(changeKey);

      // Patches student changes from being marked as absent
      // Current works for the following change types: bus
      if (
        type !== StudentAttendanceType.Absent &&
        cachedChange &&
        cachedChange.change.studentChangeType in [StudentChangeType.Bus]
      ) {
        const { change, series } = cachedChange;

        let busStopId = null;

        if (change.studentChangeType === StudentChangeType.Bus) {
          const busStops = await this.schoolpass.getBusStops(change.moveToId);

          busStopId = busStops[0].id;
        }

        SchoolPassService.logger.info(
          `Student "${student.fullName}" being marked as "${type}" from absent. Patching student changes`
        );

        const currentDate = day.format("YYYY-MM-DD");

        const modifiedBy = this.schoolpass.getAPIUserId();

        const data = {
          adType: change.adType,
          busStopId,
          changeSeriesId: change.changeSeriesId,
          changeType: change.studentChangeType,
          dateSet: {
            dates: [],
            daysOfWeek: [day.day()],
            endDate: currentDate,
            startDate: currentDate,
            recurringWeeks: 1
          },
          modifiedBy,
          moveToId: change.moveToId,
          notes: series?.notes || change.description,
          overwriteChanges: true,
          studentId: student.studentId,
          userType: 4,
          pickupDropoffPerson: undefined,
          timeOfDay: undefined,
          willReturn: undefined
        };

        try {
          await this.schoolpass.createStudentChange(modifiedBy, data);
        } catch (err) {
          SchoolPassService.logger.error(
            `Error patching student change for "${student.fullName}"`,
            err,
            data
          );
        }

        SchoolPassService.cache.del(changeKey);
      }
    }

    const info = {
      success: 0,
      failure: 0,
      total: 0
    };

    const results = await Promise.allSettled(promises);

    for (const result of results) {
      if (result.status === "rejected") {
        info.failure++;

        SchoolPassService.logger.error(
          `Error marking a student's attendance:`,
          result.reason
        );
      } else {
        info.success++;
      }
    }

    info.total = results.length;

    return info;
  }
}
