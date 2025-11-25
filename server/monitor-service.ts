import type { DiscordBot } from "./discord-bot";
import type { MonitoredBot, ResetLog } from "@shared/schema";
import { storage } from "./storage";
import { uptimeRobotService } from "./uptimerobot";
import { EmbedBuilder } from "discord.js";
import cron from "node-cron";

export class MonitorService {
  private bot: DiscordBot;
  private cronJob: cron.ScheduledTask | null = null;
  private checkInterval: string = "* * * * *"; // ⭐ A cada 1 MINUTO (era */5 * * * *)
  private failureMessages: Map<string, string> = new Map();

  constructor(bot: DiscordBot) {
    this.bot = bot;
  }

  start() {
    console.log("🔄 Iniciando serviço de monitoramento automático...");
    
    this.cronJob = cron.schedule(this.checkInterval, async () => {
      await this.checkAllBots();
    });

    console.log(`✅ Monitoramento automático ativo (intervalo: a cada 1 minuto - VERIFICAÇÃO RÁPIDA)`);
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log("⏸️ Serviço de monitoramento pausado");
    }
  }

  async checkAllBots() {
    try {
      const bots = await storage.getAllBots();
      
      for (const bot of bots) {
        try {
          const health = await uptimeRobotService.checkMonitorHealth(bot.uptimeRobotMonitorId); // ← CORRIGIDO

          if (health.needsReset) {
            console.log(`⚠️ ${bot.name} está com problemas - RESETANDO IMEDIATAMENTE...`);
            
            // 1. Enviar mensagem de ERRO
            await this.sendFailureNotification(bot);
            
            // 2. Resetar IMEDIATAMENTE (sem esperar)
            const resetSuccess = await uptimeRobotService.resetMonitor(bot.uptimeRobotMonitorId); // ← CORRIGIDO
            
            if (resetSuccess) {
              // 3. Aguardar recuperação
              await new Promise(resolve => setTimeout(resolve, 2000));
              

              // 4. Deletar mensagem de erro
              await this.deleteFailureMessage(bot.uptimeRobotMonitorId, bot.notificationChannelId); // ← CORRIGIDO
              
              // 5. Enviar mensagem de SUCESSO
              await this.sendSuccessNotification(bot);
              

              // Log
              await storage.addResetLog({
                botName: bot.name,
                monitorId: bot.uptimeRobotMonitorId, // ← CORRIGIDO
                reason: health.reason,
                success: true,
                timestamp: new Date().toISOString(),
              });
              
              console.log(`✅ ${bot.name} foi resetado automaticamente com sucesso!`);
            } else {
              console.error(`❌ Falha ao resetar ${bot.name}`);
            }
            
            await storage.updateBot(bot.id, {
              lastChecked: new Date().toISOString(),
            });
          }
        } catch (error) {
          console.error(`❌ Erro ao verificar ${bot.name}:`, error);
        }
      }
    } catch (error) {
      console.error("❌ Erro no serviço de monitoramento:", error);
    }
  }

  private async sendFailureNotification(bot: MonitoredBot) {
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("❌ Falha Detectada - Resetando...")
      .setDescription(`⚠️ Falha detectada! O bot está sendo resetado automaticamente.`)
      .addFields(
        { name: "Bot", value: bot.name, inline: false },
        { name: "Ação", value: "🔄 Resetando monitor...", inline: false },
        { name: "Horário", value: new Date().toLocaleString("pt-BR"), inline: false }
      )
      .setTimestamp();

    if (bot.notificationChannelId) {
      try {
        const message = await this.bot.sendNotification(bot.notificationChannelId, embed);
        if (message && message.id) {
          this.failureMessages.set(bot.uptimeRobotMonitorId, message.id); // ← CORRIGIDO
        }
      } catch (error) {
        console.error(`Erro ao enviar notificação de falha para ${bot.name}:`, error);
      }
    }
  }

  private async deleteFailureMessage(monitorId: string, channelId?: string) {
    const messageId = this.failureMessages.get(monitorId);
    
    if (messageId && channelId) {
      try {
        const channel = await this.bot.getClient().channels.fetch(channelId);
        if (channel && channel.isTextBased()) {
          const message = await channel.messages.fetch(messageId);
          await message.delete();
          console.log(`🗑️ Mensagem de erro deletada para ${monitorId}`);
          this.failureMessages.delete(monitorId);
        }
      } catch (error) {
        console.error(`Erro ao deletar mensagem de erro:`, error);
      }
    }
  }

  private async sendSuccessNotification(bot: MonitoredBot) {
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("✅ Bot Reconectado com Sucesso")
      .setDescription(`O monitor foi resetado automaticamente e está funcionando normalmente!`)
      .addFields(
        { name: "Bot", value: bot.name, inline: false },
        { name: "Status", value: "🟢 Online e Operacional", inline: false },
        { name: "Horário da Reconexão", value: new Date().toLocaleString("pt-BR"), inline: false }
      )
      .setTimestamp();

    if (bot.notificationChannelId) {
      try {
        await this.bot.sendNotification(bot.notificationChannelId, embed);
        console.log(`✅ Notificação de sucesso enviada para ${bot.name}`);
      } catch (error) {
        console.error(`Erro ao enviar notificação de sucesso para ${bot.name}:`, error);
      }
    }
  }

  setCheckInterval(interval: string) {
    this.checkInterval = interval;
    
    if (this.cronJob) {
      this.stop();
      this.start();
    }
  }
}
