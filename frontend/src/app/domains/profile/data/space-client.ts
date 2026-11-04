import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Building } from '@app/profile/models/space';

/**
 * PLACEHOLDER DATA: the backend has no buildings, floors or desks yet. Replace the body of
 * `catalog()` with HTTP calls once those endpoints exist; callers already treat it as async.
 * A favourite desk saved from this list will not match a real desk row.
 */
const BUILDINGS: readonly Building[] = [
  {
    name: 'Headquarters',
    floors: [
      {
        name: 'Ground floor',
        desks: [
          { id: 'd0000000-0000-4000-8000-000000000001', label: 'Desk G.01' },
          { id: 'd0000000-0000-4000-8000-000000000002', label: 'Desk G.02' },
        ],
      },
      {
        name: 'Floor 1',
        desks: [
          { id: 'd0000000-0000-4000-8000-000000000003', label: 'Desk 1.01' },
          { id: 'd0000000-0000-4000-8000-000000000004', label: 'Desk 1.02' },
          { id: 'd0000000-0000-4000-8000-000000000005', label: 'Desk 1.03' },
        ],
      },
    ],
  },
  {
    name: 'North Campus',
    floors: [
      {
        name: 'Floor 1',
        desks: [
          { id: 'd0000000-0000-4000-8000-000000000006', label: 'Desk N1.01' },
          { id: 'd0000000-0000-4000-8000-000000000007', label: 'Desk N1.02' },
        ],
      },
      {
        name: 'Floor 2',
        desks: [{ id: 'd0000000-0000-4000-8000-000000000008', label: 'Desk N2.01' }],
      },
    ],
  },
];

@Injectable({ providedIn: 'root' })
export class SpaceClient {
  catalog(): Observable<readonly Building[]> {
    return of(BUILDINGS);
  }
}
