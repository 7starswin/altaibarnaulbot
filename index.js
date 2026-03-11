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

bot.hears("👤 Player Support", async (ctx) => {

const session = getSession(ctx.from.id)

clearSession(ctx.from.id)

session.state = "player_country_selection"
session.data = { type: "player", language: "en" }

return ctx.reply(
"👤 Player Support\n\nWhere are you from?",
Markup.inlineKeyboard([
[
Markup.button.callback("🇧🇩 Bangladesh", "player_select_bangladesh"),
Markup.button.callback("🇮🇳 India", "player_select_india")
],
[
Markup.button.callback("« Back", "main_menu")
]
])
)

})


// ================= COUNTRY =================

bot.action(/player_select_(.+)/, async (ctx) => {

const country = ctx.match[1]
const session = getSession(ctx.from.id)

if(session.processing) return
session.processing = true

session.data.country = country
session.state = "player_issue_selection"

await ctx.editMessageText(
`🌍 Player Support - ${country.toUpperCase()}

What issue type?`,
Markup.inlineKeyboard([
[
Markup.button.callback("Deposit","player_issue_deposit"),
Markup.button.callback("Withdrawal","player_issue_withdrawal")
],
[
Markup.button.callback("← Back","player_back_country")
]
])
)

session.processing = false

})


// ================= ISSUE TYPE =================

bot.action("player_issue_deposit", async (ctx)=>{

const session = getSession(ctx.from.id)

session.data.issueType="Deposit"

if(session.data.country==="bangladesh"){
return showBangladeshOptions(ctx,session)
}

if(session.data.country==="india"){
return showIndiaOptions(ctx,session)
}

return askUserId(ctx,session)

})


bot.action("player_issue_withdrawal", async (ctx)=>{

const session = getSession(ctx.from.id)

session.data.issueType="Withdrawal"

if(session.data.country==="bangladesh"){
return showBangladeshOptions(ctx,session)
}

if(session.data.country==="india"){
return showIndiaOptions(ctx,session)
}

return askUserId(ctx,session)

})


// ================= BANGLADESH PAYMENTS =================

async function showBangladeshOptions(ctx,session){

session.state="waiting_payment"

return ctx.editMessageText(
"🇧🇩 Bangladesh Payment Systems",
Markup.inlineKeyboard([
[
Markup.button.callback("bKash","pay_bkash"),
Markup.button.callback("Nagad","pay_nagad")
],
[
Markup.button.callback("Rocket","pay_rocket"),
Markup.button.callback("Upay","pay_upay")
],
[
Markup.button.callback("MoneyGo","pay_moneygo"),
Markup.button.callback("Binance","pay_binance")
],
[
Markup.button.callback("Main Menu","main_menu")
]
])
)

}


// ================= INDIA PAYMENTS =================

async function showIndiaOptions(ctx,session){

session.state="waiting_payment"

return ctx.editMessageText(
"🇮🇳 India Payment Systems",
Markup.inlineKeyboard([
[
Markup.button.callback("PhonePe","pay_phonepe"),
Markup.button.callback("PayTM UPI","pay_paytm")
],
[
Markup.button.callback("Main Menu","main_menu")
]
])
)

}


// ================= PAYMENT SELECT =================

bot.action(/pay_(.+)/,async(ctx)=>{

const payment=ctx.match[1]
const session=getSession(ctx.from.id)

session.data.paymentSystem=payment

return askPlayerIdForWithdrawal(ctx,session,payment)

})


// ================= PLAYER ID =================

async function askPlayerIdForWithdrawal(ctx,session,payment){

session.state="waiting_player_id_withdrawal"

await ctx.reply(
`📢 ${session.data.issueType} – ${payment}

Please enter your Player ID:`)

}


// ================= TEXT INPUT =================

bot.on("text",async(ctx)=>{

const session=getSession(ctx.from.id)

if(session.state==="waiting_player_id_withdrawal"){

session.data.userId=ctx.message.text

return showDatePicker(ctx,session)

}

})


// ================= DATE PICKER =================

