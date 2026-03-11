require("dotenv").config()

const { Telegraf, Markup } = require("telegraf")

const bot = new Telegraf(process.env.BOT_TOKEN)

const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(",").map(Number)
  : []

// ================= IN-MEMORY STORAGE =================
const sessions = {}               // user sessions for active ticket creation
const userLastAdmin = {}           // last admin who replied to a user
const allUsers = new Set()         // all user IDs who ever interacted (for broadcast)
let pendingTickets = []            // array of open tickets

// ================= UTILITY =================
function generateTrackId() {
  return `TKT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`
}

function getSession(userId) {
  if (!sessions[userId]) {
    sessions[userId] = {
      state: null,
      data: {},
      processing: false,
      submitting: false,
      calendar: { year: new Date().getFullYear(), month: new Date().getMonth() }
    }
  }
  return sessions[userId]
}

function clearSession(userId) {
  delete sessions[userId]
}

function recordUser(userId) {
  allUsers.add(userId)
}

// Helper to safely get value or "Not provided"
function safe(val) {
  return val !== undefined && val !== null && val !== "" ? val : "Not provided"
}

// ================= MENUS =================
function userMenu() {
  return Markup.keyboard([
    ["👤 Player Support"],
    ["💰 Affiliate Support", "🤝 Become Agent"]
  ]).resize()
}

function adminMenu() {
  return Markup.keyboard([
    ["📥 Deposit Problems", "📤 Withdrawal Problems"],
    ["🤝 Agent Requests", "📢 Broadcast"],
    ["🔙 Main Menu"]
  ]).resize()
}

// ================= START =================
bot.start((ctx) => {
  const userId = ctx.from.id
  recordUser(userId)

  if (ADMIN_IDS.includes(userId)) {
    ctx.reply("Welcome Admin! Use the menu below to manage tickets.", adminMenu())
  } else {
    ctx.reply("Welcome to Support Bot", userMenu())
  }
})

// ================= MAIN MENU HANDLER =================
bot.hears("🔙 Main Menu", (ctx) => {
  if (ADMIN_IDS.includes(ctx.from.id)) {
    ctx.reply("Admin menu:", adminMenu())
  } else {
    ctx.reply("Main menu:", userMenu())
  }
})

// ================= ADMIN CATEGORY MENUS =================
// Show paginated list of deposit tickets
bot.hears("📥 Deposit Problems", (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return
  showTicketList(ctx, "deposit", 0)
})

bot.hears("📤 Withdrawal Problems", (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return
  showTicketList(ctx, "withdrawal", 0)
})

bot.hears("🤝 Agent Requests", (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return
  ctx.reply("Agent requests feature coming soon.")
})

bot.hears("📢 Broadcast", (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return
  const session = getSession(ctx.from.id)
  session.state = "admin_broadcast"
  ctx.reply("📢 Please enter the message you want to broadcast to all users:")
})

// ================= DISPLAY TICKET LIST (PAGINATED) =================
function showTicketList(ctx, category, page) {
  const tickets = pendingTickets.filter(t => t.category === category && t.status === "open")
  const pageSize = 5
  const totalPages = Math.ceil(tickets.length / pageSize) || 1
  const start = page * pageSize
  const end = start + pageSize
  const pageTickets = tickets.slice(start, end)

  if (tickets.length === 0) {
    ctx.reply(`No open ${category} tickets.`)
    return
  }

  const buttons = []
  pageTickets.forEach(t => {
    const username = t.username ? `@${t.username}` : `ID: ${t.userId}`
    buttons.push([Markup.button.callback(
      `${t.trackId} - ${username}`,
      `view_${category}_${t.trackId}`
    )])
  })

  // Navigation buttons
  const nav = []
  if (page > 0) {
    nav.push(Markup.button.callback("« Previous", `${category}_page_${page - 1}`))
  }
  nav.push(Markup.button.callback(`Page ${page+1}/${totalPages}`, "ignore"))
  if (page < totalPages - 1) {
    nav.push(Markup.button.callback("Next »", `${category}_page_${page + 1}`))
  }
  buttons.push(nav)
  buttons.push([Markup.button.callback("🔙 Main Menu", "main_menu")])

  ctx.reply(
    `📋 Open ${category === "deposit" ? "Deposit" : "Withdrawal"} Tickets:`,
    Markup.inlineKeyboard(buttons)
  )
}

