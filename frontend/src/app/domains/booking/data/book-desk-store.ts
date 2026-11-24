import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FloorAvailability } from '@app/booking/models/floor-availability';
import { addDays, todayIn, zonedToUtc } from '@app/booking/util/desk-slots';
import { BuildingsClient } from '@app/spaces/data/buildings-client';
import { FloorsClient } from '@app/spaces/data/floors-client';
import { Building } from '@app/spaces/models/building';
import { Floor } from '@app/spaces/models/floor';
import { FloorAvailabilityClient } from './floor-availability-client';

/**
 * State of the "Book a desk" page: the picked building, floor and day, and what is free on that
 * floor that day (E4.T1). Provided by the page, so each visit starts clean.
 *
 * Every load answers only the latest pick: a slower answer to an older pick is dropped, so
 * switching floors or days quickly never shows the wrong list.
 */
@Injectable()
export class BookDeskStore {
  private readonly buildingsClient = inject(BuildingsClient);
  private readonly floorsClient = inject(FloorsClient);
  private readonly availabilityClient = inject(FloorAvailabilityClient);

  private readonly _buildings = signal<readonly Building[]>([]);
  private readonly _building = signal<Building | null>(null);
  private readonly _floors = signal<readonly Floor[]>([]);
  private readonly _floorId = signal<string | null>(null);
  private readonly _date = signal<string | null>(null);
  private readonly _availability = signal<FloorAvailability | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private latest = 0;

  readonly buildings = this._buildings.asReadonly();
  readonly building = this._building.asReadonly();
  readonly floors = this._floors.asReadonly();
  readonly floorId = this._floorId.asReadonly();
  /** `YYYY-MM-DD` in the building's time zone. */
  readonly date = this._date.asReadonly();
  readonly availability = this._availability.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /** Loads the buildings and opens the first one. */
  async load(): Promise<void> {
    await this.run(async (isLatest) => {
      const buildings = await firstValueFrom(this.buildingsClient.list());
      if (!isLatest()) return;
      this._buildings.set(buildings);
      if (buildings.length > 0) await this.openBuilding(buildings[0], isLatest);
    });
  }

  /** Opens the building on today (its time zone) and its first floor. */
  async selectBuilding(buildingId: string): Promise<void> {
    const building = this._buildings().find((b) => b.id === buildingId);
    if (!building) return;
    await this.run((isLatest) => this.openBuilding(building, isLatest));
  }

  async selectFloor(floorId: string): Promise<void> {
    this._floorId.set(floorId);
    await this.run((isLatest) => this.loadAvailability(isLatest));
  }

  async selectDate(date: string): Promise<void> {
    this._date.set(date);
    await this.run((isLatest) => this.loadAvailability(isLatest));
  }

  /** After a booking: the same floor and day again. */
  async refresh(): Promise<void> {
    await this.run((isLatest) => this.loadAvailability(isLatest));
  }

  private async openBuilding(building: Building, isLatest: () => boolean): Promise<void> {
    this._building.set(building);
    this._date.set(todayIn(building.timeZone));
    this._floors.set([]);
    this._floorId.set(null);
    this._availability.set(null);
    const floors = await firstValueFrom(this.floorsClient.list(building.id));
    if (!isLatest()) return;
    this._floors.set(floors);
    this._floorId.set(floors[0]?.id ?? null);
    await this.loadAvailability(isLatest);
  }

  /** The whole day of the building's calendar, midnight to midnight in its time zone. */
  private async loadAvailability(isLatest: () => boolean): Promise<void> {
    const building = this._building();
    const floorId = this._floorId();
    const date = this._date();
    if (!building || !floorId || !date) {
      this._availability.set(null);
      return;
    }
    const from = zonedToUtc(date, '00:00', building.timeZone).toISOString();
    const to = zonedToUtc(addDays(date, 1), '00:00', building.timeZone).toISOString();
    const availability = await firstValueFrom(this.availabilityClient.forFloor(floorId, from, to));
    if (isLatest()) this._availability.set(availability);
  }

  private async run(load: (isLatest: () => boolean) => Promise<void>): Promise<void> {
    const ticket = ++this.latest;
    const isLatest = () => ticket === this.latest;
    this._loading.set(true);
    this._error.set(null);
    try {
      await load(isLatest);
    } catch (error) {
      if (isLatest()) this._error.set(describe(error));
    } finally {
      if (isLatest()) this._loading.set(false);
    }
  }
}

function describe(error: unknown): string {
  if (error instanceof HttpErrorResponse && error.status === 0) {
    return $localize`:@@bookDesk.err.unreachable:The server is not reachable.`;
  }
  return $localize`:@@bookDesk.err.generic:The places could not be loaded. Please try again.`;
}
