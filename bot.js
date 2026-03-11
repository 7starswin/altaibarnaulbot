const { Telegraf, Markup } = require("telegraf")

const { playerFlow } = require("./flows/playerFlow")
const { promoFlow } = require("./flows/promoFlow")
const { agentFlow } = require("./flows/agentFlow")
const { settingsFlow } = require("./flows/settingsFlow")

const { getUserData, saveUser } = require("./utils/db")
const { loadLanguage } = require("./utils/i18n")

const bot = new Telegraf(process.env.BOT_TOKEN)

const adminChatIds = process.env.ADMIN_IDS.split(",")

const sessions = {}

function getSession(userId){
if(!sessions[userId]) sessions[userId] = {}
return sessions[userId]
}

function clearSession(userId){
delete sessions[userId]
}

function mainMenu(ctx,texts){

return ctx.reply(
`🔥 ${texts.main_menu}`,
Markup.inlineKeyboard([

[
Markup.button.callback("👤 Player Support","menu_player"),
Markup.button.callback("🎨 Promo Banner","menu_promo")
],

[
Markup.button.callback("🧑‍💼 Become Agent","menu_agent")
],

[
Markup.button.callback("⚙️ Settings","menu_settings")
]

])
)

}

bot.start(async(ctx)=>{

const userId = ctx.from.id

let user = await getUserData(userId)

if(!user){

await ctx.reply(
"📱 Please share phone number",
Markup.keyboard([
[Markup.button.contactRequest("Share Phone")]
]).resize()
)

return
}

const texts = loadLanguage(user.language || "en")

return mainMenu(ctx,texts)

})

bot.on("contact", async(ctx)=>{

const userId = ctx.from.id

await saveUser({
telegramId:userId,
name:ctx.from.first_name,
phone:ctx.message.contact.phone_number,
language:"en"
})

return ctx.reply("✅ Registration Complete")

})

bot.action("back_to_main",async(ctx)=>{

const user = await getUserData(ctx.from.id)
const texts = loadLanguage(user.language || "en")

return mainMenu(ctx,texts)

})

bot.action("menu_player",(ctx)=>{

return playerFlow(ctx,bot,adminChatIds,getSession,clearSession)

})

bot.action("menu_promo",(ctx)=>{

return promoFlow(ctx,bot,adminChatIds,getSession,clearSession)

})

bot.action("menu_agent",(ctx)=>{

return agentFlow(ctx,bot,adminChatIds,getSession,clearSession)

})

bot.action("menu_settings",(ctx)=>{

return settingsFlow(ctx,bot,getSession)

})

module.exports = bot
