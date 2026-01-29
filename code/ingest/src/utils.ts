const MAY_START = 1430438400; // May 1, 2015 00:00:00 UTC
const MAY_END = 1433116799;   // May 31, 2015 23:59:59 UTC


export const calculateRange = (workerId: number, workersTotal: number) => {
    const step = Math.floor((MAY_END - MAY_START + 1) / workersTotal);
    const rangeStart = MAY_START + workerId * step;
    const rangeEnd = workerId === workersTotal - 1 ? MAY_END : rangeStart + step - 1;
    return { rangeStart, rangeEnd };
};