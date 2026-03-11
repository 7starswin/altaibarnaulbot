require("dotenv").config()

const TelegramBot = require("node-telegram-bot-api")
const User = require("./models/User")

// create bot
const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true
})

console.log("Telegram bot started")

// START COMMAND
bot.onText(/\/start (.+)/, async (msg, match) => {

  const chatId = msg.chat.id
  const code = match[1]

  let ref = null

  if (code.startsWith("agent_")) {
    ref = code.split("_")[1]
  }

  try {

    await User.findOneAndUpdate(
      { telegramId: msg.from.id },
      {
        telegramId: msg.from.id,
        username: msg.from.username,
        referredBy: ref,
        campaign: code
      },
      { upsert: true }
    )

    bot.sendMessage(chatId,
`🔥 Welcome!

Your account is registered.

Use commands:
/promo - get promo banner
/agent - get referral link`
    )

  } catch (err) {
    console.log(err)
  }

})


// NORMAL START
bot.onText(/\/start/, async (msg) => {

  const chatId = msg.chat.id

  try {

    await User.findOneAndUpdate(
      { telegramId: msg.from.id },
      {
        telegramId: msg.from.id,
        username: msg.from.username
      },
      { upsert: true }
    )

    bot.sendMessage(chatId,
`🔥 Welcome to our platform!

Commands:
/promo
/agent`
    )

  } catch (err) {
    console.log(err)
  }

})


// PROMO COMMAND
bot.onText(/\/promo/, (msg) => {

  const chatId = msg.chat.id

  bot.sendMessage(chatId,
`🎁 PROMO BONUS

Claim your bonus now!

https://example.com`
  )

})


// AGENT LINK
bot.onText(/\/agent/, (msg) => {

  const chatId = msg.chat.id
  const id = msg.from.id

  const link = `https://t.me/YOURBOTNAME?start=agent_${id}`

  bot.sendMessage(chatId,
`🤝 Your Agent Link

${link}

Share this link and earn commission.`)

})


// ERROR HANDLER
bot.on("polling_error", (err) => {
  console.log("Polling error:", err.message)
})

module.exports = bot
