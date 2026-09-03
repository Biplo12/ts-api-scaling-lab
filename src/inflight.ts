export const MAX_INFLIGHT = Number(process.env.MAX_INFLIGHT) || 100;

export const inflight = { current: 0, shed: 0 };
