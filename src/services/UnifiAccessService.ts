import { Moment } from "moment";

import {
  UnifiAccessAPI,
  UnfiAccessTopic,
  UnifiAccessSystemLog,
  UnifiAccessHit
} from "../lib/UnifiAccessAPI";
import environment from "../environment";

/**
 * Handles all interactions with the Unifi Access API
 */
export default class UnifiAccessService {
  private unifiAccess = new UnifiAccessAPI({
    server: environment.unifi.server
  });

  private dateToSeconds = (date: Date) => Math.floor(date.getTime() / 1000);

  /**
   * Retrieves the door logs from the specified time window
   * @param start The start of the window
   * @param end The end of the window
   * @returns An array of logs
   */
  async getDoorLogs(
    start: Moment,
    end: Moment
  ): Promise<UnifiAccessHit<UnifiAccessSystemLog>[]> {
    const pageSize = 50;

    let pageNum = 1;

    const options = {
      topic: UnfiAccessTopic.DoorOpenings,
      since: start.unix(),
      until: end.unix()
    };

    const data = await this.unifiAccess.getSystemLogs({
      pageNum,
      pageSize,
      ...options
    });

    const logs: UnifiAccessHit<UnifiAccessSystemLog>[] = data.data.hits;

    const total = data.pagination?.total || 0;

    pageNum++;

    const promises: Promise<UnifiAccessHit<UnifiAccessSystemLog>[]>[] = [];

    for (; pageNum < Math.ceil(total / pageSize) + 1; pageNum++) {
      promises.push(
        new Promise(async resolve => {
          const data = await this.unifiAccess.getSystemLogs({
            pageNum,
            pageSize,
            ...options
          });

          resolve(data.data.hits);
        })
      );
    }

    const systemLogs = await Promise.all(promises);

    return logs.concat(systemLogs.flat());
  }
}
