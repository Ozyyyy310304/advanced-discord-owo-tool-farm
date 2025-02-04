import { Client, Collection, CollectorFilter, Message, TextChannel } from "discord.js-selfbot-v13";
import { getRandom, loadQuestCommand, mapInt, ranInt, shuffleArray, timeHandler } from "../utils/utils.js";
import { AgentOptions, CommandCondition, Commands, Configuration, SendOptions } from "../typings/typings.js";
import { logger } from "../utils/logger.js";
import { quotes } from "../typings/quotes.js";
import { loadPresence } from "../feats/presence.js";
import { owoHandler } from "../handler/owoHandler.js";
import { loadCommands } from "../feats/command.js";
import { commandHandler } from "../handler/commandHandler.js";
import { dmsHandler } from "../handler/dmsHandler.js";
import { loadSweeper } from "../feats/sweeper.js";
import { getQuestReward, processQuestLogs } from "../feats/quest.js";
import actions from "../actions/index.js";
//Sorry boss, i need to do that
export class BaseAgent extends Client {
  public config!: Configuration;
  public cache!: Configuration;
  public activeChannel!: TextChannel;

  totalCommands = 0;
  totalTexts = 0;
  totalCaptcha = {
    resolved: 0,
    unsolved: 0
  };

  owoID = "408785106942164992";
  prefix = "owo";

  owoCommands = shuffleArray([...Array<string>(5).fill("HUNT"), ...Array<string>(5).fill("BATTLE")]) as Array<
    "HUNT" | "BATTLE"
  >;
  questCommands = <CommandCondition[]>[];

  commands: Collection<string, Commands> = new Collection();
  captchaDetected = false;
  paused = false;

  coutChannel = ranInt(17, 51);
  coutSleep = ranInt(38, 92);

  lastTime = 0;
  sleepTime = mapInt(this.coutSleep, 38, 92, 150_000, 1_000_000);
  reloadTime = new Date().setUTCHours(24, ranInt(0, 30), ranInt(0, 59));

  toutOther = 0;
  toutPray = 0;

  inventory = <string[]>[];
  gem1?: number[];
  gem2?: number[];
  gem3?: number[];

  RETAINED_USERS_IDS = [this.owoID];

  constructor({ options }: AgentOptions = {}) {
    super(options);
  }

  public registerEvents = () => {
    this.once("ready", async () => {
      logger.info("Logged in as " + this.user?.displayName);

      if (this.config.adminID) this.RETAINED_USERS_IDS.push(this.config.adminID);
      loadSweeper(this);

      if (this.config.showRPC) loadPresence(this);
      if (this.config.prefix) this.commands = await loadCommands();

      this.activeChannel = this.channels.cache.get(this.config.channelID[0]) as TextChannel;

      logger.info(`Loaded ${this.commands.size} commands`);
      logger.info(`Running on channel: ${this.activeChannel.name}`);

      if (this.config.channelID.length > 1) logger.info(`Next channel change after: ${this.coutChannel} commands`);
      if (this.config.autoSleep)
        logger.info(`Next sleep after: ${this.coutSleep} commands (Duration: ${timeHandler(0, this.sleepTime, true)})`);
      if (this.config.autoReload)
        logger.info(`Next config reload time: ${timeHandler(Date.now(), this.reloadTime, true)}`);

      this.main();
    });
    owoHandler(this);
    commandHandler(this);
    dmsHandler(this);
  };

  public checkAccount = (token?: string): Promise<Client> => {
    return new Promise((resolve, reject) => {
      logger.info("Checking account...");
      this.once("ready", () => {
        resolve(this);
      });
      try {
        token ? this.login(token) : this.QRLogin();
      } catch (error) {
        reject(error);
      }
    });
  };

