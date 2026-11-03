export interface ApiResponseMeta {
  timestamp: string;
  correlationId?: string;
  path?: string;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ApiSuccessResponse<T> {
  success: true;
  statusCode: number;
  data: T;
  meta: ApiResponseMeta;
}

export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  error: string;
  message: string;
  details?: unknown[];
  meta: ApiResponseMeta;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}
