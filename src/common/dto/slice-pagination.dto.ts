export interface SlicePaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    hasMore: boolean;
  };
}
