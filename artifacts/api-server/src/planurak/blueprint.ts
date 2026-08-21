import type { ServerBlueprint, DiffAction } from "./types";

export const defaultBlueprint: ServerBlueprint = {
  version: 1,
  style: "community-safe",
  roles: [
    { name: "PLANURAK Staff", color: 0x6d5dfc, hoist: true },
    { name: "Verified", color: 0x36c98f, hoist: false },
  ],
  categories: [
    {
      name: "START HERE",
      channels: [
        { name: "welcome", type: "text", topic: "ยินดีต้อนรับสู่เซิร์ฟเวอร์" },
        { name: "rules", type: "text", topic: "กติกาชุมชน" },
        { name: "verification", type: "text", topic: "กดยืนยันเพื่อเข้าถึงชุมชน" },
      ],
    },
    {
      name: "COMMUNITY",
      channels: [
        { name: "general", type: "text", topic: "พูดคุยทั่วไป" },
        { name: "support", type: "text", topic: "ขอความช่วยเหลือ" },
      ],
    },
    {
      name: "SUPPORT",
      channels: [
        { name: "tickets", type: "text", topic: "เปิด Ticket เพื่อขอความช่วยเหลือ" },
        { name: "announcements", type: "text", topic: "ประกาศสำคัญจากทีมงาน" },
      ],
    },
  ],
};

export function buildDiff(
  blueprint: ServerBlueprint,
  existing: { categories: Set<string>; channels: Set<string>; roles: Set<string> },
): DiffAction[] {
  const actions: DiffAction[] = [];
  for (const category of blueprint.categories) {
    if (!existing.categories.has(category.name)) {
      actions.push({ kind: "create-category", name: category.name });
    }
    for (const channel of category.channels) {
      if (!existing.channels.has(channel.name)) {
        actions.push({
          kind: "create-channel",
          name: channel.name,
          parent: category.name,
          detail: channel.topic,
        });
      }
    }
  }
  for (const role of blueprint.roles) {
    if (!existing.roles.has(role.name)) {
      actions.push({ kind: "create-role", name: role.name });
    }
  }
  return actions;
}