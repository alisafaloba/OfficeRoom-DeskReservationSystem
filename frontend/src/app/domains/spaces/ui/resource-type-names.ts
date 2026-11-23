import { ResourceType } from '@app/spaces/models/resource';

/** Resource types as the editor names them in running text ("No free desk on this floor"). */
export const RESOURCE_TYPE_NAMES: Readonly<Record<ResourceType, string>> = {
  DESK: $localize`:@@resourceType.desk:desk`,
  MEETING_ROOM: $localize`:@@resourceType.meetingRoom:meeting room`,
  PHONE_BOOTH: $localize`:@@resourceType.phoneBooth:phone booth`,
  PARKING_SPOT: $localize`:@@resourceType.parkingSpot:parking spot`,
  BREAK_ROOM: $localize`:@@resourceType.breakRoom:break room`,
};
