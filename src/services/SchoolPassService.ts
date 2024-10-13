import NodeCache from "node-cache";

import { SchoolPassAPI, StudentAttendanceType } from "../lib/SchoolPassAPI";
import environment from "../environment";
import logger from "../lib/Logger";

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
 * Handles all interactions with the SchoolPass API
 */
export default class SchoolPassService {
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

          logger.info(
            `Fetching students from "${classroom.dismissalLocationName}" classroom`
          );

          const attendance = await this.schoolpass.getStudentAttendance(
            classroom.dismissalLocationId,
            classroom.date
          );

          const students = [];

          for (const student of attendance) {
            let cached: Student | undefined = SchoolPassService.cache.get(
              student.studentId
            );

            if (!cached) {
              const profile = await this.schoolpass.getStudentProfile(
                student.studentId
              );

              SchoolPassService.cache.set(student.studentId, profile);

              cached = {
                ...profile,
                ...student,
                fullName: `${student.firstName} ${student.lastName}`
              } as Student;
            }

            students.push(cached);
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

    for (const student of students) {
      if (student.attendanceStatus === StudentAttendanceType.Absent) {
        logger.info(
          `Student "${student.fullName}" already marked as "${type}"`
        );

        promises.push(new Promise(res => res()));

        continue;
      }

      promises.push(
        dryRun
          ? new Promise(resolve => {
              logger.info(
                `[DRY RUN] Student "${student.fullName}" marked as "${type}"`
              );

              resolve();
            })
          : this.schoolpass.setStudentAttendance(type, student.studentId)
      );
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

        logger.error(`Error marking a student's attendance:`, result.reason);
      } else {
        info.success++;
      }
    }

    info.total = results.length;

    return info;
  }
}
