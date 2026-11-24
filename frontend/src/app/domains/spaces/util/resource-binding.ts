import { BindableElement, isBindable, NewElement, PlanElement, PLAN_DEFAULTS, Point, RESOURCE_TYPE_FOR } from '@app/spaces/models/floor-plan';
import { Resource, ResourceType } from '@app/spaces/models/resource';
import { roundPoint } from '@app/spaces/util/plan-geometry';

type Elements = readonly PlanElement[];

/** Resource types that have a shape on the plan. */
const PLACEABLE = new Set<ResourceType>(Object.values(RESOURCE_TYPE_FOR));

/** Ids of the resources some shape of the plan is bound to. */
export function boundResourceIds(elements: Elements): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const element of elements) {
    if (isBindable(element) && element.resourceId) ids.add(element.resourceId);
  }
  return ids;
}

/** Resources of the floor that have a shape type but no shape on the plan yet, in their given order. */
export function unplacedResources(resources: readonly Resource[], elements: Elements): Resource[] {
  const bound = boundResourceIds(elements);
  return resources.filter((resource) => PLACEABLE.has(resource.type) && !bound.has(resource.id));
}

/** What a shape can be bound to: free resources of the matching type. Already bound ones are hidden. */
export function bindingCandidates(resources: readonly Resource[], elements: Elements, element: BindableElement): Resource[] {
  const type = RESOURCE_TYPE_FOR[element.type];
  return unplacedResources(resources, elements).filter((resource) => resource.type === type);
}

/** The shape bound to `resourceId`, or unbound when it is null. Never mutates. */
export function withBinding<E extends BindableElement>(element: E, resourceId: string | null): E {
  const copy: { resourceId?: string } = { ...element };
  delete copy.resourceId;
  return (resourceId === null ? copy : { ...copy, resourceId }) as E;
}

/** Bindable shapes without a resource: shown marked on the plan and reported when saving. */
export const unboundShapes = (elements: Elements): BindableElement[] =>
  elements.filter((element): element is BindableElement => isBindable(element) && !element.resourceId);

/**
 * Drops bindings that point at no resource of the right type on this floor (deleted since the save),
 * and any second shape bound to a resource another shape already has. The backend would refuse both.
 */
export function withoutStaleBindings(elements: Elements, resources: readonly Resource[]): PlanElement[] {
  const types = new Map(resources.map((resource) => [resource.id, resource.type]));
  const seen = new Set<string>();
  return elements.map((element) => {
    if (!isBindable(element) || !element.resourceId) return element;
    const valid = types.get(element.resourceId) === RESOURCE_TYPE_FOR[element.type] && !seen.has(element.resourceId);
    if (!valid) return withBinding(element, null);
    seen.add(element.resourceId);
    return element;
  });
}

/** Resource id -> name, for the labels the plan shows on bound shapes. */
export const resourceNames = (resources: readonly Resource[]): ReadonlyMap<string, string> =>
  new Map(resources.map((resource) => [resource.id, resource.name]));

/**
 * A new shape for a resource dropped on the plan at `center`, already bound to it; null for a type
 * that has no shape. Rooms start as a default rectangle that the admin then resizes.
 */
export function shapeForResource(resource: Resource, center: Point): NewElement | null {
  const at = roundPoint(center);
  const placed = (size: { readonly width: number; readonly height: number }) => ({
    position: at,
    width: size.width,
    height: size.height,
    rotation: 0,
    resourceId: resource.id,
  });
  const rectangle = () => {
    const { width, height } = PLAN_DEFAULTS.room;
    const left = at.x - width / 2;
    const top = at.y - height / 2;
    return [
      { x: left, y: top },
      { x: left + width, y: top },
      { x: left + width, y: top + height },
      { x: left, y: top + height },
    ];
  };
  switch (resource.type) {
    case 'DESK':
      return { type: 'DESK', ...placed(PLAN_DEFAULTS.desk) };
    case 'PHONE_BOOTH':
      return { type: 'PHONE_BOOTH', ...placed(PLAN_DEFAULTS.phoneBooth) };
    case 'PARKING_SPOT':
      return { type: 'PARKING_SPOT', ...placed(PLAN_DEFAULTS.parkingSpot) };
    case 'MEETING_ROOM':
      return { type: 'ROOM', points: rectangle(), label: resource.name, resourceId: resource.id };
    case 'BREAK_ROOM':
      return { type: 'BREAK_ROOM', points: rectangle(), label: resource.name, resourceId: resource.id };
    default:
      return null;
  }
}
