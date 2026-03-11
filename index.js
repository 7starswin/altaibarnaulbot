require("dotenv").config()

const { Telegraf, Markup } = require("telegraf")
const mongoose = require("mongoose")

const bot = new Telegraf(process.env.BOT_TOKEN)

const ADMIN_IDS = process.env.ADMIN_IDS
 ? process.env.ADMIN_IDS.split(",").map(Number)
 : []

// ================= DATABASE =================

mongoose.connect(process.env.MONGO_URI)

const Ticket = mongoose.model("Ticket",{
ticket:Number,
userId:Number,
country:String,
type:String,
payment:String,
playerId:String,
date:String,
status:{type:String,default:"pending"}
})

// ================= SESSION =================

const sessions = {}

function session(id){
 if(!sessions[id]) sessions[id]={step:null,data:{}}
 return sessions[id]
}

function clear(id){
 delete sessions[id]
}

// ================= MENUS =================

function userMenu(){
 return Markup.keyboard([
 ["👤 Player Support"],
 ["💰 Affiliate Support"],
 ["🤝 Become Agent"]
 ]).resize()
}

function adminMenu(){
 return Markup.keyboard([
 ["📊 Dashboard"],
 ["📢 Broadcast"],
 ["💳 Deposit Requests"],
 ["💸 Withdraw Requests"]
 ]).resize()
}

// ================= START =================

bot.start(ctx=>{
 ctx.reply("Welcome",userMenu())
})

// ================= PLAYER SUPPORT =================

bot.hears("👤 Player Support",ctx=>{

 const s=session(ctx.from.id)
 s.step="country"

 ctx.reply(
 "Where are you from?",
 Markup.inlineKeyboard([
 [
 Markup.button.callback("🇧🇩 Bangladesh","c_bd"),
 Markup.button.callback("🇮🇳 India","c_in")
 ],
 [
 Markup.button.callback("🇵🇰 Pakistan","c_pk"),
 Markup.button.callback("🇹🇷 Turkey","c_tr")
 ],
 [
 Markup.button.callback("🇹🇭 Thailand","c_th"),
 Markup.button.callback("🇪🇬 Egypt","c_eg")
 ]
 ])
 )

})

// ================= COUNTRY SELECT =================

bot.action(/c_(.+)/,ctx=>{

 const s=session(ctx.from.id)

 s.data.country=ctx.match[1]
 s.step="issue"

 ctx.reply(
 "Select issue type",
 Markup.inlineKeyboard([
 [Markup.button.callback("Deposit Issue","issue_deposit")],
 [Markup.button.callback("Withdraw Issue","issue_withdraw")]
 ])
 )

})

// ================= ISSUE TYPE =================

bot.action(/issue_(.+)/,ctx=>{

 const s=session(ctx.from.id)

 s.data.type=ctx.match[1]
 s.step="payment"

 ctx.reply(
 "Select Payment Method",
 Markup.inlineKeyboard([
 [
 Markup.button.callback("bKash","p_bkash"),
 Markup.button.callback("Nagad","p_nagad")
 ],
 [
 Markup.button.callback("Rocket","p_rocket"),
 Markup.button.callback("Upay","p_upay")
 ]
 ])
 )

})

// ================= PAYMENT =================

bot.action(/p_(.+)/,ctx=>{

 const s=session(ctx.from.id)

 s.data.payment=ctx.match[1]
 s.step="playerid"

 ctx.reply("Enter Player ID")

})

// ================= TEXT HANDLER =================

bot.on("text",async ctx=>{

 const s=session(ctx.from.id)

 if(s.step==="playerid"){

 s.data.playerId=ctx.message.text
 s.step="date"

 ctx.reply("Enter date of transaction")

 return
 }

 if(s.step==="date"){

 s.data.date=ctx.message.text

 const ticket=Math.floor(1000+Math.random()*9000)

 await Ticket.create({
 ticket,
 userId:ctx.from.id,
 country:s.data.country,
 type:s.data.type,
 payment:s.data.payment,
 playerId:s.data.playerId,
 date:s.data.date
 })

 ADMIN_IDS.forEach(admin=>{
 bot.telegram.sendMessage(
 admin,
 `New Player Ticket #${ticket}

User: ${ctx.from.id}
Country: ${s.data.country}
Issue: ${s.data.type}
Payment: ${s.data.payment}
PlayerID: ${s.data.playerId}
Date: ${s.data.date}`
 )
 })

 ctx.reply(`✅ Ticket submitted\nTicket ID: ${ticket}`)

 clear(ctx.from.id)

 }

})

// ================= AGENT =================

bot.hears("🤝 Become Agent",ctx=>{
 ctx.reply("Send your country to apply for agent")
})

// ================= AFFILIATE =================

bot.hears("💰 Affiliate Support",ctx=>{
 ctx.reply("Affiliate support will contact you soon.")
})

// ================= ADMIN PANEL =================

bot.command("admin",ctx=>{

 if(!ADMIN_IDS.includes(ctx.from.id)) return

 ctx.reply("Admin Panel",adminMenu())

})

// ================= DASHBOARD =================

bot.hears("📊 Dashboard",async ctx=>{

 if(!ADMIN_IDS.includes(ctx.from.id)) return

 const tickets=await Ticket.countDocuments()

 ctx.reply(`Total Tickets: ${tickets}`)

})

// ================= BROADCAST =================

bot.hears("📢 Broadcast",ctx=>{

 if(!ADMIN_IDS.includes(ctx.from.id)) return

 const s=session(ctx.from.id)
 s.step="broadcast"

 ctx.reply("Send message to broadcast")

})

bot.on("text",async ctx=>{

 const s=session(ctx.from.id)

 if(s.step==="broadcast"){

 const users=await Ticket.distinct("userId")

 for(const u of users){
 try{
 await bot.telegram.sendMessage(u,ctx.message.text)
 }catch{}
 }

 ctx.reply("Broadcast sent")
 clear(ctx.from.id)

 }

})

// ================= START BOT =================

bot.launch()

console.log("Bot running")
