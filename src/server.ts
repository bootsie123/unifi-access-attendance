import { SchoolPassAPI, StudentAttendanceType } from "./lib/SchoolPass";

import logger from "./lib/Logger";
import environment from "./environment";
import { UnfiAccessAPI, UnfiAccessTopic } from "./lib/UnifiAccess";

const schoolpass = new SchoolPassAPI();
const unifiAccess = new UnfiAccessAPI({
  server: environment.unifi.server
});

(async () => {
  try {
    const date = new Date();

    date.setHours(16);
    date.setMinutes(0);
    date.setSeconds(0);

    const date2 = new Date(date.getTime());

    date2.setMinutes(3);

    const data = await unifiAccess.getSystemLogs({
      topic: UnfiAccessTopic.DoorOpenings,
      since: Math.floor(date.getTime() / 1000),
      until: Math.floor(date2.getTime() / 1000),
      pageNum: 1,
      pageSize: 25
    });

    for (const hit of data.data.hits) {
      console.log(hit);
    }
    /*
    await schoolpass.init(
      environment.schoolPass.username,
      environment.schoolPass.password
    );

    const classrooms = await schoolpass.getAttendanceClassrooms();

    const testClass = classrooms.find(classroom =>
      classroom.dismissalLocationName.includes("Test Dismissal Location")
    );

    if (!testClass) return;

    const attendance = await schoolpass.getStudentAttendance(
      testClass.dismissalLocationId,
      testClass.date
    );

    const testStudent = attendance[0];

    await schoolpass.setStudentAttendance(
      StudentAttendanceType.Absent,
      testStudent.studentId
    );
    */
  } catch (err) {
    logger.error("Error with server:", err);
  }
})();
