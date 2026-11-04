import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { APP_CONFIG } from '@app/shared/config/util/app-config';
import { Role, User } from '@app/shared/auth/models/auth';

export interface PageInfo {
  readonly size: number;
  readonly number: number;
  readonly totalElements: number;
  readonly totalPages: number;
}

/** Shape of the backend's `PagedModel<UserResponse>`. */
export interface UserPage {
  readonly content: readonly User[];
  readonly page: PageInfo;
}

/** Create and update share one shape; on update an absent password keeps the current one. */
export interface UserInput {
  readonly email: string;
  readonly role: Role;
  readonly password?: string;
}

/** Admin list filters; an empty value means "no filter". */
export interface UserFilters {
  readonly q: string;
  readonly role: Role | '';
  readonly status: '' | 'active' | 'inactive';
  readonly department: string;
}

export const NO_FILTERS: UserFilters = { q: '', role: '', status: '', department: '' };

/** Thin HTTP layer for `/api/v1/users` (every call is ADMIN-only). */
@Injectable({ providedIn: 'root' })
export class UsersClient {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(APP_CONFIG).baseUrl}/api/v1/users`;

  list(page: number, size: number, filters: UserFilters = NO_FILTERS): Observable<UserPage> {
    const params: Record<string, string | number> = { page, size, sort: 'email,asc' };
    if (filters.q.trim() !== '') params['q'] = filters.q.trim();
    if (filters.role !== '') params['role'] = filters.role;
    if (filters.status !== '') params['active'] = filters.status === 'active' ? 'true' : 'false';
    if (filters.department.trim() !== '') params['department'] = filters.department.trim();
    return this.http.get<UserPage>(this.url, { params });
  }

  changeRole(id: string, role: Role): Observable<User> {
    return this.http.put<User>(`${this.url}/${id}/role`, { role });
  }

  deactivate(id: string): Observable<User> {
    return this.http.post<User>(`${this.url}/${id}/deactivate`, null);
  }

  reactivate(id: string): Observable<User> {
    return this.http.post<User>(`${this.url}/${id}/reactivate`, null);
  }

  create(input: UserInput): Observable<User> {
    return this.http.post<User>(this.url, input);
  }

  update(id: string, input: UserInput): Observable<User> {
    return this.http.put<User>(`${this.url}/${id}`, input);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }
}
