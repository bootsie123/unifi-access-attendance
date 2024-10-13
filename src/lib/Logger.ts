import {
  createLogger,
  format,
  transports,
  Logger,
  LeveledLogMethod
} from "winston";
import { setGlobalConfig } from "axios-logger";
import stringify from "fast-safe-stringify";
import axios from "axios";
import * as AxiosLogger from "axios-logger";

import environment from "../environment";

const logger = createLogger({
  level: environment.production ? "info" : "debug",
  format: format.json(),
  defaultMeta: {
    service: "unifi-access-attendance"
  },
  transports: [
    new transports.Console({
      format: format.combine(
        format.timestamp(),
        format.simple(),
        format.colorize(),
        format.printf(options => {
          const args = options[Symbol.for("splat")]?.filter(
            (arg: any) => !(arg instanceof Error)
          );

          const argsString = args?.map(stringify).join(" ");

          return `${options.timestamp} ${options.level} [${options.service}]${options.label ? " [" + options.label + "]" : ""} ${options.message}${argsString ? " " + argsString : ""}${options.stack ? "\n" + options.stack : ""}`;
        })
      )
    }),
    new transports.File({
      filename: "attendance.log",
      format: format.combine(format.timestamp(), format.json())
    })
  ]
});

setGlobalConfig({
  headers: true,
  params: true,
  data: true
});

export const addAxiosLoggerInterceptors = (
  http: axios.AxiosInstance,
  logger: Logger
) => {
  const wrapAxiosLogger = (
    axiosLogger: any,
    logger: Logger,
    level: LeveledLogMethod
  ) => {
    return (msg: any) =>
      axiosLogger(msg, {
        logger: level.bind(logger)
      });
  };

  http.interceptors.request.use(
    wrapAxiosLogger(AxiosLogger.requestLogger, logger, logger.debug),
    wrapAxiosLogger(AxiosLogger.errorLogger, logger, logger.error)
  );

  http.interceptors.response.use(
    wrapAxiosLogger(AxiosLogger.responseLogger, logger, logger.debug),
    wrapAxiosLogger(AxiosLogger.errorLogger, logger, logger.error)
  );
};

export default logger;
