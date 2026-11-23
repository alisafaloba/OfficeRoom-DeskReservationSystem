export type ResourceType =
  | 'DESK'
  | 'MEETING_ROOM'
  | 'PHONE_BOOTH'
  | 'PARKING_SPOT'
  | 'BREAK_ROOM';

export type ResourceStatus = 'AVAILABLE' | 'MAINTENANCE' | 'RESTRICTED';

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
  status: ResourceStatus;
  statusReason?: string | null;
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

export interface ResourceStatusInput {
  status: ResourceStatus;
  reason?: string | null;
}

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  DESK: $localize`:@@resourceType.desk:Desk`,
  MEETING_ROOM: $localize`:@@resourceType.meetingRoom:Meeting room`,
  PHONE_BOOTH: $localize`:@@resourceType.phoneBooth:Phone booth`,
  PARKING_SPOT: $localize`:@@resourceType.parkingSpot:Parking spot`,
  BREAK_ROOM: $localize`:@@resourceType.breakRoom:Break room`,
};

export const RESOURCE_STATUS_LABELS: Record<ResourceStatus, string> = {
  AVAILABLE: $localize`:@@resourceStatus.available:Available`,
  MAINTENANCE: $localize`:@@resourceStatus.maintenance:Maintenance`,
  RESTRICTED: $localize`:@@resourceStatus.restricted:Restricted`,
};
