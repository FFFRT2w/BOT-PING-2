import path from "path";
import fs from "fs/promises";
import type { MonitoredBot, ResetLog } from "@shared/schema";

const DATA_DIR = path.join(process.cwd(), "data");
const BOTS_FILE = path.join(DATA_DIR, "bots.json");
const LOGS_FILE = path.join(DATA_DIR, "logs.json");

export interface IStorage {
  getAllBots(): Promise<MonitoredBot[]>;
  getBot(id: string): Promise<MonitoredBot | null>;
  getBotByAccessCode(code: string): Promise<MonitoredBot | null>;
  addBot(bot: MonitoredBot): Promise<void>;
  updateBot(id: string, updates: Partial<MonitoredBot>): Promise<void>;
  removeBot(id: string): Promise<void>;
  deleteBot(id: string): Promise<boolean>; // ← NOVO
  addResetLog(log: ResetLog): Promise<void>;
  getResetLogs(): Promise<ResetLog[]>;
}

export class FileStorage implements IStorage {
  private bots: MonitoredBot[] = [];
  private logs: ResetLog[] = [];

  constructor() {
    this.loadFromFile();
  }

  private async loadFromFile() {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });

      // Carregar bots
      try {
        const botsData = await fs.readFile(BOTS_FILE, "utf-8");
        this.bots = JSON.parse(botsData);
        console.log(`✅ ${this.bots.length} bot(s) carregado(s) do arquivo`);
      } catch {
        this.bots = [];
        console.log("📝 Nenhum arquivo de bots encontrado, iniciando vazio");
      }

      // Carregar logs
      try {
        const logsData = await fs.readFile(LOGS_FILE, "utf-8");
        this.logs = JSON.parse(logsData);
        console.log(`✅ ${this.logs.length} log(s) carregado(s) do arquivo`);
      } catch {
        this.logs = [];
        console.log("📝 Nenhum arquivo de logs encontrado, iniciando vazio");
      }
    } catch (error) {
      console.error("❌ Erro ao carregar dados do arquivo:", error);
    }
  }

  private async saveBotsToFile() {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(BOTS_FILE, JSON.stringify(this.bots, null, 2));
    } catch (error) {
      console.error("❌ Erro ao salvar bots no arquivo:", error);
    }
  }

  private async saveLogsToFile() {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(LOGS_FILE, JSON.stringify(this.logs, null, 2));
    } catch (error) {
      console.error("❌ Erro ao salvar logs no arquivo:", error);
    }
  }

  async getAllBots(): Promise<MonitoredBot[]> {
    return this.bots;
  }

  async getBot(id: string): Promise<MonitoredBot | null> {
    return this.bots.find((b) => b.id === id) || null;
  }

  async getBotByAccessCode(code: string): Promise<MonitoredBot | null> {
    return this.bots.find((b) => b.accessCode === code) || null;
  }

  async addBot(bot: MonitoredBot): Promise<void> {
    this.bots.push(bot);
    await this.saveBotsToFile();
    console.log(`✅ Bot ${bot.name} adicionado e salvo`);
  }

  async updateBot(id: string, updates: Partial<MonitoredBot>): Promise<void> {
    const index = this.bots.findIndex((b) => b.id === id);
    if (index !== -1) {
      this.bots[index] = { ...this.bots[index], ...updates };
      await this.saveBotsToFile();
      console.log(`✅ Bot ${id} atualizado e salvo`);
    }
  }

  async removeBot(id: string): Promise<void> {
    this.bots = this.bots.filter((b) => b.id !== id);
    await this.saveBotsToFile();
    console.log(`✅ Bot ${id} removido e salvo`);
  }

  async deleteBot(id: string): Promise<boolean> {
    const botIndex = this.bots.findIndex((b) => b.id === id);
    if (botIndex !== -1) {
      this.bots.splice(botIndex, 1);
      await this.saveBotsToFile();
      console.log(`✅ Bot ${id} deletado e salvo`);
      return true;
    }
    return false;
  }

  async addResetLog(log: ResetLog): Promise<void> {
    this.logs.push(log);
    await this.saveLogsToFile();
  }

  async getResetLogs(): Promise<ResetLog[]> {
    return this.logs;
  }
}

export const storage = new FileStorage();
