import { Moment } from "moment";

import {
  UnifiAccessAPI,
  UnfiAccessTopic,
  UnifiAccessSystemLog,
  UnifiAccessHit
} from "../lib/UnifiAccessAPI";
import environment from "../environment";

export default class UnifiAccessService {
  private unifiAccess = new UnifiAccessAPI({
    server: environment.unifi.server
  });

  private dateToSeconds = (date: Date) => Math.floor(date.getTime() / 1000);

  async getDoorLogs(start: Moment, end: Moment) {
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

    for (; pageNum < Math.ceil(total / pageSize); pageNum++) {
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
