import axios, { AxiosInstance } from "axios";
import winston from "winston";
import * as AxiosLogger from "axios-logger";

import logger from "./Logger";

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
 * Specifies the classroom attendance types
 */
export enum StudentAttendanceType {
  Present = "Present",
  Absent = "Absent",
  LateArrival = "LateArrival",
  Virtual = "Virtual"
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

        if (err.response?.status === 401 && !originalReq._retry) {
          originalReq._retry = true;

          this.logger.info(err.response.data);

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
        } else if (err.response?.status === 500) {
          this.logger.warn("500 error encountered. Retrying request");

          const retryAfter = 1000 + Math.floor(Math.random() * 2000);

          await new Promise(resolve => setTimeout(resolve, retryAfter));

          return http(originalReq);
        }

        throw err;
      }
    );

    http.interceptors.request.use(
      AxiosLogger.requestLogger,
      AxiosLogger.errorLogger
    );
    http.interceptors.response.use(
      AxiosLogger.responseLogger,
      AxiosLogger.errorLogger
    );

    this.http = http;
    this.homebaseHttp = axios.create();

    this.homebaseHttp.interceptors.request.use(
      AxiosLogger.requestLogger,
      AxiosLogger.errorLogger
    );
    this.homebaseHttp.interceptors.response.use(
      AxiosLogger.responseLogger,
      AxiosLogger.errorLogger
    );
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
}
