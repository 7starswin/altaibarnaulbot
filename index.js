require("dotenv").config()

const { Telegraf, Markup } = require("telegraf")
const mongoose = require("mongoose")

const bot = new Telegraf(process.env.BOT_TOKEN)

const ADMIN_ID = Number(process.env.ADMIN_ID)

// ================= DATABASE =================

mongoose.connect(process.env.MONGO_URI,{
useNewUrlParser:true,
useUnifiedTopology:true
})
.then(()=>console.log("✅ MongoDB Connected"))
.catch(err=>console.log(err))

// ================= MODELS =================

const User = mongoose.model("User",{
telegramId:Number,
name:String,
phone:String,
createdAt:{type:Date,default:Date.now}
})

const Ticket = mongoose.model("Ticket",{
ticketId:Number,
userId:Number,
message:String,
status:{type:String,default:"open"},
createdAt:{type:Date,default:Date.now}
})

const Agent = mongoose.model("Agent",{
userId:Number,
name:String,
status:{type:String,default:"pending"}
})

const Deposit = mongoose.model("Deposit",{
userId:Number,
amount:String,
status:{type:String,default:"pending"}
})

const Withdraw = mongoose.model("Withdraw",{
userId:Number,
amount:String,
status:{type:String,default:"pending"}
})

// ================= TEMP STATES =================

let supportMode = {}
let depositMode = {}
let withdrawMode = {}
let promoMode = {}

// ================= MENU =================

function mainMenu(ctx){

return ctx.reply(
"🔥 Main Menu",
Markup.keyboard([
["👤 Support","🎟 Promo Banner"],
["💰 Deposit","💸 Withdraw"],
["🤝 Become Agent"]
]).resize()
)

}

// ================= START =================

bot.start(async(ctx)=>{

let user = await User.findOne({telegramId:ctx.from.id})

if(!user){

return ctx.reply(
"📱 Please share your phone number to register",
Markup.keyboard([
[Markup.button.contactRequest("📲 Share Phone Number")]
]).resize()
)

}

mainMenu(ctx)

})

// ================= REGISTER =================

bot.on("contact",async(ctx)=>{

let phone = ctx.message.contact.phone_number

let exist = await User.findOne({telegramId:ctx.from.id})

if(!exist){

await User.create({
telegramId:ctx.from.id,
name:ctx.from.first_name,
phone
})

}

ctx.reply("✅ Registration successful")

mainMenu(ctx)

})

// ================= SUPPORT =================

bot.hears("👤 Support",async(ctx)=>{

let ticketId = Math.floor(100000 + Math.random()*900000)

supportMode[ctx.from.id] = ticketId

await Ticket.create({
ticketId,
userId:ctx.from.id
})

ctx.reply(`🎫 Ticket Created\n\nTicket ID: #${ticketId}\n\nSend your problem message.`)

})

// ================= PROMO =================

bot.hears("🎟 Promo Banner",(ctx)=>{

promoMode[ctx.from.id] = true

ctx.reply("🎟 Send your promo code")

})

// ================= DEPOSIT =================

bot.hears("💰 Deposit",(ctx)=>{

depositMode[ctx.from.id] = true

ctx.reply("💰 Enter deposit amount")

})

// ================= WITHDRAW =================

bot.hears("💸 Withdraw",(ctx)=>{

withdrawMode[ctx.from.id] = true

ctx.reply("💸 Enter withdraw amount")

})

// ================= AGENT =================

bot.hears("🤝 Become Agent",async(ctx)=>{

await Agent.create({
userId:ctx.from.id,
name:ctx.from.first_name
})

ctx.reply("✅ Agent request sent to admin")

bot.telegram.sendMessage(
ADMIN_ID,
`🤝 New Agent Request\n\nUser: ${ctx.from.first_name}\nID: ${ctx.from.id}`
)

})

// ================= TEXT HANDLER =================

bot.on("text",async(ctx)=>{

let id = ctx.from.id
let text = ctx.message.text

// SUPPORT MESSAGE

if(supportMode[id]){

let ticketId = supportMode[id]

await Ticket.updateOne(
{ticketId},
{$set:{message:text}}
)

bot.telegram.sendMessage(
ADMIN_ID,
`🎫 Support Ticket\n\nTicket: #${ticketId}\nUser: ${ctx.from.first_name}\nID: ${id}\n\nMessage:\n${text}`
)

delete supportMode[id]

return ctx.reply("✅ Support request sent")

}

// PROMO

if(promoMode[id]){

delete promoMode[id]

return ctx.reply(
`🔥 PROMO BANNER 🔥

Use Code: ${text}

Join Now and Win Big!

🎮 Best Casino Platform`
)

}

// DEPOSIT

if(depositMode[id]){

await Deposit.create({
userId:id,
amount:text
})

bot.telegram.sendMessage(
ADMIN_ID,
`💰 Deposit Request

User: ${ctx.from.first_name}
ID: ${id}

Amount: ${text}`
)

delete depositMode[id]

return ctx.reply("✅ Deposit request sent")

}

// WITHDRAW

if(withdrawMode[id]){

await Withdraw.create({
userId:id,
amount:text
})

bot.telegram.sendMessage(
ADMIN_ID,
`💸 Withdraw Request

User: ${ctx.from.first_name}
ID: ${id}

Amount: ${text}`
)

delete withdrawMode[id]

return ctx.reply("✅ Withdraw request sent")

}

})

// ================= ADMIN COMMANDS =================

// BROADCAST

bot.command("broadcast",async(ctx)=>{

if(ctx.from.id !== ADMIN_ID) return

ctx.reply("Send message for broadcast")

promoMode["broadcast"] = true

})

bot.on("message",async(ctx)=>{

if(ctx.from.id !== ADMIN_ID) return

if(promoMode["broadcast"]){

let users = await User.find()

let sent = 0

for(let u of users){

try{
await bot.telegram.sendMessage(u.telegramId,ctx.message.text)
sent++
}catch{}

}

promoMode["broadcast"] = false

ctx.reply(`✅ Broadcast sent to ${sent} users`)

}

})

// STATS

bot.command("stats",async(ctx)=>{

if(ctx.from.id !== ADMIN_ID) return

let users = await User.countDocuments()
let tickets = await Ticket.countDocuments({status:"open"})
let agents = await Agent.countDocuments()

ctx.reply(
`📊 Bot Statistics

👥 Users: ${users}
🎫 Tickets: ${tickets}
🤝 Agent Requests: ${agents}`
)

})

// REPLY TICKET

bot.command("reply",async(ctx)=>{

if(ctx.from.id !== ADMIN_ID) return

let args = ctx.message.text.split(" ")

let ticketId = args[1]

let replyText = args.slice(2).join(" ")

let ticket = await Ticket.findOne({ticketId})

if(!ticket) return ctx.reply("Ticket not found")

bot.telegram.sendMessage(
ticket.userId,
`📩 Admin Reply (Ticket #${ticketId})

${replyText}`
)

ctx.reply("✅ Reply sent")

})

// ================= START BOT =================

bot.launch()

console.log("🚀 Bot Running")

process.once("SIGINT",()=>bot.stop("SIGINT"))
process.once("SIGTERM",()=>bot.stop("SIGTERM"))
