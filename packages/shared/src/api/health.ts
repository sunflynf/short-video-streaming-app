export type HealthStatus = 'ok' | 'error';

export type HealthResponse = {
  status: HealthStatus;
  db: HealthStatus;
  redis: HealthStatus;
};
