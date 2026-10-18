/** Cursor-paginated list response used by every list endpoint. */
export type Paginated<T> = {
  items: T[];
  nextCursor: string | null;
};

/** Error body produced by the API's global exception filter. */
export type ApiError = {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId?: string;
};
