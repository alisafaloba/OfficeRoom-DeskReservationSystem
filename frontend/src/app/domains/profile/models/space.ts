export interface Desk {
  readonly id: string;
  readonly label: string;
}

export interface Floor {
  readonly name: string;
  readonly desks: readonly Desk[];
}

export interface Building {
  readonly name: string;
  readonly floors: readonly Floor[];
}
