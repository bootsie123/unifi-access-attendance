import { SchoolPassAPI, StudentAttendanceType } from "../lib/SchoolPassAPI";
import environment from "../environment";
import logger from "../lib/Logger";

const dryRun = environment.dryRun;

export interface Student {
  studentId: number;
  firstName: string;
  lastName: string;
  fullName: string;
}

export default class SchoolPassService {
  private schoolpass = new SchoolPassAPI();

  async init() {
    await this.schoolpass.init(
      environment.schoolPass.username,
      environment.schoolPass.password
    );
  }

  async getStudents(): Promise<Student[]> {
    const classrooms = await this.schoolpass.getAttendanceClassrooms();

    const promises: Promise<Student[]>[] = [];

    for (const classroom of classrooms) {
      promises.push(
        new Promise<Student[]>(async resolve => {
          const attendance = await this.schoolpass.getStudentAttendance(
            classroom.dismissalLocationId,
            classroom.date
          );

          if (
            classroom.dismissalLocationName.search(
              environment.schoolPass.dismissalLocationRegex
            ) < 0
          )
            return resolve([]);

          resolve(
            attendance.map(student => {
              return {
                studentId: student.studentId,
                firstName: student.firstName,
                lastName: student.lastName,
                fullName: `${student.firstName} ${student.lastName}`
              };
            })
          );
        })
      );
    }

    const students = await Promise.all(promises);

    return students.flat();
  }

  async markStudents(
    type: StudentAttendanceType,
    students: Student[] | IterableIterator<Student>
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const student of students) {
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

    await Promise.all(promises);
  }
}
