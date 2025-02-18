import axios, { AxiosInstance } from "axios";
import winston from "winston";

import logger, { addAxiosLoggerInterceptors } from "./Logger";

const configURL = "https://schoolpass.cloud/assets/runtime.config.json";

/**
 * Additional options for the {@link SchoolPassAPI}
 */
export interface SchoolPassAPIOptions {
  /** Stream to use when logging */
  logger?: winston.Logger;
}

/**
 * Outlines info on a SchoolPass user
 */
export interface SchoolPassUserInfo {
  login: string;
  userType: string;
  schoolConnection: {
    appCode: number;
    schoolUrl: string;
    apiUrl: string;
    schoolName: string;
    connectionString: string;
    emergencyManagementApiUrl: string;
    distrctId: any;
  };
}

/**
 * Outlines a SchoolPass user
 */
export interface SchoolPassUser {
  user: {
    internalId: number;
    userType: number;
  };
}

/**
 * Outlines a token returned from the SchoolPass API
 */
export interface SchoolPassAPIToken {
  access_token: string;
  access_token_expirate: Date;
  refresh_token: string;
}

/**
 * Outlines a SchoolPass attendance classroom
 */
export interface SchoolPassClassroom {
  date: string;
  dismissalLocationId: number;
  dismissalLocationName: string;
  sitePrefix: string;
  siteName: string;
  startTime: Date;
  endTime: Date;
  teacherMemberId: number;
  memberName: string;
  studentCount: number;
  present: number;
  lateArrival: number;
  absent: number;
  virtual: number;
  acknowledgeChanges: boolean;
}

/**
 * Outlines the classroom attendance data for a student
 */
export interface SchoolPassStudentAttendance {
  arrivalMode: string;
  attendanceMethod: string;
  attendanceStatus: string;
  description: string;
  firstName: string;
  lastName: string;
  studentId: number;
  wellnessStatus: number;
}

/**
 * Outlines a student's profile
 */
export interface SchoolPassStudentProfile {
  notificationSettings: [
    {
      notificationMode: number;
      userNotificationType: number;
      allow: boolean;
    }
  ];
  dismissalLocationId: number;
  gradeId: number;
  sitePrefix: string;
  siteName: string;
  quickPIN: string;
  tags: unknown;
  user: {
    userType: number;
    internalId: number;
  };
  firstName: string;
  lastName: string;
  dateOfBirth: unknown;
  phoneNumber: unknown;
  address: unknown;
  email: string;
  externalId: string;
  created: unknown;
  userDefinedField1: unknown;
  optOutEmail: boolean;
  quickPINForUser: unknown;
}

/**
 * Specifies the classroom attendance types
 */
export enum StudentAttendanceType {
  Present = "Present",
  Absent = "Absent",
  LateArrival = "LateArrival",
  Virtual = "Virtual"
}

/**
 * Specifies a student's arrival and dismissal calendar
 */
export interface StudentCalender {
  dailyList: [
    {
      adType: number;
      changeId: number;
      changeSeriesId: number;
      description: string;
      isDefault: boolean;
      moveToId: number;
      studentChangeType: number;
      timestamp: Date;
    }
  ];
  siteId: number;
  studentId: number;
  wellnessStatus: number;
}

/**
 * Specifies a new student dismissal change
 */
export interface StudentChangeCreate {
  adType: number | null;
  busStopId: number | null;
  changeSeriesId: number;
  changeType: number;
  dateSet: {
    dates: Date[];
    daysOfWeek: number[];
    endDate: string;
    startDate: string;
    recurringWeeks: number;
  };
  modifiedBy: number;
  moveToId: number;
  notes: string;
  overwriteChanges: boolean;
  pickupDropoffPerson: unknown;
  studentId: number;
  timeOfDay: unknown;
  userType: number;
  willReturn: unknown;
}

/**
 * Specifies an existing student change
 */
export interface StudentChange {
  changeType: number;
  days: string;
  description: string;
  endDate: Date;
  lastModifiedBy: string;
  lastModifiedDate: Date;
  notes: string;
  occurenceIds: number[];
  seriesId: number;
  startDate: Date;
}

/**
 * Specifies a parent's profile information
 */
export interface ParentProfile {
  address: unknown;
  carpool: {
    carpoolNumber: string;
    dateCreated: Date;
    id: number;
    name: string;
    type: number;
  };
  created: Date;
  custody: string;
  dateOfBirth: unknown;
  email: string;
  externalId: string;
  firstName: string;
  homePhone: unknown;
  lastName: string;
  marital: number;
  optOutEmail: boolean;
  parentId: number;
  parentVehicles: unknown;
  phoneNumber: unknown;
  primaryParentId: unknown;
  quickPINForUser: unknown;
  relationship: unknown;
  user: {
    internalId: number;
    userType: number;
  };
  userDefinedField1: unknown;
}

/**
 * Specifies a bus stop
 */
