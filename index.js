require("dotenv").config()

const { Telegraf, Markup } = require("telegraf")

const bot = new Telegraf(process.env.BOT_TOKEN)

const ADMIN_IDS = process.env.ADMIN_IDS
 ? process.env.ADMIN_IDS.split(",").map(Number)
 : []

// ================= SESSION =================

const sessions = {}

// ===== NEW: store last admin for each user (for user replies) =====
const userLastAdmin = {}

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
 const userId = ctx.from.id

 // ===== NEW: User replies to admin (if they are not in an active session) =====
 if (!ADMIN_IDS.includes(userId) && !session.state) {
   // Not an admin and not in a support flow → treat as reply to last admin
   const adminId = userLastAdmin[userId]
   if (adminId) {
     // Forward message to that admin
     bot.telegram.sendMessage(
       adminId,
       `✉️ Reply from user @${ctx.from.username || ctx.from.first_name} (ID: ${userId}):\n\n${ctx.message.text}`,
       Markup.inlineKeyboard([
         [Markup.button.callback("💬 Reply to user", `reply_${userId}`)]
       ])
     ).catch(() => {
       // If admin can't be reached, inform user
       ctx.reply("Sorry, we couldn't deliver your message. Please try again later.")
     })
     return
   } else {
     // No active admin conversation – maybe ignore or suggest starting a ticket
     return
   }
 }

 // Existing user flow: waiting for player ID
 if(session.state==="waiting_player_id"){
   session.data.playerId = ctx.message.text
   showDatePicker(ctx,session)
   return
 }

 // ===== NEW: Admin reply functionality =====
 if (ADMIN_IDS.includes(userId) && session.state === "admin_reply") {
   const targetUserId = session.data.targetUserId
   if (!targetUserId) {
     ctx.reply("❌ Error: No user to reply to. Please click 'Reply' again.")
     clearSession(userId)
     return
   }

   // Send the admin's message to the original user
   bot.telegram.sendMessage(
     targetUserId,
     `✉️ Admin reply:\n\n${ctx.message.text}`
   ).then(() => {
     ctx.reply("✅ Your reply has been sent to the user.")
     // Store which admin last replied to this user (so user can reply back)
     userLastAdmin[targetUserId] = userId
   }).catch(() => {
     ctx.reply("❌ Failed to send message. The user might have blocked the bot.")
   })

   // Clear admin's reply state
   clearSession(userId)
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
 const userId = ctx.from.id

 // ===== NEW: Include userId in resolve callback data =====
 const message = `🎫 Player Request #${requestId}

User: ${ctx.from.first_name}
Telegram ID: ${userId}

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
 {text:"💬 Reply",callback_data:`reply_${userId}`},
 {text:"✅ Resolved",callback_data:`resolve_${requestId}_${userId}`}
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
 {text:"💬 Reply",callback_data:`reply_${userId}`},
 {text:"✅ Resolved",callback_data:`resolve_${requestId}_${userId}`}
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

// ===== NEW: Resolve action with rating prompt =====
bot.action(/resolve_(\d+)_(\d+)/, async (ctx) => {
  const requestId = ctx.match[1]
  const userId = parseInt(ctx.match[2])
  const adminId = ctx.from.id

  // Answer callback and remove buttons from admin message
  ctx.answerCbQuery("Ticket marked resolved")
  ctx.editMessageReplyMarkup({ inline_keyboard: [] })

  // Send rating prompt to user
  await bot.telegram.sendMessage(
    userId,
    `✅ Your request #${requestId} has been resolved.\n\nPlease rate your experience:`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback("1⭐ Best", `rate_${requestId}_${adminId}_1`),
        Markup.button.callback("2⭐ Good", `rate_${requestId}_${adminId}_2`),
        Markup.button.callback("3⭐ Poor", `rate_${requestId}_${adminId}_3`),
      ]
    ])
  )
})

// ===== NEW: Handle rating selection =====
bot.action(/rate_(\d+)_(\d+)_(\d)/, async (ctx) => {
  const requestId = ctx.match[1]
  const adminId = parseInt(ctx.match[2])
  const rating = ctx.match[3] // 1,2,3
  const userId = ctx.from.id

  let ratingText = ""
  if (rating === "1") ratingText = "1⭐ Best"
  else if (rating === "2") ratingText = "2⭐ Good"
  else if (rating === "3") ratingText = "3⭐ Poor"

  // Notify admin
  await bot.telegram.sendMessage(
    adminId,
    `📊 User @${ctx.from.username || ctx.from.first_name} (ID: ${userId}) rated request #${requestId} as: ${ratingText}`
  )

  // Thank user
  ctx.editMessageText("Thank you for your feedback! 🙏")
  ctx.answerCbQuery()
})

// ===== NEW: Admin reply handler (same as before but we store mapping) =====
bot.action(/reply_(\d+)/, (ctx) => {
  const adminId = ctx.from.id

  if (!ADMIN_IDS.includes(adminId)) {
    return ctx.answerCbQuery("You are not authorized")
  }

  const targetUserId = parseInt(ctx.match[1])
  const session = getSession(adminId)
  session.state = "admin_reply"
  session.data.targetUserId = targetUserId

  ctx.answerCbQuery()
  ctx.reply("✏️ Please type your reply message below. It will be sent to the user.")
})

// ================= START BOT =================

bot.launch()

console.log("🚀 Bot Running")
