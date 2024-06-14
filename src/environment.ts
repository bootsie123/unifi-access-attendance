import "dotenv/config";

export default {
  production: process.env.NODE_ENV === "production",
  schoolPass: {
    username: process.env.SCHOOLPASS_USERNAME || "",
    password: process.env.SCHOOLPASS_PASSWORD || ""
  },
  unifi: {
    server: process.env.UNIFI_ACCESS_SERVER || "",
    accessAPIToken: process.env.UNFI_ACCESS_API_TOKEN || ""
  }
};
