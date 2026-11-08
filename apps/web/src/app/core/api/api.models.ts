export interface ApiResponse<T> { data: T }
export interface ApiErrorResponse {
  error: { code: string; message: string; requestId: string };
}
export interface Health { status: 'ok'; service: string }
