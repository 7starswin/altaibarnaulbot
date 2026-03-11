require("dotenv").config()

const { Telegraf, Markup } = require("telegraf")

const bot = new Telegraf(process.env.BOT_TOKEN)

const ADMIN_IDS = process.env.ADMIN_IDS
 ? process.env.ADMIN_IDS.split(",").map(Number)
 : []

// ================= SESSION =================

const sessions = {}

function getSession(userId){
 if(!sessions[userId]){
  sessions[userId] = {
   state:null,
   data:{},
   processing:false,
   submitting:false
  }
 }
 return sessions[userId]
}

function clearSession(userId){
 delete sessions[userId]
}

// ================= MENU =================

function userMenu(){
 return Markup.keyboard([
  ["👤 Player Support"],
  ["💰 Affiliate Support","🤝 Become Agent"]
 ]).resize()
}

// ================= START =================

bot.start((ctx)=>{
 ctx.reply("Welcome to Support Bot",userMenu())
})

// ================= PLAYER SUPPORT =================

bot.hears("👤 Player Support",(ctx)=>{

 const session = getSession(ctx.from.id)

 clearSession(ctx.from.id)

 const s = getSession(ctx.from.id)

 s.state="player_country_selection"
 s.data={ type:"player",language:"en" }

 ctx.reply(
 "👤 Player Support\n\nWhere are you from?",
 Markup.inlineKeyboard([
 [
 Markup.button.callback("🇧🇩 Bangladesh","player_select_bangladesh"),
 Markup.button.callback("🇮🇳 India","player_select_india")
 ],
 [
 Markup.button.callback("« Back","main_menu")
 ]
 ])
 )

})

// ================= COUNTRY =================

bot.action(/player_select_(.+)/,(ctx)=>{

 const country = ctx.match[1]
 const session = getSession(ctx.from.id)

 if(session.processing) return
 session.processing=true

 session.data.country=country
 session.state="player_issue_selection"

 ctx.editMessageText(
 `🌍 Player Support - ${country}

What issue type?`,
 Markup.inlineKeyboard([
 [
 Markup.button.callback("Deposit","player_issue_deposit"),
 Markup.button.callback("Withdrawal","player_issue_withdrawal")
 ],
 [
 Markup.button.callback("← Back","main_menu")
 ]
 ])
 )

 session.processing=false

})

// ================= ISSUE =================

bot.action("player_issue_deposit",(ctx)=>{

 const session = getSession(ctx.from.id)

 session.data.issueType="Deposit"

 if(session.data.country==="bangladesh"){
 return showBangladeshOptions(ctx,session)
 }

 if(session.data.country==="india"){
 return showIndiaOptions(ctx,session)
 }

 askUserId(ctx,session)

})

bot.action("player_issue_withdrawal",(ctx)=>{

 const session = getSession(ctx.from.id)

 session.data.issueType="Withdrawal"

 if(session.data.country==="bangladesh"){
 return showBangladeshOptions(ctx,session)
 }

 if(session.data.country==="india"){
 return showIndiaOptions(ctx,session)
 }

 askUserId(ctx,session)

})

// ================= BANGLADESH PAYMENTS =================