  public send = async (
    message: string,
    { withPrefix = true, channel = this.activeChannel, delay = ranInt(120, 1600) }: SendOptions = {}
  ) => {
    if (this.captchaDetected || this.paused) return;

    if (delay) await this.sleep(delay);
    if (withPrefix) message = [this.prefix, message].join(" ");
    await channel.send(message).catch((e) => logger.error(e));
    if (withPrefix) logger.sent(message);
    withPrefix ? this.totalCommands++ : this.totalTexts++;

    if (this.config.autoQuest) {
      this.activeChannel
        .createMessageCollector({
          filter: (m) =>
            m.author.id == this.owoID &&
            m.content.includes(m.client.user?.username!) &&
            m.content.includes("You finished a quest"),
          max: 1,
          time: 15_000
        })
        .once("collect", async (m) => {
          logger.debug(m.content);
          logger.debug("Quest completed! Reloading...");
          logger.info("Quest completed! Reward:" + getQuestReward(m.content.split("earned: ")[1]));

          logger.info("Deloading " + this.questCommands.length + " temporary features");

          this.questCommands = [];
          this.config.autoQuest = this.cache.autoQuest;
          this.config.autoQuote = this.cache.autoQuote;
        });
    }

    await this.sleep(ranInt(4800, 6200));
  };

  public aReload = async (force = false) => {
    try {
      this.reloadTime = new Date().setUTCHours(24, ranInt(0, 30), ranInt(0, 59), ranInt(0, 1000));
      [this.gem1, this.gem2, this.gem3] = Array<undefined>(3).fill(undefined);
      this.config = structuredClone(this.cache);
      logger.info(`Config Reloaded, Next config reload time: ${timeHandler(Date.now(), this.reloadTime, true)}`);
      return true;
    } catch (error) {
      logger.error(`Failed to reload config: ${error}`);
      return false;
    }
  };

  public cChannel = async () => {
    this.activeChannel = this.channels.cache.get(
      this.config.channelID[ranInt(0, this.config.channelID.length)]
    ) as TextChannel;
    this.coutChannel += ranInt(17, 51);

    logger.info(`Switched to channel: ${this.activeChannel.name}`);
    logger.info(`Next channel change after: ${this.coutChannel} commands`);
  };

  public aSleep = async () => {
    logger.info("Sleeping for: " + timeHandler(0, this.sleepTime, true));
    await this.sleep(this.sleepTime);

    const nextShift = ranInt(38, 92);
    this.coutSleep += nextShift;
    this.sleepTime = mapInt(nextShift, 38, 92, 150_000, 1_000_000);

    logger.info(`Next sleep after: ${nextShift} commands (Duration: ${timeHandler(0, this.sleepTime, true)})`);
  };

  ////////////////////////// QUEST COMMANDS SESSION //////////////////////////

  private aGamble = () => {
    switch (ranInt(0, 2)) {
      case 0:
        return this.send("slots");
      case 1:
        return this.send("coinflip" + ["head", "tail"][ranInt(0, 2)]);
    }
  };

  private aAction = () => {
    const actionCommands = [
      "cuddle",
      "hug",
      "kiss",
      "lick",
      "nom",
      "pat",
      "poke",
      "slap",
      "stare",
      "highfive",
      "bite",
      "greet",
      "punch",
      "handholding",
      "tickle",
      "kill",
      "hold",
      "pats",
      "wave",
      "boop",
      "snuggle",
      "bully"
    ];

    return this.send(`${actionCommands[ranInt(0, actionCommands.length)]} <@${this.owoID}>`);
  };

  ////////////////////// END OF QUEST COMMANDS SESSION ///////////////////////

