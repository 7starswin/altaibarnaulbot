require("dotenv").config()

const { Telegraf, Markup } = require("telegraf")
const mongoose = require("mongoose")

// ================= BOT =================

const bot = new Telegraf(process.env.BOT_TOKEN)
const ADMIN_IDS = process.env.ADMIN_IDS.split(",").map(Number)

// ================= DATABASE =================

mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("✅ MongoDB Connected"))
.catch(()=>console.log("Mongo Error"))

const User = mongoose.model("User",{
telegramId:Number,
name:String,
phone:String,
joined:{type:Date,default:Date.now}
})

const Ticket = mongoose.model("Ticket",{
ticketId:Number,
userId:Number,
messages:[String],
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

function session(id){
if(!sessions[id]){
sessions[id]={step:null,data:{}}
}
return sessions[id]
}

function clearSession(id){
delete sessions[id]
}

// ================= ADMIN CHECK =================

function isAdmin(id){
return ADMIN_IDS.includes(id)
}

// ================= MAIN MENU =================

function mainMenu(){

return Markup.keyboard([
["👤 Player Support","🎟 Promo Code"],
["🤝 Become Agent"],
["💰 Deposit","💸 Withdraw"]
]).resize()

}

// ================= ADMIN MENU =================

function adminMenu(){

return Markup.keyboard([
["📊 Dashboard"],
["📢 Broadcast"],
["🎫 Tickets"],
["🤝 Agent Requests"],
["💰 Deposits","💸 Withdraws"]
]).resize()

}

// ================= START =================

bot.start(async ctx=>{

let user = await User.findOne({telegramId:ctx.from.id})

if(!user){

ctx.reply(
"📱 Share your phone to register",
Markup.keyboard([
Markup.button.contactRequest("📲 Share Phone")
]).resize()
)

const s=session(ctx.from.id)
s.step="register_phone"
return

}

ctx.reply("🏠 Welcome",mainMenu())

})

// ================= REGISTER =================

bot.on("contact",async ctx=>{

const s=session(ctx.from.id)

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

const s=session(ctx.from.id)
s.step="ticket_message"

ctx.reply("Send your problem message")

})


// ================= PROMO =================

bot.hears("🎟 Promo Code",ctx=>{

const s=session(ctx.from.id)
s.step="promo_code"

ctx.reply("Send promo code (max 10 characters)")

})


// ================= AGENT =================

bot.hears("🤝 Become Agent",ctx=>{

const s=session(ctx.from.id)
s.step="agent_country"

ctx.reply("Send your country")

})


// ================= DEPOSIT =================

bot.hears("💰 Deposit",ctx=>{

const s=session(ctx.from.id)
s.step="deposit_amount"

ctx.reply("Enter deposit amount")

})


// ================= WITHDRAW =================

bot.hears("💸 Withdraw",ctx=>{

const s=session(ctx.from.id)
s.step="withdraw_amount"

ctx.reply("Enter withdraw amount")

})


// ================= TEXT HANDLER =================

bot.on("text",async ctx=>{

const text=ctx.message.text
const s=session(ctx.from.id)

// ---------- PLAYER TICKET ----------

if(s.step==="ticket_message"){

const ticketId=Math.floor(100000+Math.random()*900000)

await Ticket.create({
ticketId,
userId:ctx.from.id,
messages:[text]
})

ADMIN_IDS.forEach(admin=>{
bot.telegram.sendMessage(
admin,
`🎫 New Ticket

ID: ${ticketId}
User: ${ctx.from.id}

${text}`
)
})

ctx.reply(`✅ Ticket created\nTicket ID: ${ticketId}`)

clearSession(ctx.from.id)

}

// ---------- PROMO ----------

if(s.step==="promo_code"){

if(text.length>10){
ctx.reply("Promo code too long")
return
}

await Promo.create({
code:text,
createdBy:ctx.from.id
})

ctx.reply(
`🔥 PROMO BANNER 🔥

🎁 CODE: ${text}

💰 Claim bonus now
🎮 Start playing today`
)

clearSession(ctx.from.id)

}

// ---------- AGENT ----------

if(s.step==="agent_country"){

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
Country: ${text}
Username: @${ctx.from.username}`
)
})

ctx.reply("✅ Agent request sent")

clearSession(ctx.from.id)

}

// ---------- DEPOSIT ----------

if(s.step==="deposit_amount"){

await Finance.create({
userId:ctx.from.id,
type:"deposit",
amount:text
})

ADMIN_IDS.forEach(admin=>{
bot.telegram.sendMessage(
admin,
`💰 Deposit Request

User: ${ctx.from.id}
Amount: ${text}`
)
})

ctx.reply("Deposit request sent")

clearSession(ctx.from.id)

}

// ---------- WITHDRAW ----------

if(s.step==="withdraw_amount"){

await Finance.create({
userId:ctx.from.id,
type:"withdraw",
amount:text
})

ADMIN_IDS.forEach(admin=>{
bot.telegram.sendMessage(
admin,
`💸 Withdraw Request

User: ${ctx.from.id}
Amount: ${text}`
)
})

ctx.reply("Withdraw request sent")

clearSession(ctx.from.id)

}

})

// ================= ADMIN COMMAND =================

bot.command("admin",async ctx=>{

if(!isAdmin(ctx.from.id)) return

ctx.reply("Admin Panel",adminMenu())

})

// ================= DASHBOARD =================

bot.hears("📊 Dashboard",async ctx=>{

if(!isAdmin(ctx.from.id)) return

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

if(!isAdmin(ctx.from.id)) return

const s=session(ctx.from.id)
s.step="broadcast"

ctx.reply("Send broadcast message")

})

bot.on("text",async ctx=>{

const s=session(ctx.from.id)

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

// ================= ERROR HANDLER =================

bot.catch(err=>console.log(err))

// ================= START =================

bot.launch()

console.log("🚀 Bot Running")
