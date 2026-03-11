require("dotenv").config()

const { Telegraf, Markup } = require("telegraf")
const mongoose = require("mongoose")

// ================= BOT INIT =================

if(!process.env.BOT_TOKEN){
console.log("BOT_TOKEN missing")
process.exit(1)
}

const bot = new Telegraf(process.env.BOT_TOKEN)

const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(",").map(Number)
  : []

// ================= DATABASE =================

mongoose.connect(process.env.MONGO_URI || "",{
useNewUrlParser:true,
useUnifiedTopology:true
})
.then(()=>console.log("✅ MongoDB connected"))
.catch(err=>console.log("Mongo error",err))

// ================= MODELS =================

const User = mongoose.model("User",{
telegramId:Number,
name:String,
phone:String,
joined:{type:Date,default:Date.now}
})

const Ticket = mongoose.model("Ticket",{
ticketId:Number,
userId:Number,
message:String,
status:{type:String,default:"open"}
})

const Agent = mongoose.model("Agent",{
userId:Number,
country:String,
username:String,
status:{type:String,default:"pending"}
})

const Finance = mongoose.model("Finance",{
userId:Number,
type:String,
amount:Number,
status:{type:String,default:"pending"}
})

const Promo = mongoose.model("Promo",{
code:String,
createdBy:Number,
createdAt:{type:Date,default:Date.now}
})

// ================= SESSION =================

const sessions = {}

function getSession(id){
if(!sessions[id]){
sessions[id]={step:null,data:{}}
}
return sessions[id]
}

function clearSession(id){
delete sessions[id]
}

// ================= MENUS =================

function mainMenu(){
return Markup.keyboard([
["👤 Player Support","🎟 Promo Code"],
["🤝 Become Agent"],
["💰 Deposit","💸 Withdraw"]
]).resize()
}

function adminMenu(){
return Markup.keyboard([
["📊 Dashboard"],
["📢 Broadcast"],
["🎫 Tickets"],
["🤝 Agent Requests"]
]).resize()
}

// ================= START =================

bot.start(async ctx=>{

let user = await User.findOne({telegramId:ctx.from.id})

if(!user){

const s=getSession(ctx.from.id)
s.step="register_phone"

ctx.reply(
"📱 Please share your phone to register",
Markup.keyboard([
Markup.button.contactRequest("📲 Share Phone")
]).resize()
)

return
}

ctx.reply("🏠 Welcome",mainMenu())

})

// ================= REGISTER =================

bot.on("contact",async ctx=>{

const s=getSession(ctx.from.id)

if(s.step!=="register_phone") return

await User.create({
telegramId:ctx.from.id,
name:ctx.from.first_name,
phone:ctx.message.contact.phone_number
})

ctx.reply("✅ Registration completed",mainMenu())

clearSession(ctx.from.id)

})

// ================= PLAYER SUPPORT =================

bot.hears("👤 Player Support",ctx=>{

const s=getSession(ctx.from.id)
s.step="ticket"

ctx.reply("Send your problem message")

})

// ================= PROMO =================

bot.hears("🎟 Promo Code",ctx=>{

const s=getSession(ctx.from.id)
s.step="promo"

ctx.reply("Send promo code")

})

// ================= AGENT =================

bot.hears("🤝 Become Agent",ctx=>{

const s=getSession(ctx.from.id)
s.step="agent"

ctx.reply("Send your country")

})

// ================= DEPOSIT =================

bot.hears("💰 Deposit",ctx=>{

const s=getSession(ctx.from.id)
s.step="deposit"

ctx.reply("Enter deposit amount")

})

// ================= WITHDRAW =================

bot.hears("💸 Withdraw",ctx=>{

const s=getSession(ctx.from.id)
s.step="withdraw"

ctx.reply("Enter withdraw amount")

})

// ================= TEXT HANDLER =================

bot.on("text",async ctx=>{

const text = ctx.message.text
const s = getSession(ctx.from.id)

// ----- TICKET -----

if(s.step==="ticket"){

const ticketId=Math.floor(100000+Math.random()*900000)

await Ticket.create({
ticketId,
userId:ctx.from.id,
message:text
})

ADMIN_IDS.forEach(admin=>{
bot.telegram.sendMessage(
admin,
`🎫 New Ticket

ID: ${ticketId}
User: ${ctx.from.id}

${text}`
).catch(()=>{})
})

ctx.reply(`✅ Ticket created\nID: ${ticketId}`)

clearSession(ctx.from.id)
return
}

// ----- PROMO -----

if(s.step==="promo"){

await Promo.create({
code:text,
createdBy:ctx.from.id
})

ctx.reply(
`🔥 PROMO

Code: ${text}

Claim your bonus now!`
)

clearSession(ctx.from.id)
return
}

// ----- AGENT -----

if(s.step==="agent"){

await Agent.create({
userId:ctx.from.id,
country:text,
username:ctx.from.username
})

ADMIN_IDS.forEach(admin=>{
bot.telegram.sendMessage(
admin,
`🤝 Agent Request

User: ${ctx.from.id}
Country: ${text}`
).catch(()=>{})
})

ctx.reply("Agent request sent")

clearSession(ctx.from.id)
return
}

// ----- DEPOSIT -----

if(s.step==="deposit"){

await Finance.create({
userId:ctx.from.id,
type:"deposit",
amount:text
})

ADMIN_IDS.forEach(admin=>{
bot.telegram.sendMessage(
admin,
`💰 Deposit

User: ${ctx.from.id}
Amount: ${text}`
).catch(()=>{})
})

ctx.reply("Deposit request sent")

clearSession(ctx.from.id)
return
}

// ----- WITHDRAW -----

if(s.step==="withdraw"){

await Finance.create({
userId:ctx.from.id,
type:"withdraw",
amount:text
})

ADMIN_IDS.forEach(admin=>{
bot.telegram.sendMessage(
admin,
`💸 Withdraw

User: ${ctx.from.id}
Amount: ${text}`
).catch(()=>{})
})

ctx.reply("Withdraw request sent")

clearSession(ctx.from.id)
return
}

})

// ================= ADMIN =================

bot.command("admin",ctx=>{

if(!ADMIN_IDS.includes(ctx.from.id)) return

ctx.reply("Admin Panel",adminMenu())

})

// ================= DASHBOARD =================

bot.hears("📊 Dashboard",async ctx=>{

if(!ADMIN_IDS.includes(ctx.from.id)) return

const users=await User.countDocuments()
const tickets=await Ticket.countDocuments()
const agents=await Agent.countDocuments()

ctx.reply(
`📊 Stats

Users: ${users}
Tickets: ${tickets}
Agents: ${agents}`
)

})

// ================= BROADCAST =================

bot.hears("📢 Broadcast",ctx=>{

if(!ADMIN_IDS.includes(ctx.from.id)) return

const s=getSession(ctx.from.id)
s.step="broadcast"

ctx.reply("Send message to broadcast")

})

bot.on("text",async ctx=>{

const s=getSession(ctx.from.id)

if(s.step==="broadcast"){

const users=await User.find()

for(const u of users){

try{
await bot.telegram.sendMessage(u.telegramId,ctx.message.text)
}catch(e){}

}

ctx.reply("Broadcast sent")

clearSession(ctx.from.id)

}

})

// ================= ERROR HANDLING =================

bot.catch(err=>console.log("Bot error",err))

process.on("unhandledRejection",err=>console.log(err))
process.on("uncaughtException",err=>console.log(err))

// ================= START BOT =================

bot.launch()

console.log("🚀 Bot Running")
