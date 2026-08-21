import {
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { logger } from "../lib/logger";
import { buildDiff, defaultBlueprint } from "./blueprint";

const command = new SlashCommandBuilder()
  .setName("planurak")
  .setDescription("วางแผนและตั้งค่าโครงสร้างเซิร์ฟเวอร์อย่างปลอดภัย")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString())
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub.setName("preview").setDescription("ดูรายการที่จะสร้าง โดยยังไม่เปลี่ยนแปลงเซิร์ฟเวอร์"),
  )
  .addSubcommand((sub) =>
    sub.setName("apply").setDescription("ยืนยันและสร้างเฉพาะสิ่งที่ยังไม่มี"),
  )
  .addSubcommand((sub) =>
    sub.setName("health").setDescription("ตรวจสอบสถานะ PLANURAK"),
  );

async function registerCommand(token: string, clientId: string) {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), { body: [command.toJSON()] });
}

function getExisting(guild: import("discord.js").Guild) {
  return {
    categories: new Set(guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).map((c) => c.name)),
    channels: new Set(guild.channels.cache.filter((c) => c.type !== ChannelType.GuildCategory).map((c) => c.name)),
    roles: new Set(guild.roles.cache.map((r) => r.name)),
  };
}

function diffText(actions: ReturnType<typeof buildDiff>) {
  if (!actions.length) return "โครงสร้างตรงกับ Blueprint แล้ว ไม่มีสิ่งที่ต้องสร้าง";
  return actions
    .slice(0, 25)
    .map((action) => {
      if (action.kind === "create-channel") return `• ช่อง #${action.name} ใน ${action.parent}`;
      if (action.kind === "create-category") return `• หมวด ${action.name}`;
      return `• Role ${action.name}`;
    })
    .join("\n") + (actions.length > 25 ? `\n… และอีก ${actions.length - 25} รายการ` : "");
}

async function applyBlueprint(guild: import("discord.js").Guild) {
  const actions = buildDiff(defaultBlueprint, getExisting(guild));
  for (const action of actions) {
    if (action.kind === "create-category") {
      await guild.channels.create({ name: action.name, type: ChannelType.GuildCategory });
    } else if (action.kind === "create-role") {
      const role = defaultBlueprint.roles.find((item) => item.name === action.name);
      await guild.roles.create({ name: action.name, color: role?.color, hoist: role?.hoist ?? false, reason: "PLANURAK safe blueprint apply" });
    } else {
      const parent = guild.channels.cache.find(
        (channel) => channel.type === ChannelType.GuildCategory && channel.name === action.parent,
      );
      await guild.channels.create({
        name: action.name,
        type: ChannelType.GuildText,
        parent: parent?.id,
        topic: action.detail,
        reason: "PLANURAK safe blueprint apply",
      });
    }
  }
  return actions.length;
}

export async function startDiscordBot() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    logger.warn("DISCORD_TOKEN is not configured; HTTP health server will continue without Discord");
    return;
  }
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    logger.warn("DISCORD_CLIENT_ID is not configured; set it to register /planurak globally");
    return;
  }
  try {
    await registerCommand(token, clientId);
    const client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    });
    client.once("ready", () => logger.info({ user: client.user?.tag }, "PLANURAK Discord bot ready"));
    client.on("interactionCreate", async (interaction) => {
      if (!interaction.isChatInputCommand() || interaction.commandName !== "planurak" || !interaction.guild) return;
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "คำสั่งนี้ใช้ได้เฉพาะผู้ดูแลเซิร์ฟเวอร์", ephemeral: true });
        return;
      }
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === "health") {
        await interaction.reply({ content: "PLANURAK พร้อมทำงาน • สิทธิ์ตรวจสอบผ่าน • Safe mode เปิดอยู่", ephemeral: true });
        return;
      }
      const actions = buildDiff(defaultBlueprint, getExisting(interaction.guild));
      if (subcommand === "preview") {
        const embed = new EmbedBuilder()
          .setTitle("PLANURAK · Blueprint Preview")
          .setDescription(diffText(actions))
          .setFooter({ text: "Preview only — ยังไม่มีการเปลี่ยนแปลง" });
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      const created = await applyBlueprint(interaction.guild);
      await interaction.editReply(`สร้างสำเร็จ ${created} รายการ\nระบบใช้ idempotent diff และไม่ลบของเดิม`);
    });
    await client.login(token);
  } catch (error) {
    logger.error({ err: error }, "PLANURAK Discord startup failed; HTTP health server remains available");
  }
}