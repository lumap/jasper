/* eslint @typescript-eslint/no-explicit-any: "off" */
import { Context } from "./Context";
import { config } from "dotenv";
import { SetupMongo } from "./SetupMongo";
import fs from "fs";
import path from "path";
import { TextChannel } from "discord.js";
import { getLatestYoutubeVideo, getRandomYoutubeAPIKey, updateSubCountChannel } from "../Common/youtube";

config();
const ctx: Context = new Context();
ctx.env.validate();

// Slowmode plugin configuration
global.slowmodeCooldown = ctx.env.get("slowmode_cooldown");
global.messageTimeWindow = ctx.env.get("slowmode_msg_time");
global.messageThreshold = ctx.env.get("slowmode_msg_threshold");

// The color used in all embeds
global.embedColor = 0x323338;

export function writeToVideoIdFile(videoId: string): void {
    try {
      fs.writeFileSync("latestvideo.json", JSON.stringify({ video: videoId }));
    } catch (err) {
      console.error(err);
    }
}

export function writeToThreadIdFile(threadId: string): void {
  try {
    fs.writeFileSync("latestthread.json", JSON.stringify({ thread: threadId }));
  } catch (err) {
    console.error(err);
  }
}

async function postNewVideo(): Promise<void> {
  if (!ctx.env.get("youtube_post_update") || ctx.env.get("youtube_post_update") == "0") return;
  // Ensure the files exist
  if (!fs.existsSync("latestvideo.json")) fs.writeFileSync("latestvideo.json", JSON.stringify({ video: "" }));
  if (!fs.existsSync("latestthread.json")) fs.writeFileSync("latestthread.json", JSON.stringify({ thread: "" }));

  const latestVideoPath = path.join(process.cwd(), "latestvideo.json");
  const latestThreadPath = path.join(process.cwd(), "latestthread.json");

  delete require.cache[require.resolve(latestVideoPath)];
  delete require.cache[require.resolve(latestThreadPath)];

  const latestVideoFile: { video: string } = require(latestVideoPath);
  const latest = await getLatestYoutubeVideo(ctx.env.get("youtube_id"), getRandomYoutubeAPIKey(ctx));

  if (latestVideoFile.video !== latest.id) {
      //@ts-ignore
      const channel: TextChannel = ctx.channels.resolve(ctx.env.get("youtube_post_channel"));

      if (!channel) {
          console.error('Channel not found');
          return;
      }

      try {
          const messages = await channel.messages.fetch({ limit: 100 });

          if (!messages.some((message) => message.content.includes(latest.id))) {
              const message = await channel.send({ content: `<@&${ctx.env.get("youtube_video_discussions_role")}>\n# ${latest.title}\n${latest.description}\nhttps://www.youtube.com/watch?v=${latest.id}`, allowedMentions: { roles: [ctx.env.get("youtube_video_discussions_role")] } });

              const thread = await message.startThread({ name: latest.title, autoArchiveDuration: 1440 });
              await thread.send("# Reminder to follow the rules and to stay on topic!");

              const latestThread: { thread: string } = require(latestThreadPath);
              try {
                  const previousThread = channel.threads.resolve(latestThread.thread);
                  await previousThread.edit({ locked: true, name: `[Closed] ${previousThread.name}`, archived: true });
              } catch (error) {
                  console.error('Error fetching or editing previous thread:', error);
              }

              writeToThreadIdFile(thread.id);
              writeToVideoIdFile(latest.id);

          } else {
              console.log('Latest video already posted.');
          }
      } catch (err) {
          console.error('Error sending message or creating thread:', err);
          if (channel) {
              channel.send({ content: "An error happened when fetching the latest video." });
          }
      }
  }
}

async function main() {
  const handlers = ["Command", "Event"].map(async (x) => {
    const handlerModule = await import(`../Handlers/${x}`);
    await handlerModule.default(ctx);
  });

  await Promise.all(handlers);

  SetupMongo({ uri: ctx.env.get("db") });
  setInterval(postNewVideo, ctx.env.get("youtube_post_timer"));
}

if (ctx.env.get("sub_update") == "1") setInterval(updateSubCountChannel, ctx.env.get("sub_timer"));

main().catch(console.error);

process
  .on("unhandledRejection", (error) => {
    console.error("Unhandled promise rejection:", error);
  })

  .on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
  });

void ctx.login(ctx.env.get("botToken"));
