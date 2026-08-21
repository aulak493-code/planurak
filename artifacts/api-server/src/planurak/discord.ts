import {
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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

async function deployVerificationPanel(guild: import("discord.js").Guild) {
  const verificationChannel = guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildText && channel.name === "verification",
  );
  if (!verificationChannel || verificationChannel.type !== ChannelType.GuildText) return false;
  const panel = new EmbedBuilder()
    .setTitle("ยืนยันตัวตนก่อนเข้าชุมชน")
    .setDescription("กรุณาอ่านกติกาของเซิร์ฟเวอร์ แล้วกดปุ่มด้านล่างเพื่อรับ Role Verified")
    .setColor(0x36c98f);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("planurak:verify")
      .setLabel("ยืนยันตัวตน")
      .setStyle(ButtonStyle.Success),
  );
  await verificationChannel.send({ embeds: [panel], components: [row] });
  return true;
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
    client.once("clientReady", () => logger.info({ user: client.user?.tag }, "PLANURAK Discord bot ready"));
    client.on("interactionCreate", async (interaction) => {
      if (!interaction.guild) return;
      try {
        if (interaction.isButton() && interaction.customId === "planurak:verify") {
          const verifiedRole = interaction.guild.roles.cache.find((role) => role.name === "Verified");
          if (!verifiedRole || !interaction.member || !("roles" in interaction.member) || !("add" in interaction.member.roles)) {
            await interaction.reply({ content: "ยังไม่พบ Role Verified กรุณาให้แอดมินรัน `/planurak apply` อีกครั้ง", flags: MessageFlags.Ephemeral });
            return;
          }
          await interaction.member.roles.add(verifiedRole, "PLANURAK verification");
          await interaction.reply({ content: "ยืนยันสำเร็จแล้ว ยินดีต้อนรับเข้าสู่ชุมชน", flags: MessageFlags.Ephemeral });
          return;
        }
        if (!interaction.isChatInputCommand() || interaction.commandName !== "planurak") return;
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "คำสั่งนี้ใช้ได้เฉพาะผู้ดูแลเซิร์ฟเวอร์", flags: MessageFlags.Ephemeral });
          }
          return;
        }
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === "health") {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "PLANURAK พร้อมทำงาน • สิทธิ์ตรวจสอบผ่าน • Safe mode เปิดอยู่", flags: MessageFlags.Ephemeral });
          }
          return;
        }
        const actions = buildDiff(defaultBlueprint, getExisting(interaction.guild));
        if (subcommand === "preview") {
          const embed = new EmbedBuilder()
            .setTitle("PLANURAK · Blueprint Preview")
            .setDescription(diffText(actions))
            .setFooter({ text: "Preview only — ยังไม่มีการเปลี่ยนแปลง" });
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
          }
          return;
        }
        if (!interaction.replied && !interaction.deferred) {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }
        const created = await applyBlueprint(interaction.guild);
        const panelDeployed = await deployVerificationPanel(interaction.guild);
        await interaction.editReply(`สร้างสำเร็จ ${created} รายการ${panelDeployed ? " และติดตั้ง Verification Panel แล้ว" : ""}\nระบบใช้ idempotent diff และไม่ลบของเดิม`);
      } catch (error) {
        logger.error({ err: error, subcommand: interaction.isChatInputCommand() ? interaction.options.getSubcommand() : "unknown" }, "Discord interaction failed");
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "เกิดข้อผิดพลาดชั่วคราว ระบบยังทำงานต่อและบันทึกเหตุการณ์ไว้แล้ว", flags: MessageFlags.Ephemeral }).catch(() => undefined);
        }
      }
    });
    await client.login(token);
  } catch (error) {
    logger.error({ err: error }, "PLANURAK Discord startup failed; HTTP health server remains available");
  }
}