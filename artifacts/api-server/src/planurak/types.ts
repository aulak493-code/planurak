export type BlueprintChannel = {
  name: string;
  type: "text" | "voice";
  topic?: string;
  private?: boolean;
};

export type BlueprintCategory = {
  name: string;
  channels: BlueprintChannel[];
};

export type BlueprintRole = {
  name: string;
  color?: number;
  hoist?: boolean;
};

export type ServerBlueprint = {
  version: 1;
  style: string;
  categories: BlueprintCategory[];
  roles: BlueprintRole[];
};

export type DiffAction = {
  kind: "create-category" | "create-channel" | "create-role";
  name: string;
  parent?: string;
  detail?: string;
};