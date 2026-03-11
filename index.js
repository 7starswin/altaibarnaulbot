require("dotenv").config()
const fs = require("fs").promises
const fsSync = require("fs")
const path = require("path")
const { Telegraf, Markup } = require("telegraf")
const sharp = require("sharp")

const bot = new Telegraf(process.env.BOT_TOKEN)

const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(",").map(Number)
  : []

// ================= PERSISTENT STORAGE =================
const TICKETS_FILE = "./tickets.json"
const USERS_FILE = "./users.json"
const PROMO_FILE = "./promo.json"

// Load or initialize data
let pendingTickets = []
let allUsers = new Set()
let promoActivities = []  // { userId, username, promoCode, language, timestamp }

try {
  if (fsSync.existsSync(TICKETS_FILE)) {
    const data = fsSync.readFileSync(TICKETS_FILE, "utf8")
    pendingTickets = JSON.parse(data)
  }
} catch (err) {
  console.error("Error loading tickets:", err)
}

try {
  if (fsSync.existsSync(USERS_FILE)) {
    const data = fsSync.readFileSync(USERS_FILE, "utf8")
    allUsers = new Set(JSON.parse(data))
  }
} catch (err) {
  console.error("Error loading users:", err)
}

try {
  if (fsSync.existsSync(PROMO_FILE)) {
    const data = fsSync.readFileSync(PROMO_FILE, "utf8")
    promoActivities = JSON.parse(data)
  }
} catch (err) {
  console.error("Error loading promo activities:", err)
}

// Save functions
function saveTickets() {
  fsSync.writeFileSync(TICKETS_FILE, JSON.stringify(pendingTickets, null, 2))
}

function saveUsers() {
  fsSync.writeFileSync(USERS_FILE, JSON.stringify([...allUsers]))
}

function savePromo() {
  fsSync.writeFileSync(PROMO_FILE, JSON.stringify(promoActivities, null, 2))
}

// ================= SESSIONS (in‑memory only) =================
const sessions = {}
const userLastAdmin = {}

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
  if (!allUsers.has(userId)) {
    allUsers.add(userId)
    saveUsers()
  }
}

// Helper to safely get value or "Not provided"
function safe(val) {
  return val !== undefined && val !== null && val !== "" ? val : "Not provided"
}

// ================= UTILITY =================
function generateTrackId() {
  return `TKT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`
}

// ================= TRANSLATIONS =================
const translations = {
  en: {
    affiliate_options: "Affiliate Options",
    choose_your_option: "Choose your option",
    manager: "Contact Manager",
    promo_banner: "Promo Banner",
    back: "Back",
    main_menu: "Main Menu",
    choose_your_country: "Choose Your Country",
    select_country_for_manager: "Select your country to get manager contact",
    bangladesh: "Bangladesh",
    india: "India",
    pakistan: "Pakistan",
    egypt: "Egypt",
    manager_contact_for: "Manager Contact for",
    click_button_to_contact: "Click the button below to contact the manager",
    contact: "Contact",
    select_banner_language: "Select Banner Language",
    choose_banner_set: "Choose the language set for your banners",
    english: "English",
    bangla: "Bangla",
    hindi: "Hindi",
    pakistani: "Pakistani",
    type_your_promo: "Type Your Promo Code",
    enter_promo_code_message: "Enter your promo code (max 10 characters) that will be added to the banners:",
    invalid_promo_code: "Invalid promo code. Please use max 10 characters.",
    language_not_available: "Selected language not available.",
    no_banners_available: "No banners available for {language}.",
    processing_banners: "Processing {count} banners with promo '{promo}' in {language}...",
    complete: "Complete",
    banners_delivered_success: "✅ {count} banners delivered with your promo code '{promo}' in {language}!",
    banners_delivered_with_failures: "✅ {count} banners delivered with promo '{promo}' in {language}. Failed: {failed}",
    final_promo_message: "Start promoting now with code {promo}!\n\nPromote 7StarsWin using these banners and earn commission for using your promocode!\n\nDirect your users to register using your promo code: {promo}\n7StarsWin - Premium Betting Platform\nInstant deposits & withdrawals\n24/7 customer support\nGet Affiliate commission Upto 50%\nFast Payout Service\nBecome Agent and earn more 🎉\n\nDownload Our App:\nGet our official app for the best betting experience!\n\nRefer with this Promo-Code: {promo}",
    download_app: "Download App",
    error_processing_banners: "Error processing banners. Please try again later."
  }
  // For simplicity, we use English for all languages. You can expand later.
}

