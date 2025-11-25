import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  AttachmentBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { storage } from "./storage";
import { uptimeRobotService } from "./uptimerobot";
import { insertMonitoredBotSchema } from "@shared/schema";
import { randomBytes, randomUUID } from "crypto";
import type { MonitoredBot } from "@shared/schema"; // ← ADICIONAR IMPORT

function generateAccessCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

export class DiscordBot {
  private client: Client;
  private rest: REST;
  private token: string;
  private clientId: string;

  constructor(token: string, clientId: string) {
    this.token = token;
    this.clientId = clientId;
    
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
      ],
    });

    this.rest = new REST({ version: "10" }).setToken(token);
  }

  async start() {
    console.log("📝 Registrando comandos do Discord...");
    await this.registerCommands();
    
    console.log("🎧 Configurando event handlers...");
    this.setupEventHandlers();
    
    console.log("🔐 Fazendo login no Discord...");
    await this.client.login(this.token);
    
    console.log("✅ Bot Discord conectado com sucesso!");
  }

  private async registerCommands() {
    const commands = [
      new SlashCommandBuilder()
        .setName("meubot")
        .setDescription("Verificar status e resetar seu bot")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // ← ADICIONAR
      new SlashCommandBuilder()
        .setName("cadastrar")
        .setDescription("Cadastrar um novo bot para monitoramento")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // ← JÁ TEM
      new SlashCommandBuilder()
        .setName("status")
        .setDescription("Ver status de todos os bots cadastrados")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // ← ADICIONAR
      new SlashCommandBuilder()
        .setName("notificacao")
        .setDescription("Configurar canal de notificação")
        .addChannelOption((option) =>
          option
            .setName("canal")
            .setDescription("Canal para notificações")
            .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // ← ADICIONAR
      new SlashCommandBuilder()
        .setName("codigo")
        .setDescription("Gerar novo código de acesso para um bot")
        .addStringOption((option) =>
          option
            .setName("bot_id")
            .setDescription("ID do bot")
            .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // ← ADICIONAR
      new SlashCommandBuilder()
        .setName("remover")
        .setDescription("Remover um bot do monitoramento")
        .addStringOption((option) =>
          option
            .setName("bot_id")
            .setDescription("ID do bot para remover (use /status para ver)")
            .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // ← JÁ TEM
      new SlashCommandBuilder()
        .setName("resetall")
        .setDescription("Resetar todos os monitores de uma vez")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // ← ADICIONAR
    ].map((command) => command.toJSON());

    try {
      console.log("🔄 Registrando comandos slash...");
      await this.rest.put(Routes.applicationCommands(this.clientId), {
        body: commands,
      });
      console.log("✅ Comandos slash registrados!");
    } catch (error) {
      console.error("❌ Erro ao registrar comandos:", error);
    }
  }

  private setupEventHandlers() {
    this.client.on("ready", () => {
      console.log(`🤖 Bot logado como ${this.client.user?.tag}`);
    });

    this.client.on("interactionCreate", async (interaction) => {
      try {
        if (interaction.isChatInputCommand()) {
          await this.handleCommand(interaction);
        } else if (interaction.isButton()) {
          await this.handleButton(interaction);
        } else if (interaction.isModalSubmit()) {
          await this.handleModal(interaction);
        }
      } catch (error) {
        console.error("Erro ao processar interação:", error);
        
        const errorEmbed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("Erro")
          .setDescription("Ocorreu um erro ao processar sua solicitação.");

        if (interaction.isRepliable()) {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
          } else {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
          }
        }
      }
    });
  }

  private async handleCommand(interaction: ChatInputCommandInteraction) {
    const { commandName } = interaction;

    switch (commandName) {
      case "meubot":
        await this.handleMeuBotCommand(interaction);
        break;
      case "cadastrar":
        await this.handleCadastrarCommand(interaction);
        break;
      case "status":
        await this.handleStatusCommand(interaction);
        break;
      case "notificacao":
        await this.handleNotificacaoCommand(interaction);
        break;
      case "codigo":
        await this.handleCodigoCommand(interaction);
        break;
      case "remover":
        await this.handleRemoverCommand(interaction);
        break;
      case "resetall":
        await this.handleResetAllCommand(interaction);
        break;
    }
  }

  private async handleMeuBotCommand(interaction: ChatInputCommandInteraction) {
    // Responder de forma efêmera (só o usuário vê) para confirmar
    await interaction.reply({ content: "✅ Mensagem enviada!", ephemeral: true });
    
    const customMessage = interaction.options.getString("mensagem");
    const attachment = interaction.options.getAttachment("anexo");
    const useEmbed = interaction.options.getBoolean("embed") ?? true; // padrão: true
    
    // Botão de verificar saúde (obrigatório)
    const checkHealthButton = new ButtonBuilder()
      .setCustomId("check_health")
      .setLabel("verificar saude do meu bot")
      .setStyle(ButtonStyle.Primary);

    // Botão de resetar monitor (opcional)
    const resetMonitorButton = new ButtonBuilder()
      .setCustomId("reset_monitor")
      .setLabel("resetar monitor")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(checkHealthButton, resetMonitorButton);

    // Processar quebras de linha
    let messageText = customMessage 
      ? customMessage.replace(/\\n/g, '\n')
      : "Clique nos botões abaixo para verificar o status do seu bot ou resetar o monitor.";

    const messageOptions: any = {
      components: [row],
    };

    if (useEmbed) {
      // Usar embed
      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle("Verificação de Status do Bot")
        .setDescription(messageText)
        .setTimestamp();

      messageOptions.embeds = [embed];

      // Se houver anexo, fazer re-upload para garantir confiabilidade
      if (attachment) {
        try {
          const response = await fetch(attachment.url);
          const buffer = Buffer.from(await response.arrayBuffer());
          
          const attachmentBuilder = new AttachmentBuilder(buffer, { 
            name: attachment.name,
            description: attachment.description || undefined,
          });
          
          messageOptions.files = [attachmentBuilder];
          
          // Se for imagem, também adicionar à embed
          if (attachment.contentType?.startsWith('image/')) {
            embed.setImage(`attachment://${attachment.name}`);
          } else if (attachment.contentType?.startsWith('video/')) {
            embed.addFields({ 
              name: "Vídeo Anexado", 
              value: `\`${attachment.name}\` (${(attachment.size / 1024 / 1024).toFixed(2)}MB)` 
            });
          }
        } catch (error) {
          console.error("Erro ao processar anexo:", error);
          embed.setFooter({ text: `Anexo: ${attachment.name} (erro ao carregar)` });
        }
      }
    } else {
      // Mensagem de texto simples (sem embed)
      messageOptions.content = messageText;

      // Se houver anexo, fazer re-upload
      if (attachment) {
        try {
          const response = await fetch(attachment.url);
          const buffer = Buffer.from(await response.arrayBuffer());
          
          const attachmentBuilder = new AttachmentBuilder(buffer, { 
            name: attachment.name,
            description: attachment.description || undefined,
          });
          
          messageOptions.files = [attachmentBuilder];
        } catch (error) {
          console.error("Erro ao processar anexo:", error);
        }
      }
    }

    // Enviar mensagem como o bot no canal
    await interaction.channel?.send(messageOptions);
  }

  private async handleCadastrarCommand(interaction: ChatInputCommandInteraction) {
    const modal = new ModalBuilder()
      .setCustomId("cadastrar_bot")
      .setTitle("Cadastrar Novo Bot");

    const nameInput = new TextInputBuilder()
      .setCustomId("bot_name")
      .setLabel("Nome do seu bot")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Ex: Meu Bot Discord")
      .setRequired(true);

    const urlInput = new TextInputBuilder()
      .setCustomId("monitor_url")
      .setLabel("URL do monitor")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("https://...")
      .setRequired(true);

    const monitorIdInput = new TextInputBuilder()
      .setCustomId("monitor_id")
      .setLabel("ID do monitor no UptimeRobot")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("123456789")
      .setRequired(true);

    const channelIdInput = new TextInputBuilder()
      .setCustomId("channel_id")
      .setLabel("Canal para notificações (ID) - Opcional")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("123456789012345678")
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(urlInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(monitorIdInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(channelIdInput)
    );

    await interaction.showModal(modal);
  }

  private async handleNotificacaoCommand(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const botId = interaction.options.getString("bot_id", true);
    const channel = interaction.options.getChannel("canal", true);

    const bot = await storage.getBot(botId);

    if (!bot) {
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("Bot Não Encontrado")
        .setDescription(`Não foi encontrado nenhum bot com ID \`${botId}\`.\n\nUse \`/status\` para ver os IDs dos bots cadastrados.`);

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (!channel.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("Canal Inválido")
        .setDescription("O canal selecionado não é um canal de texto.");

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    await storage.updateBot(botId, { notificationChannelId: channel.id });

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("✅ Canal de Notificações Configurado")
      .setDescription(`As notificações do bot **${bot.name}** serão enviadas para ${channel}.`)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }

  private async handleCodigoCommand(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const botId = interaction.options.getString("bot_id", true);
    const regenerar = interaction.options.getBoolean("regenerar") || false;

    const bot = await storage.getBot(botId);

    if (!bot) {
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("Bot Não Encontrado")
        .setDescription(`Não foi encontrado nenhum bot com ID \`${botId}\`.\n\nUse \`/status\` para ver os IDs dos bots cadastrados.`);

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    let accessCode = bot.accessCode;
    let isNew = false;

    if (!accessCode || regenerar) {
      accessCode = generateAccessCode();
      await storage.updateBot(botId, { accessCode });
      isNew = true;
    }

    const embed = new EmbedBuilder()
      .setColor(isNew ? 0x2ecc71 : 0x3498db)
      .setTitle(isNew ? "✅ Novo Código Gerado" : "🔑 Código de Acesso")
      .setDescription(`**Bot:** ${bot.name}`)
      .addFields({
        name: "Código de Acesso",
        value: `\`${accessCode}\``,
        inline: false,
      });

    if (isNew) {
      embed.setFooter({ text: "Compartilhe este código com o cliente para acesso ao bot" });
    } else {
      embed.setFooter({ text: "Use /codigo com regenerar:sim para criar um novo código" });
    }

    embed.setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }

  private async handleRemoverCommand(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const botId = interaction.options.getString("bot_id", true);

    const bot = await storage.getBot(botId);

    if (!bot) {
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("Bot Não Encontrado")
        .setDescription(`Não foi encontrado nenhum bot com ID \`${botId}\`.\n\nUse \`/status\` para ver os IDs dos bots cadastrados.`);

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Remover o bot
    const deleted = await storage.deleteBot(botId);

    if (deleted) {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("✅ Bot Removido com Sucesso")
        .setDescription(`O bot **${bot.name}** foi removido do monitoramento.`)
        .addFields(
          { name: "ID do Bot", value: `\`${bot.id}\``, inline: true },
          { name: "Monitor ID", value: bot.uptimeRobotMonitorId, inline: true },
          { name: "URL", value: bot.monitorUrl, inline: false }
        )
        .setFooter({ text: "O monitoramento automático deste bot foi desativado" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else {
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("Erro ao Remover Bot")
        .setDescription("Ocorreu um erro ao tentar remover o bot. Tente novamente.");

      await interaction.editReply({ embeds: [embed] });
    }
  }

  private async handleStatusCommand(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const bots = await storage.getAllBots();

    if (bots.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle("Nenhum Bot Cadastrado")
        .setDescription(
          "Use `/cadastrar` para adicionar bots ao monitoramento."
        );

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("Bots Monitorados")
      .setDescription(`Total de bots cadastrados: ${bots.length}`)
      .setTimestamp();

    for (const bot of bots) {
      const healthCheck = await uptimeRobotService.checkMonitorHealth(
        bot.uptimeRobotMonitorId
      );

      const statusEmoji = {
        2: "✅",
        8: "⚠️",
        9: "❌",
        0: "⏸️",
        1: "🔄",
      }[healthCheck.status] || "❓";

      embed.addFields({
        name: `${statusEmoji} ${bot.name}`,
        value: `**Status:** ${healthCheck.reason}\n**ID:** \`${bot.id}\`\n**Monitor ID:** \`${bot.uptimeRobotMonitorId}\`\n**Código:** \`${bot.accessCode || 'N/A'}\``,
        inline: true,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  }

  private async handleButton(interaction: ButtonInteraction) {
    if (interaction.customId === "check_health") {
      const modal = new ModalBuilder()
        .setCustomId("check_bot_health")
        .setTitle("Verificar Status do Bot");

      const codigoInput = new TextInputBuilder()
        .setCustomId("access_code")
        .setLabel("Código de Acesso")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Digite seu código de acesso")
        .setRequired(true)
        .setMaxLength(8);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(codigoInput)
      );

      await interaction.showModal(modal);
    } else if (interaction.customId === "reset_monitor") {
      // ✅ NOVO: Botão de resetar monitor
      const modal = new ModalBuilder()
        .setCustomId("reset_monitor_modal")
        .setTitle("Resetar Monitor");

      const botIdInput = new TextInputBuilder()
        .setCustomId("reset_bot_id")
        .setLabel("ID do Bot")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Digite o ID do bot")
        .setRequired(true);

      const securityCodeInput = new TextInputBuilder()
        .setCustomId("reset_security_code")
        .setLabel("Código de Segurança")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Digite seu código de acesso")
        .setRequired(true)
        .setMaxLength(8);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(botIdInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(securityCodeInput)
      );

      await interaction.showModal(modal);
    }
  }

  private async handleModal(interaction: ModalSubmitInteraction) {
    if (interaction.customId === "check_bot_health") {
      await interaction.deferReply({ ephemeral: true });

      const codigo = interaction.fields.getTextInputValue("access_code").trim().toUpperCase();

      const bot = await storage.getBotByAccessCode(codigo);

      if (!bot) {
        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("Código Inválido")
          .setDescription("Código de acesso não encontrado. Verifique se digitou corretamente ou entre em contato com o administrador.");

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      try {
        const healthCheck = await uptimeRobotService.checkMonitorHealth(bot.uptimeRobotMonitorId);

        const statusEmoji = {
          2: "✅",
          8: "⚠️",
          9: "❌",
          0: "⏸️",
          1: "🔄",
        }[healthCheck.status] || "❓";

        const statusColor = {
          2: 0x2ecc71,
          8: 0xf39c12,
          9: 0xe74c3c,
          0: 0x95a5a6,
          1: 0x3498db,
        }[healthCheck.status] || 0x7f8c8d;

        const embed = new EmbedBuilder()
          .setColor(statusColor)
          .setTitle(`${statusEmoji} Status do ${bot.name}`)
          .setDescription(healthCheck.reason)
          .addFields(
            { name: "URL Monitorada", value: bot.monitorUrl, inline: false },
            { name: "Última Verificação", value: new Date().toLocaleString("pt-BR"), inline: false }
          )
          .setFooter({ text: "O sistema verifica automaticamente a cada 5 minutos" })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error("Erro ao verificar saúde do bot:", error);
        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("Erro ao Verificar Status")
          .setDescription("Ocorreu um erro ao verificar o status do bot. Tente novamente em alguns instantes.");

        await interaction.editReply({ embeds: [embed] });
      }
    } else if (interaction.customId === "reset_monitor_modal") {
      // ✅ NOVO: Processar reset do monitor
      await interaction.deferReply({ ephemeral: true });

      const botId = interaction.fields.getTextInputValue("reset_bot_id").trim();
      const securityCode = interaction.fields.getTextInputValue("reset_security_code").trim().toUpperCase();

      // 1. Validar o código de segurança
      const bot = await storage.getBot(botId);

      if (!bot) {
        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("❌ Bot Não Encontrado")
          .setDescription(`Não foi encontrado nenhum bot com ID \`${botId}\`.`);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (bot.accessCode !== securityCode) {
        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("❌ Código de Segurança Inválido")
          .setDescription("O código de segurança fornecido é inválido. Verifique e tente novamente.");

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      try {
        // 2. Resetar o monitor
        console.log(`🔄 Resetando monitor ${bot.uptimeRobotMonitorId} manualmente...`);
        const resetSuccess = await uptimeRobotService.resetMonitor(bot.uptimeRobotMonitorId);

        if (resetSuccess) {
          // 3. Aguardar o monitor se recuperar
          await new Promise(resolve => setTimeout(resolve, 2000));

          // 4. Enviar mensagem de sucesso (oculta/ephemeral)
          const embed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle("✅ Monitor Resetado com Sucesso")
            .setDescription(`O monitor do **${bot.name}** foi resetado manualmente e está funcionando normalmente agora.`)
            .addFields(
              { name: "Bot", value: bot.name, inline: true },
              { name: "Status", value: "🟢 Online", inline: true },
              { name: "Horário da Reconexão", value: new Date().toLocaleString("pt-BR"), inline: false }
            )
            .setFooter({ text: "Mensagem visível apenas para você" })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });

          // 5. Registrar no log
          await storage.addResetLog({
            botName: bot.name,
            monitorId: bot.uptimeRobotMonitorId,
            reason: "Reset manual via comando /meubot",
            success: true,
            timestamp: new Date().toISOString(),
          });

          console.log(`✅ Monitor ${bot.uptimeRobotMonitorId} resetado manualmente com sucesso`);
        } else {
          const embed = new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Erro ao Resetar Monitor")
            .setDescription("Ocorreu um erro ao tentar resetar o monitor. Tente novamente em alguns instantes.");

          await interaction.editReply({ embeds: [embed] });
        }
      } catch (error) {
        console.error("Erro ao resetar monitor:", error);
        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("❌ Erro ao Resetar Monitor")
          .setDescription(`Ocorreu um erro: ${error instanceof Error ? error.message : "Erro desconhecido"}`);

        await interaction.editReply({ embeds: [embed] });
      }
    } else if (interaction.customId === "cadastrar_bot") {
      await interaction.deferReply({ ephemeral: true });

      const botName = interaction.fields.getTextInputValue("bot_name").trim();
      const monitorId = interaction.fields.getTextInputValue("monitor_id").trim();
      const monitorUrl = interaction.fields.getTextInputValue("monitor_url").trim();
      const notificationChannelId = interaction.fields.getTextInputValue("channel_id").trim() || "";

      // Criar objeto do bot com a tipagem correta
      const newBot = {
        id: randomUUID(),
        name: botName,
        uptimeRobotMonitorId: monitorId,
        monitorUrl: monitorUrl,
        notificationChannelId: notificationChannelId,
        accessCode: generateAccessCode(),
        createdAt: new Date().toISOString(),
        lastChecked: new Date().toISOString(),
      };

      // Salvar no storage
      await storage.addBot(newBot);

      // ✅ Verificar saúde IMEDIATAMENTE após cadastrar
      console.log(`🔍 Verificando saúde do novo bot ${botName}...`);
      
      try {
        const health = await uptimeRobotService.checkMonitorHealth(monitorId);
        
        // Se já está com falha, resetar IMEDIATAMENTE
        if (health.needsReset && notificationChannelId) {
          console.log(`⚠️ Novo bot ${botName} detectado com problemas - RESETANDO IMEDIATAMENTE...`);
          
          // Enviar notificação de falha
          const failureEmbed = new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("⚠️ Falha Detectada ao Cadastrar")
            .setDescription(`O novo bot **${botName}** foi detectado com problemas e está sendo resetado automaticamente.`)
            .addFields(
              { name: "Bot", value: botName, inline: false },
              { name: "Motivo", value: health.reason, inline: false },
              { name: "Ação", value: "🔄 Resetando monitor...", inline: false }
            )
            .setTimestamp();

          try {
            await this.sendNotification(notificationChannelId, failureEmbed);
          } catch (error) {
            console.error("Erro ao enviar notificação de falha:", error);
          }

          // Resetar o monitor
          const resetSuccess = await uptimeRobotService.resetMonitor(monitorId);
          
          if (resetSuccess) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Enviar sucesso
            const successEmbed = new EmbedBuilder()
              .setColor(0x2ecc71)
              .setTitle("✅ Bot Reconectado com Sucesso")
              .setDescription(`O monitor do **${botName}** foi resetado automaticamente ao ser cadastrado.`)
              .addFields(
                { name: "Bot", value: botName, inline: false },
                { name: "Status", value: "🟢 Online e Operacional", inline: false }
              )
              .setTimestamp();

            try {
              await this.sendNotification(notificationChannelId, successEmbed);
            } catch (error) {
              console.error("Erro ao enviar notificação de sucesso:", error);
            }

            // Log
            await storage.addResetLog({
              botName: botName,
              monitorId: monitorId,
              reason: `Reset ao cadastrar - ${health.reason}`,
              success: true,
              timestamp: new Date().toISOString(),
            });

            console.log(`✅ Novo bot ${botName} foi resetado com sucesso ao cadastrar`);
          }
        } else {
          console.log(`✅ Novo bot ${botName} está funcionando normalmente`);
        }
      } catch (error) {
        console.error(`Erro ao verificar novo bot ${botName}:`, error);
      }

      // Enviar resposta de confirmação para o usuário
      const confirmEmbed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("✅ Bot Cadastrado com Sucesso")
        .addFields(
          { name: "Nome", value: botName, inline: false },
          { name: "Monitor ID", value: monitorId, inline: false },
          { name: "Código de Acesso", value: `\`${newBot.accessCode}\``, inline: false },
          { name: "Canal de Notificação", value: notificationChannelId ? `<#${notificationChannelId}>` : "Não configurado", inline: false }
        )
        .setFooter({ text: "Guarde o código de acesso em um local seguro!" })
        .setTimestamp();

      await interaction.editReply({ embeds: [confirmEmbed] });
    }
  }

  private async handleResetAllCommand(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const bots = await storage.getAllBots();

    if (bots.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle("Nenhum Bot Cadastrado")
        .setDescription("Não há bots para resetar. Use `/cadastrar` para adicionar bots ao monitoramento.");

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("🔄 Resetando Todos os Monitores...")
      .setDescription(`Processando reset de ${bots.length} monitor(es). Por favor, aguarde...`)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    const results = {
      success: [] as string[],
      failed: [] as { name: string; reason: string }[],
    };

    // Resetar todos os monitores
    for (const bot of bots) {
      try {
        console.log(`🔄 Resetando monitor ${bot.uptimeRobotMonitorId} (${bot.name})...`); // ← CORRIGIDO
        const resetSuccess = await uptimeRobotService.resetMonitor(bot.uptimeRobotMonitorId); // ← CORRIGIDO

        if (resetSuccess) {
          results.success.push(bot.name);
          
          // Registrar no log
          await storage.addResetLog({
            botName: bot.name,
            monitorId: bot.uptimeRobotMonitorId, // ← CORRIGIDO
            reason: "Reset em lote via comando /resetall",
            success: true,
            timestamp: new Date().toISOString(),
          });

          console.log(`✅ Monitor ${bot.uptimeRobotMonitorId} resetado com sucesso`); // ← CORRIGIDO
        } else {
          results.failed.push({
            name: bot.name,
            reason: "Falha ao resetar no UptimeRobot",
          });

          // Registrar falha no log
          await storage.addResetLog({
            botName: bot.name,
            monitorId: bot.uptimeRobotMonitorId, // ← CORRIGIDO
            reason: "Reset em lote via /resetall - FALHOU",
            success: false,
            timestamp: new Date().toISOString(),
          });

          console.error(`❌ Falha ao resetar monitor ${bot.uptimeRobotMonitorId}`); // ← CORRIGIDO
        }

        // Aguardar um pouco entre resets para não sobrecarregar
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        results.failed.push({
          name: bot.name,
          reason: error instanceof Error ? error.message : "Erro desconhecido",
        });

        console.error(`❌ Erro ao resetar ${bot.name}:`, error);
      }
    }

    // Montar resposta final
    const resultEmbed = new EmbedBuilder()
      .setColor(results.failed.length === 0 ? 0x2ecc71 : results.success.length === 0 ? 0xe74c3c : 0xf39c12)
      .setTitle("✅ Reset em Lote Concluído")
      .setTimestamp();

    // Adicionar sucessos
    if (results.success.length > 0) {
      resultEmbed.addFields({
        name: `✅ Resetados com Sucesso (${results.success.length})`,
        value: results.success.map(name => `• ${name}`).join("\n"),
        inline: false,
      });
    }

    // Adicionar falhas
    if (results.failed.length > 0) {
      resultEmbed.addFields({
        name: `❌ Falharam (${results.failed.length})`,
        value: results.failed.map(f => `• ${f.name}: ${f.reason}`).join("\n"),
        inline: false,
      });
    }

    // Resumo
    resultEmbed.addFields({
      name: "📊 Resumo",
      value: `**Processados:** ${bots.length}\n**Sucesso:** ${results.success.length}\n**Falhas:** ${results.failed.length}`,
      inline: false,
    });

    resultEmbed.setFooter({ text: "Todos os resets foram registrados em log" });

    await interaction.editReply({ embeds: [resultEmbed] });
  }

  async sendNotification(channelId: string, embed: EmbedBuilder) {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel?.isTextBased() && "send" in channel) {
        return await channel.send({ embeds: [embed] }); // ← RETORNA A MENSAGEM
      }
    } catch (error) {
      console.error("Erro ao enviar notificação:", error);
    }
  }

  getClient() {
    return this.client;
  }
}
