require("dotenv").config()

const connectDB = require("./utils/dbConnect")
const bot = require("./bot")

async function start() {
  await connectDB()
  await bot.launch()
  console.log("🚀 Bot started")
}

start()

process.once("SIGINT", () => bot.stop("SIGINT"))
process.once("SIGTERM", () => bot.stop("SIGTERM"))
