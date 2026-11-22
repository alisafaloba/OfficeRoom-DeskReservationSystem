export type ResourceType =
  | 'DESK'
  | 'MEETING_ROOM'
  | 'PHONE_BOOTH'
  | 'PARKING_SPOT'
  | 'BREAK_ROOM';

export interface Equipment {
  id: string;
  name: string;
}

export interface Resource {
  id: string;
  floorId: string;
  name: string;
  type: ResourceType;
  capacity: number;
  notes?: string | null;
  status: string;
  bookable: boolean;
  equipment: Equipment[];
  createdAt: string;
}

export interface ResourceInput {
  name: string;
  type: ResourceType;
  capacity?: number | null;
  notes?: string | null;
  equipmentIds?: string[];
}

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  DESK: 'Desk',
  MEETING_ROOM: 'Meeting room',
  PHONE_BOOTH: 'Phone booth',
  PARKING_SPOT: 'Parking spot',
  BREAK_ROOM: 'Break room',
};
