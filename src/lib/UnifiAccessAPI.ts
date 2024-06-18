import axios, { AxiosInstance } from "axios";
import winston from "winston";
import * as AxiosLogger from "axios-logger";
import https from "https";

import logger from "./Logger";
import environment from "../environment";

/**
 * Additional options for the {@link UnifiAccessAPI}
 */
export interface UnifiAccessAPIOptions {
  /** Stream to use when logging */
  logger?: winston.Logger;
  /** IP address of the Unifi Console */
  server: string;
}

export interface UnfiAccessGetSystemLogsOptions {
  topic: UnfiAccessTopic;
  since?: number;
  until?: number;
  actorId?: string;
  pageNum?: number;
  pageSize?: number;
}

export interface UnifiAccessActor {
  alternate_id: string;
  alternate_name: string;
  display_name: string;
  id: string;
  type: string;
}

export interface UnifiAccessEvent {
  display_message: string;
  published: number;
  reason: string;
  result: string;
  type: string;
}

export interface UnifiAccessAuthentication {
  credential_provider: string;
  issuer: string;
}

export interface UnifiAccessSystemLog {
  actor: UnifiAccessActor;
  authentication: UnifiAccessAuthentication;
  event: UnifiAccessEvent;
  target: UnifiAccessActor[];
}

export interface UnifiAccessHit<T> {
  "@timestamp": string;
  _id: string;
  _source: T;
  tag: string;
}

export interface UnifiAccessHits<T> {
  hits: UnifiAccessHit<T>[];
}

export interface UnifiAccessPagination {
  page_num: number;
  page_size: number;
  total: number;
}

export interface UnifiAccessResponse<T> {
  code: string;
  data: T;
  msg?: string;
  pagination?: UnifiAccessPagination;
}

export enum UnfiAccessTopic {
  All = "all",
  Critical = "critical",
  DoorOpenings = "door_openings",
  Updates = "updates",
  DeviceEvents = "device_events",
  AdminActivity = "admin_activity",
  Visitor = "visitor"
}

/**
 * Responsible for handling all communication with the Unifi Access API
 */
export class UnifiAccessAPI {
  /** The main logging instance */
  private logger: winston.Logger;

  /** The {@link AxiosInstance} to use for all HTTP requests */
  private http!: AxiosInstance;

  private server: string;

  /**
   * Creates a new instance of the {@link UnifiAccessAPI} using the specified options
   * @param options Additional options for the {@link UnifiAccessAPI} to use
   */
  constructor(options: UnifiAccessAPIOptions) {
    this.logger = options.logger ? options.logger : this.createLogger();

    this.server = options.server;

    this.initAxiosInstance();
  }

  private createLogger(): winston.Logger {
    return logger.child({ label: "UnifiAccess" });
  }

  /**
   * Initalizes the Axios instance used for making HTTP requests to the Unifi Access API
   */
  private initAxiosInstance() {
    const http = axios.create({
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      })
    });

    http.interceptors.request.use(
      AxiosLogger.requestLogger,
      AxiosLogger.errorLogger
    );
    http.interceptors.response.use(
      AxiosLogger.responseLogger,
      AxiosLogger.errorLogger
    );

    http.defaults.baseURL = new URL(
      "/api/v1/developer/",
      this.server
    ).toString();
    http.defaults.headers.common.Authorization = `Bearer ${environment.unifi.accessAPIToken}`;

    this.http = http;
  }

  /**
   * Sets the classroom attendance for the specified student
   * @param type The attendance type to use
   * @param studentId The id of the student
   */
  async getSystemLogs(
    options: UnfiAccessGetSystemLogsOptions
  ): Promise<UnifiAccessResponse<UnifiAccessHits<UnifiAccessSystemLog>>> {
    const res = await this.http.post(
      "system/logs",
      {
        topic: options.topic,
        since: options.since,
        until: options.until,
        actor_id: options.actorId
      },
      {
        params: {
          page_num: options.pageNum || 1,
          page_size: options.pageSize || 25
        }
      }
    );

    if (res.data.code !== "SUCCESS") {
      this.logger.log("error", "Error fetching system logs:", { ...res.data });

      throw new Error("Error fetching Unifi system logs");
    }

    return res.data;
  }
}