function loadLanguage(lang) {
  return translations[lang] || translations.en
}

// ================= HELPERS =================
async function ensureFolder(folderPath) {
  try {
    await fs.mkdir(folderPath, { recursive: true })
  } catch (err) {
    if (err.code !== 'EEXIST') throw err
  }
}

async function getFilesInFolder(folderPath) {
  try {
    const files = await fs.readdir(folderPath)
    return files.filter(f => f.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i))
  } catch (err) {
    return []
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function formatDate() {
  return new Date().toLocaleString()
}

async function logToAdmin(bot, adminIds, message) {
  for (const adminId of adminIds) {
    try {
      await bot.telegram.sendMessage(adminId, message)
    } catch (err) {
      console.error(`Failed to log to admin ${adminId}:`, err)
    }
  }
}

async function saveSubmission(data) {
  // data: { userId, type, data: { promoCode, bannerLanguage, filesDelivered, totalFiles, failedFiles } }
  const entry = {
    userId: data.userId,
    username: sessions[data.userId]?.username || null,
    promoCode: data.data.promoCode,
    language: data.data.bannerLanguage,
    filesDelivered: data.data.filesDelivered,
    totalFiles: data.data.totalFiles,
    failedFiles: data.data.failedFiles,
    timestamp: Date.now()
  }
  promoActivities.push(entry)
  savePromo()
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
    ["📊 Promo Activity"],
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

// ================= AFFILIATE SUPPORT =================
bot.hears("💰 Affiliate Support", async (ctx) => {
  const userId = ctx.from.id
  recordUser(userId)
  clearSession(userId)

  const session = getSession(userId)
  session.state = "affiliate_start"
  session.data.type = "affiliate"

  const texts = loadLanguage("en") // you can store preferred language per user later

  await ctx.reply(
    `🤝 **${texts.affiliate_options}**\n\n${texts.choose_your_option}:`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback(`👨‍💼 ${texts.manager}`, "affiliate_manager"),
        Markup.button.callback(`🎨 ${texts.promo_banner}`, "affiliate_promo_banner")
      ],
      [Markup.button.callback(texts.back, "main_menu")]
    ])
  )
})

// ================= AFFILIATE MANAGER =================
bot.action("affiliate_manager", async (ctx) => {
  const userId = ctx.from.id
  const session = getSession(userId)
  const texts = loadLanguage("en")

  await ctx.editMessageText(
    `👨‍💼 **${texts.choose_your_country}**\n\n${texts.select_country_for_manager}:`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback(`🇧🇩 ${texts.bangladesh}`, "manager_country_bangladesh"),
        Markup.button.callback(`🇮🇳 ${texts.india}`, "manager_country_india")
      ],
      [
        Markup.button.callback(`🇵🇰 ${texts.pakistan}`, "manager_country_pakistan"),
        Markup.button.callback(`🇪🇬 ${texts.egypt}`, "manager_country_egypt")
      ],
      [Markup.button.callback(texts.back, "main_menu")]
    ])
  )
})

bot.action(/manager_country_(.+)/, async (ctx) => {
  const country = ctx.match[1]
  const userId = ctx.from.id
  const texts = loadLanguage("en")

  const managerUsername = "@Contact_7starswinpartners"
  const countryNames = {
    bangladesh: texts.bangladesh,
    india: texts.india,
    pakistan: texts.pakistan,
    egypt: texts.egypt
  }
  const countryName = countryNames[country] || country

  await ctx.editMessageText(
    `✅ **${texts.manager_contact_for} ${countryName}**\n\n` +
    `${texts.manager}: ${managerUsername}\n\n` +
    `${texts.click_button_to_contact}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [Markup.button.url(`📞 ${texts.contact} ${countryName} ${texts.manager}`, `https://t.me/${managerUsername.replace('@', '')}`)],
          [Markup.button.callback(texts.main_menu, "main_menu")]
        ]
      }
    }
  )
})

