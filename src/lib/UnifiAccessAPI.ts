import axios, { AxiosInstance } from "axios";
import winston from "winston";
import https from "https";

import logger, { addAxiosLoggerInterceptors } from "./Logger";
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

/**
 * Outlines the options when getting system logs
 */
export interface UnfiAccessGetSystemLogsOptions {
  topic: UnfiAccessTopic;
  since?: number;
  until?: number;
  actorId?: string;
  pageNum?: number;
  pageSize?: number;
}

/**
 * Outlines an Actor in Unifi Access
 */
export interface UnifiAccessActor {
  alternate_id: string;
  alternate_name: string;
  display_name: string;
  id: string;
  type: string;
}

/**
 * Outlines an event in Unifi Access
 */
export interface UnifiAccessEvent {
  display_message: string;
  published: number;
  reason: string;
  result: string;
  type: string;
}

/**
 * Outlines authentication info in Unifi Access
 */
export interface UnifiAccessAuthentication {
  credential_provider: string;
  issuer: string;
}

/**
 * Outlines expected info from the Unifi Access system logs
 */
export interface UnifiAccessSystemLog {
  actor: UnifiAccessActor;
  authentication: UnifiAccessAuthentication;
  event: UnifiAccessEvent;
  target: UnifiAccessActor[];
}

/**
 * Outlines a search hit in Unifi Access
 */
export interface UnifiAccessHit<T> {
  "@timestamp": string;
  _id: string;
  _source: T;
  tag: string;
}

/**
 * Outlines an array of hits in Unifi Access
 */
export interface UnifiAccessHits<T> {
  hits: UnifiAccessHit<T>[];
}

/**
 * Outlines the returned pagination object in Unifi Access
 */
export interface UnifiAccessPagination {
  page_num: number;
  page_size: number;
  total: number;
}

/**
 * Outlines the standard response in Unifi Access
 */
export interface UnifiAccessResponse<T> {
  code: string;
  data: T;
  msg?: string;
  pagination?: UnifiAccessPagination;
}

/**
 * Defines all possible topics that can be used when searching the system logs
 */
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

    addAxiosLoggerInterceptors(http, this.logger);

    http.defaults.baseURL = new URL(
      "/api/v1/developer/",
      this.server
    ).toString();
    http.defaults.headers.common.Authorization = `Bearer ${environment.unifi.accessAPIToken}`;

    this.http = http;
  }

  /**
   * Retrieves the system logs from Unifi Access
   * @param options The options to use when retrieving the logs
   * @returns The found logs
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
