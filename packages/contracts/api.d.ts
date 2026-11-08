export interface ApiResponse<T> {
  data: T;
}
export interface ApiErrorResponse {
  error: { code: string; message: string; requestId: string };
}
export interface Health {
  status: 'ok';
  service: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthSession {
  configured: boolean;
  user: AuthUser | null;
  csrfToken: string | null;
}
