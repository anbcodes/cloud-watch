export interface Stopwatch {
  name: string;
  pastTime: number;
  startedAt?: number;
  running: boolean;
}

export interface StopwatchGroup {
  name: string;
  ids: string[];
}