// Pagination actions
bot.action(/^(deposit|withdrawal)_page_(\d+)$/, (ctx) => {
  const category = ctx.match[1]
  const page = parseInt(ctx.match[2])
  showTicketList(ctx, category, page)
})

// ================= VIEW SINGLE TICKET =================
bot.action(/^view_(deposit|withdrawal)_(TKT-.+)$/, async (ctx) => {
  const category = ctx.match[1]
  const trackId = ctx.match[2]
  const ticket = pendingTickets.find(t => t.trackId === trackId && t.status === "open")
  if (!ticket) {
    ctx.answerCbQuery("Ticket not found or already resolved.")
    return ctx.editMessageText("Ticket not found.")
  }

  const data = ticket.data
  const user = ticket.username ? `@${ticket.username}` : `ID: ${ticket.userId}`
  const details = `🎫 **Ticket ${trackId}**

**User:** ${user}
**Country:** ${safe(data.country)}
**Issue:** ${safe(data.issueType)}
**Payment:** ${safe(data.paymentSystem)}
**Game User ID:** ${safe(data.gameUserId)}
**Phone:** ${safe(data.phoneNumber)}
**Agent:** ${safe(data.agentNumber)}
**Date:** ${safe(data.selectedDate)}
**Time:** ${safe(data.selectedTime)}
**Amount:** ${safe(data.amount)}
**Trx ID:** ${safe(data.trxId)}
**File:** ${safe(data.fileName)}`

  await ctx.editMessageText(details, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "💬 Reply", callback_data: `reply_${ticket.userId}` },
          { text: "✅ Resolve", callback_data: `resolve_${trackId}_${ticket.userId}` }
        ],
        [
          { text: "🔙 Back to list", callback_data: `${category}_page_0` }
        ]
      ]
    }
  })
})