// ================= PROMO BANNER =================
bot.action("affiliate_promo_banner", async (ctx) => {
  const userId = ctx.from.id
  const session = getSession(userId)
  const texts = loadLanguage("en")

  session.data.bannerFlow = "select_language"
  await ctx.editMessageText(
    `🎨 **${texts.select_banner_language}**\n\n${texts.choose_banner_set}:`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback(`🇺🇸 ${texts.english}`, "promo_lang_en"),
        Markup.button.callback(`🇧🇩 ${texts.bangla}`, "promo_lang_bn")
      ],
      [
        Markup.button.callback(`🇮🇳 ${texts.hindi}`, "promo_lang_hi"),
        Markup.button.callback(`🇵🇰 ${texts.pakistani}`, "promo_lang_pk")
      ],
      [Markup.button.callback(texts.back, "main_menu")]
    ])
  )
})

bot.action(/promo_lang_(.+)/, async (ctx) => {
  const lang = ctx.match[1] // en, bn, hi, pk
  const userId = ctx.from.id
  const session = getSession(userId)

  session.data.bannerLanguage = lang
  session.state = "waiting_promo_code"
  const texts = loadLanguage("en")

  await ctx.editMessageText(
    `✏️ **${texts.type_your_promo}**\n\n${texts.enter_promo_code_message}`,
    { parse_mode: "Markdown" }
  )
})

// ================= TEXT HANDLER (including promo code) =================
bot.on("text", async (ctx) => {
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

  // --- PROMO CODE WAITING ---
  if (session.state === "waiting_promo_code") {
    const promoCode = ctx.message.text.trim()
    if (promoCode.length > 10) {
      ctx.reply("⚠️ Promo code must be max 10 characters. Please try again.")
      return
    }
    session.data.promoCode = promoCode
    await deliverPromoMaterials(ctx, session, userId)
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

// ================= DELIVER PROMO MATERIALS =================
async function deliverPromoMaterials(ctx, session, userId) {
  const { bannerLanguage, promoCode } = session.data
  const texts = loadLanguage("en")
  const userData = { name: ctx.from.first_name } // we don't store full user data, but we can use first_name

  try {
    if (!promoCode || promoCode.length > 10) {
      await ctx.reply(`⚠️ ${texts.invalid_promo_code}`)
      return
    }
    if (!['en', 'bn', 'hi', 'pk'].includes(bannerLanguage)) {
      await ctx.reply(`⚠️ ${texts.language_not_available}`)
      return
    }

    const folderPath = path.join('./assets', bannerLanguage, 'banners')
    const tempFolder = path.join('./temp', userId.toString())

    await ensureFolder(folderPath)
    await ensureFolder(tempFolder)

    const imageFiles = await getFilesInFolder(folderPath)
    if (imageFiles.length === 0) {
      await ctx.reply(`⚠️ ${texts.no_banners_available.replace('{language}', bannerLanguage.toUpperCase())}`)
      return
    }

    await ctx.reply(`📄 Processing ${imageFiles.length} banners with promo '${promoCode}' in ${bannerLanguage.toUpperCase()}...`)

    let sentCount = 0
    let failedCount = 0
    const processedImages = []

    for (const fileName of imageFiles) {
      try {
        const inputPath = path.join(folderPath, fileName)
        const outputPath = path.join(tempFolder, `${promoCode}_${fileName}`)

        // Read image and add text overlay
        const image = sharp(inputPath)
        const { width, height } = await image.metadata()
        const fontSize = Math.max(54, Math.min(width * 0.091, 115))

        const textSvg = `
          <svg width="${width}" height="${height}">
            <text 
              x="50%" 
              y="94.5%" 
              text-anchor="middle" 
              font-family="Impact, 'Bebas Neue', 'Anton', 'Oswald', Arial Black, Arial, sans-serif"
              font-size="${fontSize}" 
              font-weight="900"
              fill="white" 
              letter-spacing="2px"
              text-transform="uppercase"
            >${promoCode}</text>
          </svg>
        `

        await image
          .composite([{ input: Buffer.from(textSvg), top: 0, left: 0 }])
          .jpeg({ quality: 95 })
          .toFile(outputPath)

        processedImages.push(outputPath)
      } catch (err) {
        console.error(`Error processing ${fileName}:`, err)
        failedCount++
      }
    }

    // Send in groups of up to 10
    const groupSize = 10
    for (let i = 0; i < processedImages.length; i += groupSize) {
      const group = processedImages.slice(i, i + groupSize)
      const mediaGroup = group.map(imgPath => ({
        type: 'photo',
        media: { source: imgPath }
      }))
      try {
        await ctx.replyWithMediaGroup(mediaGroup)
        sentCount += group.length
        await delay(1000)
      } catch (err) {
        console.error('Error sending media group:', err)
        failedCount += group.length
      }
    }

    // Cleanup temp files
    for (const imgPath of processedImages) {
      try { await fs.unlink(imgPath) } catch {}
    }
    try { await fs.rmdir(tempFolder) } catch {}

    // Save submission
    await saveSubmission({
      userId,
      type: 'affiliate_promo_banner',
      data: {
        promoCode,
        bannerLanguage,
        filesDelivered: sentCount,
        totalFiles: imageFiles.length,
        failedFiles: failedCount
      }
    })

    // Notify admins
    const adminMsg = `🎨 Promo Banner Request Complete\n\n` +
      `Name: ${userData.name}\n` +
      `User ID: ${userId}\n` +
      `Language: ${bannerLanguage.toUpperCase()}\n` +
      `Promo Code: ${promoCode}\n` +
      `Files Sent: ${sentCount}/${imageFiles.length}\n` +
      `Failed: ${failedCount}\n` +
      `Date: ${formatDate()}`
    await logToAdmin(bot, ADMIN_IDS, adminMsg)

    // Success message to user
    const successMsg = failedCount > 0
      ? `✅ **Complete!**\n\n${sentCount} banners delivered with promo '${promoCode}' in ${bannerLanguage.toUpperCase()}. Failed: ${failedCount}`
      : `✅ **Complete!**\n\n${sentCount} banners delivered with your promo code '${promoCode}' in ${bannerLanguage.toUpperCase()}!`
    await ctx.reply(successMsg, { parse_mode: 'Markdown' })

    // Final promo message with app download
    const finalMsg = texts.final_promo_message.replace(/{promo}/g, `<b>${promoCode}</b>`)
    await ctx.reply(finalMsg, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [Markup.button.url(`📱 ${texts.download_app}`, 'https://7starswin.com/downloads/androidclient/releases_android/7StarsWin/site/7StarsWin.apk')],
          [Markup.button.callback(texts.main_menu, 'main_menu')]
        ]
      }
    })

    clearSession(userId)

  } catch (error) {
    console.error('Promo delivery error:', error)
    await ctx.reply(`⚠️ ${texts.error_processing_banners}`)
  }
}

