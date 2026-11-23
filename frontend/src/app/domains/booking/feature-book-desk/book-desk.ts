import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { BookDeskStore } from '@app/booking/data/book-desk-store';
import { DeskBookingStore } from '@app/booking/data/desk-booking-store';
import { DeskBookingInput } from '@app/booking/models/desk-booking';
import { ResourceAvailability } from '@app/booking/models/floor-availability';
import { localTimeIn } from '@app/booking/util/desk-slots';
import { DeskBookingForm } from '@app/booking/ui/desk-booking-form/desk-booking-form';

/**
 * "Book a desk" (E5.T3): pick a building, a floor and a day, see every place on that floor with
 * its status for the day, and book one in the desk booking dialog.
 *
 * Stand-in until the read-only floor plan viewer (E4.T2) exists: the viewer shows the same
 * statuses on the map and opens the same dialog, after which this list can go or stay as an
 * accessible alternative to the map.
 */
@Component({
  selector: 'app-book-desk',
  imports: [DeskBookingForm],
  providers: [BookDeskStore, DeskBookingStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './book-desk.html',
})
export class BookDesk implements OnInit {
  protected readonly store = inject(BookDeskStore);
  protected readonly booking = inject(DeskBookingStore);

  /** The place whose booking dialog is open. */
  protected readonly selected = signal<ResourceAvailability | null>(null);

  ngOnInit(): void {
    void this.store.load();
    void this.booking.loadSettings();
  }

  protected onBuilding(event: Event): void {
    void this.store.selectBuilding((event.target as HTMLSelectElement).value);
  }

  protected onFloor(event: Event): void {
    void this.store.selectFloor((event.target as HTMLSelectElement).value);
  }

  protected onDate(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value) void this.store.selectDate(value);
  }

  protected canBook(resource: ResourceAvailability): boolean {
    return resource.bookable && resource.status !== 'UNAVAILABLE';
  }

  protected open(resource: ResourceAvailability): void {
    this.booking.reset();
    this.selected.set(resource);
  }

  protected async book(input: DeskBookingInput): Promise<void> {
    if (await this.booking.book(input)) await this.store.refresh();
  }

  protected close(): void {
    this.selected.set(null);
    this.booking.reset();
  }

  /** `HH:mm` on the building's clock. */
  protected time(instant: string): string {
    const building = this.store.building();
    return building ? localTimeIn(instant, building.timeZone) : '';
  }
}