// ================= PLAYER SUPPORT =================
bot.hears("👤 Player Support", (ctx) => {
  const userId = ctx.from.id
  recordUser(userId)
  clearSession(userId)

  const session = getSession(userId)
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

// ================= AFFILIATE / AGENT PLACEHOLDERS =================
bot.hears("💰 Affiliate Support", (ctx) => {
  ctx.reply("Affiliate support coming soon.", userMenu())
})

bot.hears("🤝 Become Agent", (ctx) => {
  ctx.reply("Agent registration coming soon.", userMenu())
})

// ================= COUNTRY SELECTION =================
bot.action(/player_select_(.+)/, (ctx) => {
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
bot.action("player_issue_deposit", (ctx) => {
  const session = getSession(ctx.from.id)
  session.data.issueType = "Deposit"
  session.data.category = "deposit"

  if (session.data.country === "bangladesh") {
    return showBangladeshPayments(ctx, session)
  }
  if (session.data.country === "india") {
    return showIndiaPayments(ctx, session)
  }
  ctx.reply("Please select a country first.")
})

bot.action("player_issue_withdrawal", (ctx) => {
  const session = getSession(ctx.from.id)
  session.data.issueType = "Withdrawal"
  session.data.category = "withdrawal"

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
bot.action(/pay_(.+)/, (ctx) => {
  const payment = ctx.match[1]
  const session = getSession(ctx.from.id)
  session.data.paymentSystem = payment
  session.state = "waiting_game_user_id"
  ctx.reply("Enter User ID (numbers only):")
})

// ================= CALENDAR ACTIONS =================
bot.action(/date_(\d+)/, (ctx) => {
  const day = ctx.match[1]
  const session = getSession(ctx.from.id)
  const year = session.calendar.year
  const month = session.calendar.month
  const selectedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  session.data.selectedDate = selectedDate
  session.state = "waiting_time"
  ctx.editMessageText(`Selected date: ${selectedDate}\n\nPlease enter time in any format:`)
})

bot.action("prev_month", (ctx) => {
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

bot.action("next_month", (ctx) => {
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

bot.action("ignore", (ctx) => ctx.answerCbQuery())

// ================= RESTART / MAIN MENU ACTIONS =================
bot.action("restart_player", (ctx) => {
  const userId = ctx.from.id
  clearSession(userId)
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

bot.action("main_menu", (ctx) => {
  const userId = ctx.from.id
  clearSession(userId)
  ctx.deleteMessage().catch(() => {})
  if (ADMIN_IDS.includes(userId)) {
    ctx.reply("Admin menu:", adminMenu())
  } else {
    ctx.reply("Main menu:", userMenu())
  }
})

// ================= ADMIN ACTIONS (resolve & reply) =================
bot.action(/resolve_(.+)_(\d+)/, async (ctx) => {
  const trackId = ctx.match[1]
  const userId = parseInt(ctx.match[2])
  const adminId = ctx.from.id

  // Remove ticket from pending list
  const ticketIndex = pendingTickets.findIndex(t => t.trackId === trackId)
  if (ticketIndex !== -1) {
    pendingTickets.splice(ticketIndex, 1)
  }

  ctx.answerCbQuery("Ticket marked resolved")
  ctx.editMessageReplyMarkup({ inline_keyboard: [] })

  try {
    await bot.telegram.sendMessage(
      userId,
      `✅ Your request ${trackId} has been resolved.\n\nPlease rate your experience:`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("1⭐ Best", `rate_${trackId}_${adminId}_1`),
          Markup.button.callback("2⭐ Good", `rate_${trackId}_${adminId}_2`),
          Markup.button.callback("3⭐ Poor", `rate_${trackId}_${adminId}_3`),
        ]
      ])
    )
  } catch (error) {
    console.error("Failed to send rating prompt to user:", error)
  }
})

bot.action(/rate_(.+)_(\d+)_(\d)/, async (ctx) => {
  const trackId = ctx.match[1]
  const adminId = parseInt(ctx.match[2])
  const rating = ctx.match[3]
  const userId = ctx.from.id

  let ratingText = ""
  if (rating === "1") ratingText = "1⭐ Best"
  else if (rating === "2") ratingText = "2⭐ Good"
  else if (rating === "3") ratingText = "3⭐ Poor"

  try {
    await bot.telegram.sendMessage(
      adminId,
      `📊 User @${ctx.from.username || ctx.from.first_name} (ID: ${userId}) rated request ${trackId} as: ${ratingText}`
    )
  } catch (error) {
    console.error("Failed to send rating to admin:", error)
  }

  ctx.editMessageText("Thank you for your feedback! 🙏")
  ctx.answerCbQuery()
})

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

// ================= TEXT HANDLER =================
bot.on("text", (ctx) => {
  const session = getSession(ctx.from.id)
  const userId = ctx.from.id
  recordUser(userId)

  // --- ADMIN BROADCAST STATE ---
  if (ADMIN_IDS.includes(userId) && session.state === "admin_broadcast") {
    const message = ctx.message.text
    let successCount = 0
    let failCount = 0

    ctx.reply(`Broadcasting to ${allUsers.size} users...`)

    const promises = []
    allUsers.forEach((uid) => {
      promises.push(
        bot.telegram.sendMessage(uid, `📢 Broadcast from admin:\n\n${message}`)
          .then(() => successCount++)
          .catch(() => failCount++)
      )
    })

    Promise.all(promises).then(() => {
      ctx.reply(`✅ Broadcast finished.\nSent: ${successCount}\nFailed: ${failCount}`)
    })

    clearSession(userId)
    return
  }

  // --- USER REPLY TO ADMIN (outside ticket flow) ---
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
      ctx.reply("✅ Your reply has been sent to the support team.")
    } else {
      ctx.reply("You don't have an ongoing conversation. Please start a new support ticket using the menu.")
    }
    return
  }

  // --- ADMIN REPLY ---
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

  // --- SUPPORT FLOW: handle each state ---
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

// ================= FILE HANDLER =================
bot.on(["photo", "video"], (ctx) => {
  const session = getSession(ctx.from.id)
  const userId = ctx.from.id
  recordUser(userId)

  // --- USER REPLY TO ADMIN (file) ---
  if (!ADMIN_IDS.includes(userId) && !session.state) {
    const adminId = userLastAdmin[userId]
    if (adminId) {
      const caption = `📎 File from user @${ctx.from.username || ctx.from.first_name} (ID: ${userId})`
      if (ctx.message.photo) {
        const fileId = ctx.message.photo.pop().file_id
        bot.telegram.sendPhoto(adminId, fileId, {
          caption,
          reply_markup: {
            inline_keyboard: [[{ text: "💬 Reply to user", callback_data: `reply_${userId}` }]]
          }
        }).catch(() => {
          ctx.reply("Sorry, we couldn't deliver your file. Please try again later.")
        })
      } else if (ctx.message.video) {
        const fileId = ctx.message.video.file_id
        bot.telegram.sendVideo(adminId, fileId, {
          caption,
          reply_markup: {
            inline_keyboard: [[{ text: "💬 Reply to user", callback_data: `reply_${userId}` }]]
          }
        }).catch(() => {
          ctx.reply("Sorry, we couldn't deliver your file. Please try again later.")
        })
      }
      ctx.reply("✅ Your file has been sent to the support team.")
    } else {
      ctx.reply("You don't have an ongoing conversation. Please start a new support ticket using the menu.")
    }
    return
  }

  // --- SUPPORT FLOW: handle file upload ---
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
  showConfirmation(ctx, session)
})

// ================= CALENDAR DISPLAY =================
function showCalendar(ctx, session) {
  let year = session.calendar.year
  let month = session.calendar.month

  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"]

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  let buttons = []
  let row = []

  for (let i = 0; i < firstDay; i++) {
    row.push(Markup.button.callback(" ", "ignore"))
  }

  for (let d = 1; d <= daysInMonth; d++) {
    row.push(Markup.button.callback(d.toString(), `date_${d}`))
    if (row.length === 7) {
      buttons.push(row)
      row = []
    }
  }
  if (row.length > 0) {
    while (row.length < 7) {
      row.push(Markup.button.callback(" ", "ignore"))
    }
    buttons.push(row)
  }

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

// ================= CONFIRMATION =================
async function showConfirmation(ctx, session) {
  session.state = "confirm"

  const summary = `📋 Confirm Your Details

country: ${safe(session.data.country)}
issueType: ${safe(session.data.issueType)}
paymentSystem: ${safe(session.data.paymentSystem)}
gameUserId: ${safe(session.data.gameUserId)}
phoneNumber: ${safe(session.data.phoneNumber)}
agentNumber: ${safe(session.data.agentNumber)}
selectedDate: ${safe(session.data.selectedDate)}
selectedTime: ${safe(session.data.selectedTime)}
amount: ${safe(session.data.amount)}
trxId: ${safe(session.data.trxId)}
fileName: ${safe(session.data.fileName)}

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
bot.action("submit_player", async (ctx) => {
  const session = getSession(ctx.from.id)
  if (session.submitting) return
  session.submitting = true

  // Validate that we have a file to send
  if (!session.data.fileId || !session.data.fileType) {
    ctx.reply("❌ Error: No file uploaded. Please restart the process.")
    clearSession(ctx.from.id)
    return
  }

  const trackId = generateTrackId()
  const userId = ctx.from.id
  const username = ctx.from.username || null

  // Store ticket with username
  const ticket = {
    trackId,
    userId,
    username,
    category: session.data.category,
    data: { ...session.data },
    status: "open",
    timestamp: Date.now()
  }
  pendingTickets.push(ticket)

  const message = `🎫 Player Request\nTrack ID: ${trackId}

User: ${ctx.from.first_name} ${username ? `(@${username})` : ""}
Telegram ID: ${userId}

Country: ${safe(session.data.country)}
Issue: ${safe(session.data.issueType)}
Payment: ${safe(session.data.paymentSystem)}
Game User ID: ${safe(session.data.gameUserId)}
Phone Number: ${safe(session.data.phoneNumber)}
Agent Number: ${safe(session.data.agentNumber)}
Date: ${safe(session.data.selectedDate)}
Time: ${safe(session.data.selectedTime)}
Amount: ${safe(session.data.amount)}
Transaction ID: ${safe(session.data.trxId)}`

  // Send to all admins with error handling
  for (const admin of ADMIN_IDS) {
    try {
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
                  { text: "✅ Resolved", callback_data: `resolve_${trackId}_${userId}` }
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
                  { text: "✅ Resolved", callback_data: `resolve_${trackId}_${userId}` }
                ]
              ]
            }
          }
        )
      }
    } catch (error) {
      console.error(`Failed to send ticket to admin ${admin}:`, error)
      // Optionally notify the user that some admins didn't receive it
    }
  }

  ctx.reply(
    `✅ Request registered\nTrack ID: ${trackId}\n\nAdmin team will respond shortly.`,
    userMenu()
  )

  clearSession(ctx.from.id)
})

// ================= START BOT =================
bot.launch()
console.log("🚀 Bot Running with Enhanced Admin Panel & Crash Fixes")