  // TODO: Implement aQuest
  public aQuest = async () => {
    this.send("quest");
    const filter: CollectorFilter<[Message<boolean>]> = (m) =>
      m.author.id == this.owoID &&
      m.embeds.length > 0 &&
      ((m.embeds[0].author?.name.includes(m.guild?.members.me?.displayName!) &&
        Boolean(m.embeds[0].author?.name.includes("Quest Log"))) ||
        Boolean(m.embeds[0].description?.includes(m.client.user?.id!)));
    this.activeChannel
      .createMessageCollector({
        filter,
        max: 1,
        time: 15_000
      })
      .once("collect", async (m) => {
        const description = m.embeds[0].description;
        if (!description) return logger.error("Cannot retrieve Quest Log");

        this.config.autoQuest = false;

        if (description.includes("You finished all of your quests!")) {
          logger.info("Empty Quest Log! " + (m.embeds[0].footer?.text ?? "Skipping..."));
          return;
        }

        const quests = processQuestLogs(description);
        const supportedQuests = quests.filter((q) => q != "unsupported");

        if (supportedQuests.length === 0) {
          logger.info("No supported quests found! Skipping...");
          return;
        }

        logger.info(`${quests.length} quests found: ${supportedQuests.length} supported`);

        if (supportedQuests.includes("gamble")) {
          logger.debug("Temporarily enabling gamble for quest completion");
          this.questCommands.push(loadQuestCommand(this.aGamble));
        }

        if (supportedQuests.includes("action")) {
          logger.debug("Temporarily enabling action for quest completion");
          this.questCommands.push(loadQuestCommand(this.aAction));
        }

        if (supportedQuests.includes("owo") && !this.config.autoQuote.includes("owo")) {
          logger.debug("Temporarily enabling owo for quest completion");
          this.config.autoQuote.push("owo");
        }

        logger.info(this.questCommands.length + " features temporarily enabled for quest completion");
      });
  };

  // TODO: Implement aChecklist
  public aChecklist = async () => {
    this.send("checklist");
    const filter: CollectorFilter<[Message<boolean>]> = (m) =>
      m.author.id == this.owoID &&
      m.embeds.length > 0 &&
      (m.embeds[0].author?.name.includes(m.guild?.members.me?.displayName!) ?? false) &&
      (m.embeds[0].author?.name.includes("Checklist") ?? false);
    this.activeChannel
      .createMessageCollector({
        filter,
        max: 1,
        time: 15_000
      })
      .once("collect", async (m) => {});
  };

  createCollector = async (filter: (msg: Message<boolean>) => boolean) => {
    return await new Promise<Message<boolean> | void>((resolve) => {
      this.activeChannel
        .createMessageCollector({ filter, max: 1, time: 15_000 })
        .once("collect", async (msg) => {
          resolve(msg);
        })
        .once("end", (col) => {
          if (col.size === 0) resolve();
        });
    });
  };
  public main = async () => {
    if (this.captchaDetected || this.paused) return;
    let commands: CommandCondition[] = [
      {
        condition: () => this.config.autoPray.length > 0 && Date.now() - this.toutPray >= 360_000,
        action: actions.autoPray.bind(this)
      },
      {
        condition: () => this.config.autoDaily,
        action: actions.autoDaily.bind(this)
      },
      {
        condition: () => this.config.autoOther.length > 0 && Date.now() - this.toutOther >= 60_000,
        action: actions.autoOther.bind(this)
      },
      {
        condition: () => this.config.autoSleep && this.totalCommands >= this.coutSleep,
        action: this.aSleep
      },
      {
        condition: () => this.config.channelID.length > 1 && this.totalCommands >= this.coutChannel,
        action: this.cChannel
      },
      {
        condition: () => this.config.autoReload && Date.now() > this.reloadTime,
        action: this.aReload
      },
      {
        condition: () => this.config.autoQuote.length > 0,
        action: actions.autoQuote.bind(this)
      },
      {
        condition: () => this.config.autoCookie,
        action: actions.autoCookie.bind(this)
      },
      {
        condition: () => this.config.autoClover,
        action: actions.autoClover.bind(this)
      }
    ];

    commands = shuffleArray(commands.concat(this.questCommands));

    // console.log(Object.keys(this.config).map(k => ({ [k]: [this.cache[k], this.config[k]] })))
    for (const command of commands) {
      if (this.captchaDetected || this.paused) return;

      if (Date.now() - this.lastTime > 15_000) await actions.autoOrdinary.bind(this)();

      if (command.condition()) {
        await command.action();

        const delay = ranInt(15000, 22000) / commands.length;
        await this.sleep(ranInt(delay - 3000, delay + 2400));
      } else {
        await this.sleep(ranInt(2000, 1000));
      }
    }

    await this.sleep(ranInt(2000, 5000));
    this.main();
  };

  public run = (config: Configuration) => {
    this.config = config;
    this.cache = structuredClone(config);
    this.registerEvents();
    this.emit("ready", this.user?.client!);
  };
}