// ================= FILE HANDLER =================
bot.on(["photo", "video"], async (ctx) => {
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

// ================= CALENDAR FUNCTIONS =================
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

  const ticketIndex = pendingTickets.findIndex(t => t.trackId === trackId)
  if (ticketIndex !== -1) {
    pendingTickets.splice(ticketIndex, 1)
    saveTickets()
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

// ================= PLAYER SUPPORT COUNTRY/ISSUE/PAYMENT =================
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

  if (!session.data.fileId || !session.data.fileType) {
    ctx.reply("❌ Error: No file uploaded. Please restart the process.")
    clearSession(ctx.from.id)
    return
  }

  const trackId = generateTrackId()
  const userId = ctx.from.id
  const username = ctx.from.username || null

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
  saveTickets()

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
    }
  }

  ctx.reply(
    `✅ Request registered\nTrack ID: ${trackId}\n\nAdmin team will respond shortly.`,
    userMenu()
  )

  clearSession(ctx.from.id)
})

// ================= ADMIN TICKET LISTS =================
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

// ================= PROMO ACTIVITY ADMIN =================
bot.hears("📊 Promo Activity", (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return
  if (promoActivities.length === 0) {
    ctx.reply("No promo activity yet.")
    return
  }
  let msg = "📊 Promo Banner Requests:\n\n"
  promoActivities.slice(-10).reverse().forEach((p, i) => {
    msg += `${i+1}. User ${p.username ? '@'+p.username : p.userId} | Code: ${p.promoCode} | Lang: ${p.language} | ${new Date(p.timestamp).toLocaleString()}\n`
  })
  ctx.reply(msg)
})

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

bot.action(/^(deposit|withdrawal)_page_(\d+)$/, (ctx) => {
  const category = ctx.match[1]
  const page = parseInt(ctx.match[2])
  showTicketList(ctx, category, page)
})

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

// ================= START BOT =================
bot.launch()
console.log("🚀 Bot Running with Affiliate Promo Banner Feature")