function showBangladeshOptions(ctx,session){

 session.state="waiting_payment"

 ctx.editMessageText(
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

function showIndiaOptions(ctx,session){

 session.state="waiting_payment"

 ctx.editMessageText(
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

// ================= PAYMENT =================

bot.action(/pay_(.+)/,(ctx)=>{

 const pay = ctx.match[1]
 const session = getSession(ctx.from.id)

 session.data.paymentSystem = pay

 askPlayerId(ctx,session,pay)

})

// ================= PLAYER ID =================

function askPlayerId(ctx,session,payment){

 session.state="waiting_player_id"

 ctx.reply(
 `📢 ${session.data.issueType} – ${payment}

Please enter your Player ID:`
 )

}

// ================= TEXT =================

bot.on("text",(ctx)=>{

 const session = getSession(ctx.from.id)

 if(session.state==="waiting_player_id"){

 session.data.playerId = ctx.message.text

 showDatePicker(ctx,session)

 }

})

// ================= DATE PICKER =================

function showDatePicker(ctx,session){

 session.state="waiting_date"

 const buttons=[]

 for(let i=1;i<=31;i++){
 buttons.push(Markup.button.callback(String(i),`date_${i}`))
 }

 const keyboard=[]

 while(buttons.length){
 keyboard.push(buttons.splice(0,7))
 }

 keyboard.push([Markup.button.callback("Main Menu","main_menu")])

 ctx.reply(
 "📅 Select Date",
 Markup.inlineKeyboard(keyboard)
 )

}

// ================= DATE =================

bot.action(/date_(\d+)/,(ctx)=>{

 const day = ctx.match[1]
 const session = getSession(ctx.from.id)

 session.data.date = day

 session.state="waiting_file"

 ctx.reply("📎 Upload screenshot (photo/video)")

})

// ================= FILE UPLOAD =================

bot.on(["photo","video"],(ctx)=>{

 const session = getSession(ctx.from.id)

 if(session.state!=="waiting_file") return

 if(ctx.message.photo){
 session.data.fileId = ctx.message.photo.pop().file_id
 session.data.fileType="photo"
 }

 if(ctx.message.video){
 session.data.fileId = ctx.message.video.file_id
 session.data.fileType="video"
 }

 showConfirmation(ctx,session)

})

// ================= CONFIRM =================

async function showConfirmation(ctx,session){

 session.state="confirm"

 let summary = `📋 Confirm Details

Country: ${session.data.country}
Issue: ${session.data.issueType}
Payment: ${session.data.paymentSystem}
Player ID: ${session.data.playerId}
Date: ${session.data.date}`

 if(session.data.fileType==="photo"){
 await ctx.replyWithPhoto(session.data.fileId,{caption:summary})
 }else{
 await ctx.replyWithVideo(session.data.fileId,{caption:summary})
 }

 ctx.reply(
 "Submit request?",
 Markup.inlineKeyboard([
 [
 Markup.button.callback("Submit","submit_player")
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

bot.action("submit_player",async(ctx)=>{

 const session = getSession(ctx.from.id)

 if(session.submitting) return
 session.submitting=true

 const requestId = Math.floor(1000+Math.random()*9000)

 const message = `🎫 Player Request #${requestId}

User: ${ctx.from.first_name}
Telegram ID: ${ctx.from.id}

Country: ${session.data.country}
Issue: ${session.data.issueType}
Payment: ${session.data.paymentSystem}
Player ID: ${session.data.playerId}
Date: ${session.data.date}`

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
 {text:"💬 Reply",callback_data:`reply_${ctx.from.id}`},
 {text:"✅ Resolved",callback_data:`resolve_${requestId}`}
 ]
 ]
 }
 }
 )

 }else{

 await bot.telegram.sendVideo(
 admin,
 session.data.fileId,
 {
 caption:message,
 reply_markup:{
 inline_keyboard:[
 [
 {text:"💬 Reply",callback_data:`reply_${ctx.from.id}`},
 {text:"✅ Resolved",callback_data:`resolve_${requestId}`}
 ]
 ]
 }
 }
 )

 }

 }

 ctx.reply(
 `✅ Request registered ${requestId}

Admin team will respond shortly.`,
 userMenu()
 )

 clearSession(ctx.from.id)

})

// ================= ADMIN ACTIONS =================

bot.action(/resolve_(.+)/,(ctx)=>{

 ctx.answerCbQuery("Ticket marked resolved")

 ctx.editMessageReplyMarkup({inline_keyboard:[]})

})

// ================= START BOT =================

bot.launch()

console.log("🚀 Bot Running")
