import { createLogger, format, transports } from "winston";
import { setGlobalConfig } from "axios-logger";
import stringify from "fast-safe-stringify";

const logger = createLogger({
  level: "info",
  format: format.json(),
  defaultMeta: {
    service: "unifi-access-attendance"
  },
  transports: []
});

setGlobalConfig({
  headers: true,
  params: true,
  data: true
});

logger.add(
  new transports.Console({
    level: "debug",
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
  })
);

export default logger;
