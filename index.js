require("dotenv").config()

const { Telegraf, Markup } = require("telegraf")

const bot = new Telegraf(process.env.BOT_TOKEN)

const ADMIN_IDS = process.env.ADMIN_IDS
 ? process.env.ADMIN_IDS.split(",").map(Number)
 : []

// ================= SESSION =================

const sessions = {}
const userLastAdmin = {} // for user replies to admin

function getSession(userId){
 if(!sessions[userId]){
  sessions[userId] = {
   state: null,
   data: {},
   processing: false,
   submitting: false,
   calendar: { year: new Date().getFullYear(), month: new Date().getMonth() } // for date picker
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
 ctx.reply("Welcome to Support Bot", userMenu())
})

// ================= PLAYER SUPPORT =================

bot.hears("👤 Player Support", (ctx)=>{
 clearSession(ctx.from.id)
 const session = getSession(ctx.from.id)
 session.state = "player_country_selection"
 session.data.type = "player"

 ctx.reply(
  "👤 Player Support\n\nWhere are you from?",
  Markup.inlineKeyboard([
   [
    Markup.button.callback("🇧🇩 Bangladesh", "player_select_bangladesh"),
    Markup.button.callback("🇮🇳 India", "player_select_india")
   ],
   [Markup.button.callback("« Back", "main_menu")]
  ])
 )
})

// ================= COUNTRY SELECTION =================

bot.action(/player_select_(.+)/, (ctx)=>{
 const country = ctx.match[1]
 const session = getSession(ctx.from.id)
 if (session.processing) return
 session.processing = true

 session.data.country = country
 session.state = "player_issue_selection"

 ctx.editMessageText(
  `🌍 Player Support - ${country}\n\nWhat issue type?`,
  Markup.inlineKeyboard([
   [
    Markup.button.callback("Deposit", "player_issue_deposit"),
    Markup.button.callback("Withdrawal", "player_issue_withdrawal")
   ],
   [Markup.button.callback("← Back", "main_menu")]
  ])
 )
 session.processing = false
})

// ================= ISSUE TYPE =================

bot.action("player_issue_deposit", (ctx)=>{
 const session = getSession(ctx.from.id)
 session.data.issueType = "Deposit"

 if (session.data.country === "bangladesh") {
  return showBangladeshPayments(ctx, session)
 }
 if (session.data.country === "india") {
  return showIndiaPayments(ctx, session)
 }
 // fallback (should not happen)
 ctx.reply("Please select a country first.")
})

bot.action("player_issue_withdrawal", (ctx)=>{
 const session = getSession(ctx.from.id)
 session.data.issueType = "Withdrawal"

 if (session.data.country === "bangladesh") {
  return showBangladeshPayments(ctx, session)
 }
 if (session.data.country === "india") {
  return showIndiaPayments(ctx, session)
 }
 ctx.reply("Please select a country first.")
})

// ================= PAYMENT SYSTEMS =================

function showBangladeshPayments(ctx, session) {
 session.state = "waiting_payment"
 ctx.editMessageText(
  "🇧🇩 Bangladesh Payment Systems",
  Markup.inlineKeyboard([
   [
    Markup.button.callback("bKash", "pay_bkash"),
    Markup.button.callback("Nagad", "pay_nagad")
   ],
   [
    Markup.button.callback("Rocket", "pay_rocket"),
    Markup.button.callback("Upay", "pay_upay")
   ],
   [
    Markup.button.callback("MoneyGo", "pay_moneygo"),
    Markup.button.callback("Binance", "pay_binance")
   ],
   [Markup.button.callback("Main Menu", "main_menu")]
  ])
 )
}

function showIndiaPayments(ctx, session) {
 session.state = "waiting_payment"
 ctx.editMessageText(
  "🇮🇳 India Payment Systems",
  Markup.inlineKeyboard([
   [
    Markup.button.callback("PhonePe", "pay_phonepe"),
    Markup.button.callback("PayTM UPI", "pay_paytm")
   ],
   [Markup.button.callback("Main Menu", "main_menu")]
  ])
 )
}

// ================= PAYMENT SELECTED =================

bot.action(/pay_(.+)/, (ctx)=>{
 const payment = ctx.match[1]
 const session = getSession(ctx.from.id)
 session.data.paymentSystem = payment

 // Start asking for details
 session.state = "waiting_game_user_id"
 ctx.reply("Enter User ID (numbers only):")
})

// ================= DETAILS COLLECTION =================

// Game User ID
bot.on("text", (ctx)=>{
 const session = getSession(ctx.from.id)
 const userId = ctx.from.id

 // --- User replies to admin (if not in a support flow) ---
 if (!ADMIN_IDS.includes(userId) && !session.state) {
   const adminId = userLastAdmin[userId]
   if (adminId) {
     bot.telegram.sendMessage(
       adminId,
       `✉️ Reply from user @${ctx.from.username || ctx.from.first_name} (ID: ${userId}):\n\n${ctx.message.text}`,
       Markup.inlineKeyboard([
         [Markup.button.callback("💬 Reply to user", `reply_${userId}`)]
       ])
     ).catch(() => {
       ctx.reply("Sorry, we couldn't deliver your message. Please try again later.")
     })
   }
   return
 }

 // --- Admin reply ---
 if (ADMIN_IDS.includes(userId) && session.state === "admin_reply") {
   const targetUserId = session.data.targetUserId
   if (!targetUserId) {
     ctx.reply("❌ Error: No user to reply to. Please click 'Reply' again.")
     clearSession(userId)
     return
   }
   bot.telegram.sendMessage(targetUserId, `✉️ Admin reply:\n\n${ctx.message.text}`)
     .then(() => {
       ctx.reply("✅ Your reply has been sent to the user.")
       userLastAdmin[targetUserId] = userId
     })
     .catch(() => {
       ctx.reply("❌ Failed to send message. The user might have blocked the bot.")
     })
   clearSession(userId)
   return
 }

 // --- Support flow: handle each state ---
 if (session.state === "waiting_game_user_id") {
   session.data.gameUserId = ctx.message.text
   session.state = "waiting_phone_number"
   ctx.reply("Enter Phone Number (format: +880XXXXXXXXXXX):")
 }
 else if (session.state === "waiting_phone_number") {
   session.data.phoneNumber = ctx.message.text
   session.state = "waiting_agent_number"
   ctx.reply("Enter Agent Number:")
 }
 else if (session.state === "waiting_agent_number") {
   session.data.agentNumber = ctx.message.text
   session.state = "waiting_date"
   showCalendar(ctx, session)
 }
 else if (session.state === "waiting_time") {
   session.data.selectedTime = ctx.message.text
   session.state = "waiting_amount"
   ctx.reply("Enter Amount:")
 }
 else if (session.state === "waiting_amount") {
   session.data.amount = ctx.message.text
   session.state = "waiting_trx_id"
   ctx.reply("Enter Transaction ID (Trx ID):")
 }
 else if (session.state === "waiting_trx_id") {
   session.data.trxId = ctx.message.text
   session.state = "waiting_file"
   ctx.reply("Please upload a screenshot or video file.")
 }
})

// ================= CALENDAR =================

function showCalendar(ctx, session) {
 const now = new Date()
 let year = session.calendar.year
 let month = session.calendar.month

 const monthNames = ["January", "February", "March", "April", "May", "June",
   "July", "August", "September", "October", "November", "December"]

 const firstDay = new Date(year, month, 1).getDay() // 0 = Sunday
 const daysInMonth = new Date(year, month + 1, 0).getDate()

 let buttons = []
 let row = []

 // Fill leading empty cells (Sunday first)
 for (let i = 0; i < firstDay; i++) {
   row.push(Markup.button.callback(" ", "ignore")) // empty placeholder
 }

 for (let d = 1; d <= daysInMonth; d++) {
   row.push(Markup.button.callback(d.toString(), `date_${d}`))
   if (row.length === 7) {
     buttons.push(row)
     row = []
   }
 }
 if (row.length > 0) {
   // pad remaining cells with empty
   while (row.length < 7) {
     row.push(Markup.button.callback(" ", "ignore"))
   }
   buttons.push(row)
 }

 // Navigation row
 buttons.push([
   Markup.button.callback("◀ Prev", "prev_month"),
   Markup.button.callback(`${monthNames[month]} ${year}`, "ignore"),
   Markup.button.callback("Next ▶", "next_month")
 ])
 buttons.push([Markup.button.callback("Main Menu", "main_menu")])

 ctx.reply(
   `📅 Select Date\nCurrent Month: ${monthNames[month]} ${year}`,
   Markup.inlineKeyboard(buttons)
 )
}

// Handle day selection
bot.action(/date_(\d+)/, (ctx)=>{
 const day = ctx.match[1]
 const session = getSession(ctx.from.id)
 const year = session.calendar.year
 const month = session.calendar.month
 const selectedDate = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
 session.data.selectedDate = selectedDate
 session.state = "waiting_time"
 ctx.editMessageText(`Selected date: ${selectedDate}\n\nPlease enter time in any format:`)
})

// Month navigation
bot.action("prev_month", (ctx)=>{
 const session = getSession(ctx.from.id)
 let { year, month } = session.calendar
 if (month === 0) {
   month = 11
   year -= 1
 } else {
   month -= 1
 }
 session.calendar = { year, month }
 showCalendar(ctx, session)
})

bot.action("next_month", (ctx)=>{
 const session = getSession(ctx.from.id)
 let { year, month } = session.calendar
 if (month === 11) {
   month = 0
   year += 1
 } else {
   month += 1
 }
 session.calendar = { year, month }
 showCalendar(ctx, session)
})

// Ignore empty calendar cells
bot.action("ignore", (ctx)=> ctx.answerCbQuery())

// ================= FILE UPLOAD =================

bot.on(["photo", "video"], (ctx)=>{
 const session = getSession(ctx.from.id)
 if (session.state !== "waiting_file") return

 if (ctx.message.photo) {
   session.data.fileId = ctx.message.photo.pop().file_id
   session.data.fileType = "photo"
   session.data.fileName = "screenshot.jpg"
 } else if (ctx.message.video) {
   session.data.fileId = ctx.message.video.file_id
   session.data.fileType = "video"
   session.data.fileName = "video.mp4"
 }

 ctx.reply("File uploaded successfully!")

 // Show confirmation with all details
 showConfirmation(ctx, session)
})

// ================= CONFIRMATION =================

async function showConfirmation(ctx, session) {
 session.state = "confirm"

 const summary = `📋 Confirm Your Details

country: ${session.data.country}
issueType: ${session.data.issueType}
paymentSystem: ${session.data.paymentSystem}
gameUserId: ${session.data.gameUserId}
phoneNumber: ${session.data.phoneNumber}
agentNumber: ${session.data.agentNumber}
selectedDate: ${session.data.selectedDate}
selectedTime: ${session.data.selectedTime}
amount: ${session.data.amount}
trxId: ${session.data.trxId}
fileName: ${session.data.fileName}

Is this information correct?`

 if (session.data.fileType === "photo") {
   await ctx.replyWithPhoto(session.data.fileId, { caption: summary })
 } else {
   await ctx.replyWithVideo(session.data.fileId, { caption: summary })
 }

 ctx.reply(
   "Please confirm:",
   Markup.inlineKeyboard([
     [Markup.button.callback("Submit", "submit_player")],
     [Markup.button.callback("Restart", "restart_player")],
     [Markup.button.callback("Main Menu", "main_menu")]
   ])
 )
}

// ================= SUBMIT =================

bot.action("submit_player", async (ctx)=>{
 const session = getSession(ctx.from.id)
 if (session.submitting) return
 session.submitting = true

 const requestId = Math.floor(1000 + Math.random() * 9000)
 const userId = ctx.from.id

 const message = `🎫 Player Request #${requestId}

User: ${ctx.from.first_name}
Telegram ID: ${userId}

Country: ${session.data.country}
Issue: ${session.data.issueType}
Payment: ${session.data.paymentSystem}
Game User ID: ${session.data.gameUserId}
Phone Number: ${session.data.phoneNumber}
Agent Number: ${session.data.agentNumber}
Date: ${session.data.selectedDate}
Time: ${session.data.selectedTime}
Amount: ${session.data.amount}
Transaction ID: ${session.data.trxId}`

 for (const admin of ADMIN_IDS) {
   if (session.data.fileType === "photo") {
     await bot.telegram.sendPhoto(
       admin,
       session.data.fileId,
       {
         caption: message,
         reply_markup: {
           inline_keyboard: [
             [
               { text: "💬 Reply", callback_data: `reply_${userId}` },
               { text: "✅ Resolved", callback_data: `resolve_${requestId}_${userId}` }
             ]
           ]
         }
       }
     )
   } else {
     await bot.telegram.sendVideo(
       admin,
       session.data.fileId,
       {
         caption: message,
         reply_markup: {
           inline_keyboard: [
             [
               { text: "💬 Reply", callback_data: `reply_${userId}` },
               { text: "✅ Resolved", callback_data: `resolve_${requestId}_${userId}` }
             ]
           ]
         }
       }
     )
   }
 }

 ctx.reply(
   `✅ Request registered ${requestId}\n\nAdmin team will respond shortly.`,
   userMenu()
 )

 clearSession(ctx.from.id)
})

// ================= RESTART / MAIN MENU =================

bot.action("restart_player", (ctx)=>{
 const userId = ctx.from.id
 clearSession(userId)
 // Restart player support flow
 const session = getSession(userId)
 session.state = "player_country_selection"
 session.data.type = "player"
 ctx.editMessageText(
   "👤 Player Support\n\nWhere are you from?",
   Markup.inlineKeyboard([
     [
       Markup.button.callback("🇧🇩 Bangladesh", "player_select_bangladesh"),
       Markup.button.callback("🇮🇳 India", "player_select_india")
     ],
     [Markup.button.callback("« Back", "main_menu")]
   ])
 )
})

bot.action("main_menu", (ctx)=>{
 const userId = ctx.from.id
 clearSession(userId)
 ctx.deleteMessage().catch(()=>{})
 ctx.reply("Main menu:", userMenu())
})

// ================= ADMIN ACTIONS (resolve & reply) =================

bot.action(/resolve_(\d+)_(\d+)/, async (ctx)=>{
 const requestId = ctx.match[1]
 const userId = parseInt(ctx.match[2])
 const adminId = ctx.from.id

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

bot.action(/rate_(\d+)_(\d+)_(\d)/, async (ctx)=>{
 const requestId = ctx.match[1]
 const adminId = parseInt(ctx.match[2])
 const rating = ctx.match[3] // 1,2,3
 const userId = ctx.from.id

 let ratingText = ""
 if (rating === "1") ratingText = "10🚀 Best"
 else if (rating === "2") ratingText = "7❤️ Good"
 else if (rating === "3") ratingText = "4👎 Poor"

 await bot.telegram.sendMessage(
   adminId,
   `📊 User @${ctx.from.username || ctx.from.first_name} (ID: ${userId}) rated request #${requestId} as: ${ratingText}`
 )

 ctx.editMessageText("Thank you for your feedback! 𝄃𝄃𝄂𝄂𝄀𝄁𝄃𝄂𝄂𝄃 ☕🎯")
 ctx.answerCbQuery()
})

bot.action(/reply_(\d+)/, (ctx)=>{
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

// ================= AFFILIATE / AGENT PLACEHOLDERS =================

bot.hears("💰 Affiliate Support", (ctx)=>{
 ctx.reply("Affiliate support coming soon.", userMenu())
})

bot.hears("🤝 Become Agent", (ctx)=>{
 ctx.reply("Agent registration coming soon.", userMenu())
})

// ================= START BOT =================

bot.launch()
console.log("🚀 Bot Running")
