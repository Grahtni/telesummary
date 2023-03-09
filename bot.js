import dotenv from "dotenv";
dotenv.config();
import { Bot, webhookCallback, GrammyError, HttpError } from "grammy";
import { ChatGPTAPI } from "chatgpt";

// Bot

const bot = new Bot(process.env.BOT_TOKEN);

// Auth

const api = new ChatGPTAPI({
  apiKey: process.env.API_KEY,
});

// Admin

const authorizedUsers = process.env.BOT_DEVELOPER?.split(",").map(Number) || [];
bot.use(async (ctx, next) => {
  ctx.config = {
    botDevelopers: authorizedUsers,
    isDeveloper: authorizedUsers.includes(ctx.chat?.id),
  };
  await next();
});

// Response

async function responseTime(ctx, next) {
  const before = Date.now();
  await next();
  const after = Date.now();
  console.log(`Response time: ${after - before} ms`);
}

bot.use(responseTime);

// Commands

bot.command("start", async (ctx) => {
  if (!ctx.chat.type == "private") {
    await bot.api.sendMessage(
      ctx.chat.id,
      "*Channels and groups are not supported presently.*",
      { parse_mode: "Markdown" }
    );
    return;
  }

  await ctx
    .reply("*Welcome!* ✨\n_Send text to be summarized._", {
      parse_mode: "Markdown",
    })
    .then(console.log("New user added:\n", ctx.from));
});

bot.command("help", async (ctx) => {
  await ctx
    .reply(
      "*@anzubo Project.*\n\n_This bot summarises long text or articles.\nAll languages are supported!_",
      { parse_mode: "Markdown" }
    )
    .then(console.log("Help command sent to", ctx.chat.id));
});

// Moderation

bot.command("add", async (ctx) => {
  if (!ctx.chat.type == "private") {
    await bot.api.sendMessage(
      ctx.chat.id,
      "*Channels and groups are not supported presently.*",
      { parse_mode: "Markdown" }
    );
    return;
  }
  if (!ctx.config.isDeveloper) {
    await ctx.reply("*You're not authorized to use this command.*", {
      parse_mode: "Markdown",
    });
    return;
  }
  await ctx
    .reply("*This command hasn't been implemented yet.*", {
      parse_mode: "Markdown",
    })
    .then(console.log("Add command invoked by", ctx.chat.id));
});

bot.command("ban", async (ctx) => {
  if (!ctx.chat.type == "private") {
    await bot.api.sendMessage(
      ctx.chat.id,
      "*Channels and groups are not supported presently.*",
      { parse_mode: "Markdown" }
    );
    return;
  }
  if (!ctx.config.isDeveloper) {
    await ctx.reply("*You're not authorized to use this command.*", {
      parse_mode: "Markdown",
    });
    return;
  }
  await ctx
    .reply("*This command hasn't been implemented yet.*", {
      parse_mode: "Markdown",
    })
    .then(console.log("Ban command invoked by", ctx.chat.id));
});

// Misc

bot.command("cmd", async (ctx) => {
  if (!ctx.chat.type == "private") {
    await bot.api.sendMessage(
      ctx.chat.id,
      "*Channels and groups are not supported presently.*",
      { parse_mode: "Markdown" }
    );
    return;
  }
  await ctx.reply(
    "*Here are the commands available:\n\nUsers*\n_/start Start the bot\n/help Know more_\n\n*Admins*\n_/add [id] Authorize user\n/ban [id] Ban user_",
    { parse_mode: "Markdown" }
  );
});

// Messages

bot.on("message", async (ctx) => {
  // Logging

  const from = ctx.from;
  const name =
    from.last_name === undefined
      ? from.first_name
      : `${from.first_name} ${from.last_name}`;
  console.log(
    `From: ${name} (@${from.username}) ID: ${from.id}\nMessage: ${ctx.message.text}`
  );

  // Logic

  if (!ctx.config.isDeveloper) {
    await bot.api.sendMessage(
      process.env.BOT_DEVELOPER,
      `*From: ${name} (@${from.username}) ID: ${from.id}\nMessage: ${ctx.message.text}*`,
      { parse_mode: "Markdown" }
    );
  }
  try {
    const statusMessage = await ctx.reply(`*Summarising*`, {
      parse_mode: "Markdown",
    });
    async function deleteMessageWithDelay(fromId, messageId, delayMs) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          bot.api
            .deleteMessage(fromId, messageId)
            .then(() => resolve())
            .catch((error) => reject(error));
        }, delayMs);
      });
    }
    await deleteMessageWithDelay(ctx.chat.id, statusMessage.message_id, 3000);

    // GPT

    async function sendMessageWithTimeout(ctx) {
      try {
        const resultPromise = api.sendMessage((ctx.msg.text += " Tl;dr"));

        const result = await Promise.race([
          resultPromise,
          new Promise((_, reject) => {
            setTimeout(() => {
              reject("Function timeout");
            }, 60000);
          }),
        ]);

        await ctx.reply(`${result.text}`, {
          reply_to_message_id: ctx.message.message_id,
          parse_mode: "Markdown",
        });

        console.log(result.detail.usage);

        console.log(`Function executed successfully from ${ctx.chat.id}`);
      } catch (error) {
        if (error === "Function timeout") {
          await ctx.reply("*Query timed out.*", {
            parse_mode: "Markdown",
            reply_to_message_id: ctx.message.message_id,
          });
        } else {
          throw error;
        }
      }
    }

    await sendMessageWithTimeout(ctx);
  } catch (error) {
    if (error instanceof GrammyError) {
      if (error.message.includes("Forbidden: bot was blocked by the user")) {
        console.log("Bot was blocked by the user");
      } else if (error.message.includes("Call to 'sendMessage' failed!")) {
        console.log("Error sending message: ", error);
        await ctx.reply(`*Error contacting Telegram.*`, {
          parse_mode: "Markdown",
          reply_to_message_id: ctx.message.message_id,
        });
      } else {
        await ctx.reply(`*An error occurred: ${error.message}*`, {
          parse_mode: "Markdown",
          reply_to_message_id: ctx.message.message_id,
        });
      }
      console.log(`Error sending message: ${error.message}`);
      return;
    } else {
      console.log(`An error occured:`, error);
      await ctx.reply(`*An error occurred.*\n_Error: ${error.message}_`, {
        parse_mode: "Markdown",
        reply_to_message_id: ctx.message.message_id,
      });
      return;
    }
  }
});

// Error

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(
    "Error while handling update",
    ctx.update.update_id,
    "\nQuery:",
    ctx.msg.text
  );
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Error in request:", e.description);
    if (e.description === "Forbidden: bot was blocked by the user") {
      console.log("Bot was blocked by the user");
    } else {
      ctx.reply("An error occurred");
    }
  } else if (e instanceof HttpError) {
    console.error("Could not contact Telegram:", e);
  } else {
    console.error("Unknown error:", e);
  }
});

// Run

bot.start();
