const { Telegraf, Markup } = require("telegraf")
const User = require("./models/User")

const bot = new Telegraf(process.env.BOT_TOKEN)

bot.start(async (ctx) => {
  const telegramId = ctx.from.id

  let user = await User.findOne({ telegramId })

  if (!user) {
    return ctx.reply(
      "📱 Please share your phone number to register",
      Markup.keyboard([
        [Markup.button.contactRequest("Share Phone Number")]
      ]).resize()
    )
  }

  return ctx.reply(
    "🔥 Welcome to the bot",
    Markup.inlineKeyboard([
      [Markup.button.callback("👤 Player Support", "player")],
      [Markup.button.callback("🎨 Promo Banner", "promo")],
      [Markup.button.callback("🧑‍💼 Become Agent", "agent")]
    ])
  )
})

bot.on("contact", async (ctx) => {
  const telegramId = ctx.from.id

  await User.create({
    telegramId,
    name: ctx.from.first_name,
    phone: ctx.message.contact.phone_number
  })

  ctx.reply("✅ Registration successful")
})

bot.action("player", (ctx) => ctx.reply("Player support coming soon"))
bot.action("promo", (ctx) => ctx.reply("Promo generator coming soon"))
bot.action("agent", (ctx) => ctx.reply("Agent system coming soon"))

module.exports = bot