export interface BusStop {
  id: number;
  busId: number;
  name: string;
  sequence: number;
}

/**
 * Specifies the number associated with a particular change type
 */
export enum StudentChangeType {
  Abent = 1,
  LateArrival = 2,
  EarlyDismissal = 3,
  Carpool = 4,
  Activity = 5,
  Bus = 6
}

/**
 * Responsible for handling all communication with the SchoolPass API
 */
export class SchoolPassAPI {
  /** The main logging instance */
  private logger: winston.Logger;

  /** The {@link AxiosInstance} to use for all HTTP requests */
  private http!: AxiosInstance;

  /** Used for all HTTP requests to SchoolPass homebase */
  private homebaseHttp!: AxiosInstance;

  private schoolCode!: number;
  private user!: SchoolPassUser;

  private password: string = "";

  /**
   * Creates a new instance of the {@link SchoolPassAPI} using the specified options
   * @param options Additional options for the {@link SchoolPassAPI} to use
   */
  constructor(options: SchoolPassAPIOptions = {}) {
    this.logger = options.logger ? options.logger : this.createLogger();

    this.initAxiosInstance();
  }

  private createLogger(): winston.Logger {
    return logger.child({ label: "SchoolPass" });
  }

  /**
   * Initalizes the Axios instance used for making HTTP requests to the SchoolPass API
   */
  private initAxiosInstance() {
    const http = axios.create();

    // Handles automatic refreshing of expired access tokens
    http.interceptors.response.use(
      res => {
        return res;
      },
      async err => {
        const originalReq = err.config;

        if (err.response?.status === 401 && !originalReq._retry401) {
          originalReq._retry401 = true;

          this.logger.debug(
            "401 error encountered. Authentication token possibly expired? Response:",
            err.response
          );

          this.logger.warn(
            "Authentication token possibly expired. Auto refreshing token..."
          );

          try {
            const token = await this.authenticate(
              this.schoolCode,
              this.user.user.userType,
              this.user.user.internalId,
              this.password
            );

            originalReq.headers["Authorization"] =
              `Bearer ${token.access_token}`;

            return http(originalReq);
          } catch {
            this.logger.error("Unable to auto refresh authentication token");
          }
        } else if (err.response?.status === 429) {
          const retryAfter = parseInt(err.response.headers["retry-after"]) + 3;

          this.logger.warn(
            `Rate limit reached. Retrying after ${retryAfter} seconds`
          );

          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));

          return http(originalReq);
        } else if (err.response?.status === 500 && originalReq._retry500 < 3) {
          originalReq._retry500++;

          const retryAfter = 1000 + Math.floor(Math.random() * 10000);

          this.logger.debug(
            "500 error encountered. Response:",
            err.response,
            "Request:",
            originalReq
          );

          this.logger.warn(
            `500 error encountered. Retrying after ${retryAfter} seconds`
          );

          await new Promise(resolve => setTimeout(resolve, retryAfter));

          return http(originalReq);
        }

        throw err;
      }
    );

    this.http = http;
    this.homebaseHttp = axios.create();

    addAxiosLoggerInterceptors(this.http, this.logger);
    addAxiosLoggerInterceptors(this.homebaseHttp, this.logger);
  }

  /**
   * Initializes the auth token used by the SchoolPass API
   * @param username User used during authentication
   * @param password Password used during authentication
   */
  public async init(username: string, password: string) {
    this.password = password;

    try {
      const res = await this.http.get(configURL);

      const data = res.data;

      this.homebaseHttp.defaults.baseURL = data.defaultHomeBaseUrl;
      this.homebaseHttp.defaults.headers.common.Authorization = `Bearer ${data.authToken}`;

      const connectionInfo = (await this.findUserInfo(username))[0];

      this.schoolCode = connectionInfo.schoolConnection.appCode;

      this.http.defaults.baseURL =
        connectionInfo.schoolConnection.apiUrl + "/api";
      this.http.defaults.headers.common.Authorization = `Bearer ${data.authToken}`;
      this.http.defaults.headers.common.Appcode = this.schoolCode;

      const userInfo = (
        await this.getAuthenticatingUser(
          connectionInfo.schoolConnection.appCode,
          username,
          password
        )
      )[0];

      this.user = userInfo;

      const token = await this.authenticate(
        this.schoolCode,
        userInfo.user.userType,
        userInfo.user.internalId,
        password
      );

      this.http.defaults.headers.common.Authorization = `Bearer ${token.access_token}`;
    } catch (err) {
      this.logger.error(
        "Error occurred while trying to initialize the SchoolPass API"
      );

      throw err;
    }
  }

  /**
   * Authenticates a user within a school's SchoolPass environment
   * @param schoolCode The school code of the user's environment
   * @param userType The type code of the user
   * @param userId The user ID of the user
   * @param password The password of the user
   * @returns The authentication token
   */
  private async authenticate(
    schoolCode: number,
    userType: number,
    userId: number,
    password: string
  ): Promise<SchoolPassAPIToken> {
    try {
      const res = await this.http.post("Auth/token", {
        schoolCode,
        userType,
        userId,
        password,
        authType: "credentials"
      });

      return res.data;
    } catch (err) {
      this.logger.error("Error authenticating user:", err);

      throw err;
    }
  }

  /**
   * Gets info about an authenticating SchoolPass user
   * @param schoolCode The school code of the user's environment
   * @param username The username of the user
   * @param password The password of the user
   * @returns The authentication token
   */
  private async getAuthenticatingUser(
    schoolCode: number,
    username: string,
    password: string
  ): Promise<SchoolPassUser[]> {
    const res = await this.http.post("Auth/users", {
      schoolCode,
      authType: "credentials",
      email: username,
      password
    });

    return res.data;
  }

  /**
   * Gets the user ID of the API user
   * @returns API user internal ID
   */
  getAPIUserId(): number {
    return this.user.user.internalId;
  }

  /**
   * Retrieves info about a SchoolPass user
   * @param email The email address of the user
   * @returns A {@link SchoolPassUserInfo} object
   */
  async findUserInfo(email: string): Promise<SchoolPassUserInfo[]> {
    const res = await this.homebaseHttp.get("findspruserinfo", {
      params: {
        emailAddress: email
      }
    });

    return res.data;
  }

  /**
   * Retrieves info about attendance classrooms
   * @returns A {@link SchoolPassClassroom} object
   */
  async getAttendanceClassrooms(): Promise<SchoolPassClassroom[]> {
    const res = await this.http.get("classroom/getAllAttendanceInfo");

    return res.data;
  }

  /**
   * Retrieves a student's user profile
   * @param studentId The id of the student
   * @returns A {@link SchoolPassStudentProfile} object
   */
  async getStudentProfile(
    studentId: number
  ): Promise<SchoolPassStudentProfile> {
    const res = await this.http.get("Student/profile", {
      params: {
        studentId
      }
    });

    return res.data;
  }

  /**
   * Retrieves the classroom attendance data for a specified classroom
   * @param locationId The location id of the classroom
   * @param date The day to retrieve info for
   * @returns An array of {@link SchoolPassStudentAttendance} objects
   */
  async getStudentAttendance(
    locationId: number,
    date: string
  ): Promise<SchoolPassStudentAttendance[]> {
    const res = await this.http.get("classroom/GetStudentAttendanceInfo", {
      params: {
        arrivalLocationId: locationId,
        date
      }
    });

    return res.data;
  }

  /**
   * Sets the classroom attendance for the specified student
   * @param type The attendance type to use
   * @param studentId The id of the student
   */
  async setStudentAttendance(
    type: StudentAttendanceType,
    studentId: number
  ): Promise<void> {
    await this.http.post(
      `classroom/${type == StudentAttendanceType.Present ? "mark" : ""}student${type}`,
      null,
      {
        params: {
          studentId,
          userId: this.user.user.internalId,
          userType: this.user.user.userType
        }
      }
    );
  }

  /**
   * Gets the arrival and dimissal plan for the given student
   * @param studentId The id of the student
   * @param startDate The start date the plan
   * @param endDate The end date of the plan
   * @returns A {@link StudentCalender} object containing the plan
   */
  async getStudentCalendar(
    studentId: number,
    startDate: Date,
    endDate: Date
  ): Promise<StudentCalender> {
    const res = await this.http.get(`student/studentcalendar`, {
      params: {
        studentId,
        startDate,
        endDate
      }
    });

    return res.data;
  }

  /**
   * Creates a new student dismissal change
   * @param parentMemberId The parent id of the student to make changes to
   * @param change The dismissal change to make
   */
  async createStudentChange(
    parentId: number,
    change: StudentChangeCreate
  ): Promise<void> {
    await this.http.post("studentchange", change, {
      params: {
        schoolCode: this.schoolCode,
        parentMemberId: parentId
      }
    });
  }

  /**
   * Gets all of the dismissal changes associated with the student
   * @param studentId The id of the student
   * @returns An array of {@link StudentChange} objects
   */
  async getStudentChanges(studentId: number): Promise<StudentChange[]> {
    const res = await this.http.get("v2/studentchange", {
      params: {
        schoolCode: this.schoolCode,
        studentId
      }
    });

    return res.data;
  }

  /**
   * Gets one parent for a student
   * @param studentId The id of the student
   * @returns A {@link ParentProfile} object
   */
  async getStudentParent(studentId: number): Promise<ParentProfile> {
    const res = await this.http.get("Student/GetParentOnes", {
      params: {
        studentId
      }
    });

    return res.data;
  }

  /**
   * Gets the bus stops associated with a bus
   * @param busId The id of the bus
   * @returns An array of {@link BusStop} objects
   */
  async getBusStops(busId: number): Promise<BusStop[]> {
    const res = await this.http.get("bus/getstops", {
      params: {
        busId
      }
    });

    return res.data;
  }
}