async function showDatePicker(ctx,session){

session.state="waiting_date"

const days=[]

for(let i=1;i<=31;i++){

days.push(Markup.button.callback(String(i),`date_${i}`))

}

const keyboard=[]

while(days.length){
keyboard.push(days.splice(0,7))
}

keyboard.push([Markup.button.callback("Main Menu","main_menu")])

return ctx.reply(
"📅 Select Date",
Markup.inlineKeyboard(keyboard)
)

}


// ================= DATE SELECT =================

bot.action(/date_(\d+)/,async(ctx)=>{

const day=ctx.match[1]
const session=getSession(ctx.from.id)

session.data.date=day

session.state="waiting_file"

return ctx.reply(
"📎 Please upload screenshot (photo or video)"
)

})


// ================= FILE UPLOAD =================

bot.on(["photo","video"],async(ctx)=>{

const session=getSession(ctx.from.id)

if(session.state!=="waiting_file") return

if(ctx.message.photo){

session.data.fileId=ctx.message.photo.pop().file_id
session.data.fileType="photo"

}

if(ctx.message.video){

session.data.fileId=ctx.message.video.file_id
session.data.fileType="video"

}

return showPlayerConfirmation(ctx,session)

})


// ================= CONFIRMATION =================

async function showPlayerConfirmation(ctx,session){

session.state="confirm_player"

let summary=`📋 Confirm Details

Country: ${session.data.country}
Issue: ${session.data.issueType}
Payment: ${session.data.paymentSystem}
Player ID: ${session.data.userId}
Date: ${session.data.date}

Is the information correct?`

if(session.data.fileType==="photo"){
await ctx.replyWithPhoto(session.data.fileId,{caption:summary})
}
else if(session.data.fileType==="video"){
await ctx.replyWithVideo(session.data.fileId,{caption:summary})
}
else{
await ctx.reply(summary)
}

return ctx.reply(
"Confirm submission?",
Markup.inlineKeyboard([
[
Markup.button.callback("Submit","submit_player_request")
],
[
Markup.button.callback("Restart","restart_player")
],
[
Markup.button.callback("Main Menu","main_menu")
]
])
)

}


// ================= SUBMIT =================

bot.action("submit_player_request",async(ctx)=>{

const session=getSession(ctx.from.id)

if(session.submitting) return
session.submitting=true

const requestId=Math.floor(1000+Math.random()*9000)

const message=`🎫 Player Request #${requestId}

User: ${ctx.from.first_name}
Telegram ID: ${ctx.from.id}

Country: ${session.data.country}
Issue: ${session.data.issueType}
Payment: ${session.data.paymentSystem}
Player ID: ${session.data.userId}
Date: ${session.data.date}
`

for(const admin of ADMIN_IDS){

if(session.data.fileType==="photo"){

await bot.telegram.sendPhoto(
admin,
session.data.fileId,
{
caption:message,
reply_markup:{
inline_keyboard:[
[
{ text:"💬 Reply",callback_data:`admin_reply_${ctx.from.id}` },
{ text:"✅ Resolved",callback_data:`admin_resolve_${requestId}` }
]
]
}
}
)

}else{

await bot.telegram.sendMessage(
admin,
message,
{
reply_markup:{
inline_keyboard:[
[
{ text:"💬 Reply",callback_data:`admin_reply_${ctx.from.id}` },
{ text:"✅ Resolved",callback_data:`admin_resolve_${requestId}` }
]
]
}
}
)

}

}

await ctx.reply(
`✅ Request registered ${requestId}

Admin team will respond shortly.`,
userMenu()
)

clearSession(ctx.from.id)

})

// ================= AFFILIATE =================

bot.hears("💰 Affiliate Support",ctx=>{
 ctx.reply("Affiliate support will contact you soon.")
})

// ================= AGENT =================

bot.hears("🤝 Become Agent",ctx=>{
 ctx.reply("Send your country to apply for agent")
})

// ================= ADMIN PANEL =================

bot.command("admin",ctx=>{

 if(!ADMIN_IDS.includes(ctx.from.id)) return

 ctx.reply("Admin Panel",adminMenu())

})

// ================= DASHBOARD =================

bot.hears("📊 Dashboard",async ctx=>{

 if(!ADMIN_IDS.includes(ctx.from.id)) return

 const total=await Ticket.countDocuments()

 ctx.reply(`Total Tickets: ${total}`)

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

console.log("🚀 Bot Running")
