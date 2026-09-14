import { UserRole } from "@prisma/client";

export type Permission =
  | "event:create"
  | "event:read:any"
  | "event:read:assigned"
  | "participant:manage"
  | "payment:manage"
  | "checkin:manage"
  | "analytics:read"
  | "revenue:read"
  | "system:manage";

const rolePermissions: Record<UserRole, ReadonlySet<Permission>> = {
  SUPER_ADMIN: new Set([
    "event:create", "event:read:any", "event:read:assigned", "participant:manage",
    "payment:manage", "checkin:manage", "analytics:read", "revenue:read", "system:manage",
  ]),
  EVENT_MANAGER: new Set([
    "event:read:assigned", "participant:manage", "payment:manage", "checkin:manage", "analytics:read",
  ]),
  RECEPTION_STAFF: new Set(["event:read:assigned", "checkin:manage"]),
  PARTICIPANT: new Set([]),
};

export function can(role: UserRole, permission: Permission): boolean {
  return rolePermissions[role].has(permission);
}

export function assertPermission(role: UserRole, permission: Permission): void {
  if (!can(role, permission)) throw new Error("FORBIDDEN");
}

export function canAccessEvent(input: {
  role: UserRole;
  userId: string;
  managerId: string;
  assignedUserIds: readonly string[];
}): boolean {
  if (input.role === "SUPER_ADMIN") return true;
  if (input.role === "PARTICIPANT") return false;
  return input.managerId === input.userId || input.assignedUserIds.includes(input.userId);
}
