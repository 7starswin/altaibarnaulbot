require("dotenv").config()

const { Telegraf } = require("telegraf")
const connectDB = require("./utils/dbConnect")

const bot = require("./bot")

connectDB()

bot.launch()

console.log("🚀 Bot Started")

process.once("SIGINT", () => bot.stop("SIGINT"))
process.once("SIGTERM", () => bot.stop("SIGTERM"))
