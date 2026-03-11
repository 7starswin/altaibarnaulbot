require("dotenv").config()

const { Telegraf, Markup } = require("telegraf")
const mongoose = require("mongoose")

const bot = new Telegraf(process.env.BOT_TOKEN)


// =======================
// MongoDB
// =======================

mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("✅ MongoDB connected"))
.catch(err=>console.log(err))


// =======================
// Models
// =======================

const User = mongoose.model("User",{

telegramId:Number,
name:String,
phone:String,
createdAt:{
type:Date,
default:Date.now
}

})

const Ticket = mongoose.model("Ticket",{

userId:Number,
ticketId:Number,
message:String,
status:{
type:String,
default:"open"
}

})


// =======================
// Admin
// =======================

const ADMIN_ID = process.env.ADMIN_ID


// =======================
// Menu
// =======================

function mainMenu(ctx){

return ctx.reply(

"🔥 Welcome to the system",

Markup.inlineKeyboard([

[
Markup.button.callback("👤 Player Support","support")
],

[
Markup.button.callback("🎟 Promo Code Banner","promo")
],

[
Markup.button.callback("🧑‍💼 Become Agent","agent")
]

])

)

}


// =======================
// Start
// =======================

bot.start(async(ctx)=>{

const id = ctx.from.id

let user = await User.findOne({telegramId:id})

if(!user){

return ctx.reply(

"📱 Please share phone number",

Markup.keyboard([
[Markup.button.contactRequest("Share Phone Number")]
]).resize()

)

}

mainMenu(ctx)

})


// =======================
// Register
// =======================

bot.on("contact",async(ctx)=>{

const id = ctx.from.id

await User.create({

telegramId:id,
name:ctx.from.first_name,
phone:ctx.message.contact.phone_number

})

ctx.reply("✅ Registration successful")

mainMenu(ctx)

})


// =======================
// Support
// =======================

bot.action("support",async(ctx)=>{

const ticketId = Math.floor(1000+Math.random()*9000)

await Ticket.create({

userId:ctx.from.id,
ticketId

})

ctx.reply(`🎫 Ticket Created\n\nTicket ID: #${ticketId}\n\nSend your problem message.`)

})


// =======================
// Promo
// =======================

bot.action("promo",(ctx)=>{

ctx.reply("🎟 Send your promo code")

})


// =======================
// Agent
// =======================

bot.action("agent",(ctx)=>{

ctx.reply("🧑‍💼 Agent request sent to admin")

bot.telegram.sendMessage(

ADMIN_ID,

`🤝 New Agent Request\nUser: ${ctx.from.first_name}\nID: ${ctx.from.id}`

)

})


// =======================
// Broadcast
// =======================

bot.command("broadcast",async(ctx)=>{

if(ctx.from.id != ADMIN_ID) return

ctx.reply("Send broadcast message")

})

bot.on("text",async(ctx)=>{

if(ctx.from.id != ADMIN_ID) return

const users = await User.find()

for(let u of users){

bot.telegram.sendMessage(u.telegramId,ctx.message.text)

}

ctx.reply("✅ Broadcast sent")

})


// =======================
// Launch
// =======================

bot.launch()

console.log("🚀 Bot started")

process.once("SIGINT",()=>bot.stop("SIGINT"))
process.once("SIGTERM",()=>bot.stop("SIGTERM"))
