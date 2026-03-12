require("dotenv").config()
const fs = require("fs").promises
const fsSync = require("fs")
const path = require("path")
const { Telegraf, Markup } = require("telegraf")
const sharp = require("sharp")
const mongoose = require("mongoose")

// ================= MONGODB CONNECTION (REQUIRED) =================
const MONGODB_URI = process.env.MONGODB_URI
if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is not defined in environment variables")
  process.exit(1)
}

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ MongoDB connected"))
.catch(err => {
  console.error("❌ MongoDB connection error:", err)
  process.exit(1)
})

// ================= USER SCHEMA & MODEL =================
const userSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  username: String,
  firstName: String,
  lastName: String,
  phone: String,
  language: { type: String, default: 'en' },
  isPlayer: { type: Boolean, default: false },
  isAffiliate: { type: Boolean, default: false },
  isAgent: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
})

const User = mongoose.model('User', userSchema)

// ================= BOT INIT =================
const bot = new Telegraf(process.env.BOT_TOKEN)

const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(",").map(id => parseInt(id.trim()))
  : []

// ================= PERSISTENT STORAGE (JSON for non-user data) =================
const TICKETS_FILE = "./tickets.json"
const PROMO_FILE = "./promo.json"
const AGENT_FILE = "./agent.json"

let pendingTickets = []
let promoActivities = []
let agentRequests = []

// Load JSON data
try {
  if (fsSync.existsSync(TICKETS_FILE)) {
    const data = fsSync.readFileSync(TICKETS_FILE, "utf8")
    pendingTickets = JSON.parse(data)
  }
} catch (err) {
  console.error("Error loading tickets:", err)
}

try {
  if (fsSync.existsSync(PROMO_FILE)) {
    const data = fsSync.readFileSync(PROMO_FILE, "utf8")
    promoActivities = JSON.parse(data)
  }
} catch (err) {
  console.error("Error loading promo activities:", err)
}

try {
  if (fsSync.existsSync(AGENT_FILE)) {
    const data = fsSync.readFileSync(AGENT_FILE, "utf8")
    agentRequests = JSON.parse(data)
  }
} catch (err) {
  console.error("Error loading agent requests:", err)
}

// ================= SAVE FUNCTIONS FOR JSON FILES =================
function saveTickets() {
  fsSync.writeFileSync(TICKETS_FILE, JSON.stringify(pendingTickets, null, 2))
}

function savePromo() {
  fsSync.writeFileSync(PROMO_FILE, JSON.stringify(promoActivities, null, 2))
}

function saveAgentRequests() {
  fsSync.writeFileSync(AGENT_FILE, JSON.stringify(agentRequests, null, 2))
}

// ================= SESSIONS =================
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

// ================= USER DATA FUNCTIONS (MongoDB only) =================
async function findUser(userId) {
  return await User.findOne({ userId })
}

async function updateUser(userId, updates) {
  await User.findOneAndUpdate(
    { userId },
    { $set: updates, $setOnInsert: { createdAt: new Date() } },
    { upsert: true, new: true }
  )
}

async function getPhone(userId) {
  const user = await User.findOne({ userId })
  return user ? user.phone : null
}

async function setPhone(userId, phone) {
  await User.findOneAndUpdate({ userId }, { phone }, { upsert: true })
}

async function getUsersByFlag(flag, value = true) {
  return await User.find({ [flag]: value }).sort({ createdAt: -1 }).limit(10)
}

async function countUsersByFlag(flag, value = true) {
  return await User.countDocuments({ [flag]: value })
}

async function getAllUserIds() {
  const users = await User.find({}, 'userId')
  return users.map(u => u.userId)
}

// ================= CHECK PHONE BEFORE PROCEEDING (skip for admins) =================
async function ensurePhone(ctx) {
  const userId = ctx.from.id
  if (ADMIN_IDS.includes(userId)) return true

  const phone = await getPhone(userId)
  if (phone) return true

  await ctx.reply(
    "Please share your phone number to continue:",
    Markup.keyboard([
      [Markup.button.contactRequest("📱 Share Contact")]
    ]).resize().oneTime()
  )
  return false
}

// ================= HELPER: safe username display =================
function displayUser(ctx) {
  if (ctx.from.username) return `@${ctx.from.username}`
  return `ID: ${ctx.from.id} (no username)`
}

// ================= UTILITY =================
function safe(val) {
  return val !== undefined && val !== null && val !== "" ? val : "Not provided"
}

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
    turkey: "Turkey",
    thailand: "Thailand",
    nepal: "Nepal",
    manager_contact_for: "Manager Contact for",
    click_button_to_contact: "Click the button below to contact the manager",
    contact: "Contact",
    select_banner_language: "Select Banner Language",
    choose_banner_set: "Choose the language set for your banners",
    english: "English",
    bangla: "Bangla",
    hindi: "Hindi",
    turkish: "Turkish",
    thai: "Thai",
    egyptian: "Egyptian",
    cricket_promo: "Cricket Promo",
    football_promo: "Football Promo",
    matchday_promo: "Matchday Promo",
    video_promo: "Video Promo",
    type_your_promo: "Type Your Promo Code",
    enter_promo_code_message: "Enter your promo code (max 10 characters) that will be added to the banners:",
    invalid_promo_code: "Invalid promo code. Please use max 10 characters.",
    language_not_available: "Selected language not available.",
    category_not_available: "Selected category not available.",
    no_banners_available: "No banners available for {language}/{category}.",
    processing_banners: "Processing {count} banners with promo '{promo}' in {language}/{category}...",
    complete: "Complete",
    banners_delivered_success: "✅ {count} banners delivered with your promo code '{promo}' in {language}/{category}!",
    banners_delivered_with_failures: "✅ {count} banners delivered with promo '{promo}' in {language}/{category}. Failed: {failed}",
    final_promo_message: "Start promoting now with code {promo}!\n\nPromote 7StarsWin using these banners and earn commission for using your promocode!\n\nDirect your users to register using your promo code: {promo}\n7StarsWin - Premium Betting Platform\nInstant deposits & withdrawals\n24/7 customer support\nGet Affiliate commission Upto 50%\nFast Payout Service\nBecome Agent and earn more 🎉\n\nDownload Our App:\nGet our official app for the best betting experience!\n\nRefer with this Promo-Code: {promo}",
    download_app: "Download App",
    error_processing_banners: "Error processing banners. Please try again later.",

    agent_registration: "Agent Registration",
    select_your_country: "Select your country",
    welcome_to_mobcash: "Welcome to Mobcash!",
    mobcash_intro: "Mobcash is an innovative platform that allows you to earn money by facilitating deposits and withdrawals for users.",
    mobcash_role: "As a Mobcash agent, you will help users deposit and withdraw funds, earning commissions on every transaction.",
    mobcash_commission: "💸 Commission Structure:",
    mobcash_earning: "You earn a percentage on every deposit and withdrawal processed through your account.",
    mobcash_analogy: "🚀 Think of it as your own small business – the more you help, the more you earn!",
    next: "Next ➡️",
    back_arrow: "⬅️ Back",
    confirm_conditions: "Confirm Conditions",
    deposit_commission: "Deposit Commission: 0.5%",
    withdrawal_commission: "Withdrawal Commission: 0.3%",
    prepay_requirement: "Prepay required: $100 (refundable)",
    are_you_okay: "Are you okay with these terms? 😊",
    accept: "✅ Accept",
    reject: "❌ Reject",
    agent_interest_registered: "Agent Interest Registered!",
    thank_you_interest: "Thank you for your interest in becoming a Mobcash agent for {country}. Your request has been forwarded to our team.",
    team_contact_soon: "Our team will contact you soon with further instructions.",
    manager_contact_info: "Meanwhile, you can connect with our manager directly:",
    connect_with_manager: "📞 Connect with Manager",
    rejection_response_title: "Thank you for your time.",
    rejection_response_body: "If you change your mind, you can always start the process again.",
    manager_anytime_contact: "You can contact our manager anytime for questions:",
    error_processing_response: "Error processing your response. Please try again later."
  }
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
  if (data.type === 'agent_response') {
    const entry = {
      userId: data.userId,
      username: data.username || null,
      country: data.data.country,
      response: data.data.response,
      interested: data.data.interested,
      timestamp: Date.now()
    };
    agentRequests.push(entry);
    saveAgentRequests();
    console.log("✅ Agent request saved:", entry);
  }
}

// ================= PROMO FLOW FUNCTIONS =================
async function startPromoLanguageSelection(ctx) {
  try {
    const userId = ctx.from.id
    const session = getSession(userId)
    const texts = loadLanguage("en")

    session.data.promoFlow = "select_language"
    await ctx.reply(
      `🎨 **${texts.select_banner_language}**\n\n${texts.choose_banner_set}:`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(`🇺🇸 ${texts.english}`, "promo_lang_en"),
          Markup.button.callback(`🇧🇩 ${texts.bangla}`, "promo_lang_bn")
        ],
        [
          Markup.button.callback(`🇮🇳 ${texts.hindi}`, "promo_lang_hi"),
          Markup.button.callback(`🇹🇷 ${texts.turkish}`, "promo_lang_tr")
        ],
        [
          Markup.button.callback(`🇹🇭 ${texts.thai}`, "promo_lang_th"),
          Markup.button.callback(`🇪🇬 ${texts.egyptian}`, "promo_lang_eg")
        ],
        [Markup.button.callback(texts.back, "main_menu")]
      ])
    )
  } catch (err) {
    console.error("Error in startPromoLanguageSelection:", err)
  }
}

bot.action(/promo_lang_(.+)/, async (ctx) => {
  if (!(await ensurePhone(ctx))) return
  try {
    const lang = ctx.match[1] // en, bn, hi, tr, th, eg
    const userId = ctx.from.id
    const session = getSession(userId)
    const texts = loadLanguage("en")

    session.data.bannerLanguage = lang
    session.data.promoFlow = "select_category"

    await ctx.editMessageText(
      `📂 Select promo category:`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(`🏏 ${texts.cricket_promo}`, `promo_cat_cricket`),
          Markup.button.callback(`⚽ ${texts.football_promo}`, `promo_cat_football`)
        ],
        [
          Markup.button.callback(`📅 ${texts.matchday_promo}`, `promo_cat_matchday`),
          Markup.button.callback(`🎥 ${texts.video_promo}`, `promo_cat_video`)
        ],
        [Markup.button.callback(texts.back, "main_menu")]
      ])
    )
    await ctx.answerCbQuery().catch(() => {})
  } catch (err) {
    console.error("Error in promo_lang action:", err)
    try { await ctx.answerCbQuery().catch(() => {}) } catch {}
  }
})

bot.action(/promo_cat_(.+)/, async (ctx) => {
  if (!(await ensurePhone(ctx))) return
  try {
    const category = ctx.match[1] // cricket, football, matchday, video
    const userId = ctx.from.id
    const session = getSession(userId)
    const texts = loadLanguage("en")

    session.data.promoCategory = category
    session.state = "waiting_promo_code"

    await ctx.editMessageText(
      `✏️ **${texts.type_your_promo}**\n\n${texts.enter_promo_code_message}`,
      { parse_mode: "Markdown" }
    )
    await ctx.answerCbQuery().catch(() => {})
  } catch (err) {
    console.error("Error in promo_cat action:", err)
    try { await ctx.answerCbQuery().catch(() => {}) } catch {}
  }
})

// ================= AGENT FLOW FUNCTIONS =================
async function agentFlow(ctx) {
  try {
    const userId = ctx.from.id
    const session = getSession(userId)
    const texts = loadLanguage("en")

    session.state = "agent_start"
    session.data.type = "agent"

    await ctx.reply(
      `🧑‍💼 **${texts.agent_registration}**\n\n${texts.select_your_country}:`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(`🇧🇩 ${texts.bangladesh}`, "agent_country_bangladesh"),
          Markup.button.callback(`🇮🇳 ${texts.india}`, "agent_country_india")
        ],
        [
          Markup.button.callback(`🇵🇰 ${texts.pakistan}`, "agent_country_pakistan"),
          Markup.button.callback(`🇪🇬 ${texts.egypt}`, "agent_country_egypt")
        ],
        [
          Markup.button.callback(`🇹🇷 ${texts.turkey}`, "agent_country_turkey"),
          Markup.button.callback(`🇹🇭 ${texts.thailand}`, "agent_country_thailand")
        ],
        [Markup.button.callback(texts.back, "main_menu")]
      ])
    )
  } catch (err) {
    console.error("Error in agentFlow:", err)
  }
}

async function showAgentDetails(ctx, country) {
  try {
    const userId = ctx.from.id
    const session = getSession(userId)
    const texts = loadLanguage("en")

    session.data.selectedCountry = country
    session.state = "agent_details_shown"

    const countryNames = {
      bangladesh: texts.bangladesh,
      india: texts.india,
      pakistan: texts.pakistan,
      egypt: texts.egypt,
      turkey: texts.turkey,
      thailand: texts.thailand
    }
    const countryName = countryNames[country] || country

    const detailsMessage = `${texts.welcome_to_mobcash} 🎉\n${texts.mobcash_intro}\n\n${texts.mobcash_role}\n\n${texts.mobcash_commission} 💸 ${texts.mobcash_earning}\n\n${texts.mobcash_analogy} 🚀`

    await ctx.editMessageText(
      detailsMessage,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: texts.next, callback_data: `agent_next_${country}` },
              { text: texts.back_arrow, callback_data: "main_menu" }
            ]
          ]
        }
      }
    )
  } catch (err) {
    console.error("Error in showAgentDetails:", err)
  }
}

async function showAgentConfirmation(ctx, country) {
  try {
    const userId = ctx.from.id
    const session = getSession(userId)
    const texts = loadLanguage("en")

    session.state = "agent_confirmation"

    const countryNames = {
      bangladesh: texts.bangladesh,
      india: texts.india,
      pakistan: texts.pakistan,
      egypt: texts.egypt,
      turkey: texts.turkey,
      thailand: texts.thailand
    }
    const countryName = countryNames[country] || country

    const confirmationMessage = `**${texts.confirm_conditions}** ⭐\n\n⭐ ${texts.deposit_commission}\n⭐ ${texts.withdrawal_commission}\n⭐ ${texts.prepay_requirement}\n\n${texts.are_you_okay} 😊`

    await ctx.editMessageText(
      confirmationMessage,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: texts.accept, callback_data: `agent_accept_${country}` },
              { text: texts.reject, callback_data: `agent_reject_${country}` }
            ],
            [{ text: texts.back_arrow, callback_data: "main_menu" }]
          ]
        }
      }
    )
  } catch (err) {
    console.error("Error in showAgentConfirmation:", err)
  }
}

async function handleAgentResponse(ctx, country, response) {
  try {
    const userId = ctx.from.id
    const session = getSession(userId)
    const texts = loadLanguage("en")

    const countryNames = {
      bangladesh: texts.bangladesh,
      india: texts.india,
      pakistan: texts.pakistan,
      egypt: texts.egypt,
      turkey: texts.turkey,
      thailand: texts.thailand
    }
    const countryName = countryNames[country] || country
    const isInterested = response === 'accept'

    if (isInterested) {
      await updateUser(userId, { isAgent: true })
    }

    await saveSubmission({
      userId,
      username: ctx.from.username,
      type: 'agent_response',
      data: {
        country: countryName,
        response: response,
        interested: isInterested,
        language: 'en'
      },
      status: 'pending'
    })

    // Notify admins
    const adminMessage =
      `<b>🧑‍💼 Agent ${isInterested ? 'Interest' : 'Rejection'} - ${countryName}</b>\n\n` +
      `<b>User:</b> ${ctx.from.first_name}\n` +
      `<b>User ID:</b> ${userId}\n` +
      `<b>Username:</b> ${ctx.from.username ? '@' + ctx.from.username : 'None'}\n` +
      `<b>Country:</b> ${countryName}\n` +
      `<b>Response:</b> ${isInterested ? '✅ INTERESTED (Accepted)' : '❌ NOT INTERESTED (Rejected)'}\n` +
      `<b>Date:</b> ${formatDate()}`

    for (const adminId of ADMIN_IDS) {
      try {
        await bot.telegram.sendMessage(adminId, adminMessage, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '💬 Reply to User', callback_data: `reply_${userId}` }]
            ]
          }
        })
      } catch (err) {
        console.error(`Failed to send agent response to admin ${adminId}:`, err)
      }
    }

    let userMessage, userKeyboard

    if (isInterested) {
      userMessage =
        `<b>✅ ${texts.agent_interest_registered}</b>\n\n` +
        `${texts.thank_you_interest.replace('{country}', countryName)}\n\n` +
        `👉 ${texts.team_contact_soon}\n\n` +
        `${texts.manager_contact_info}`

      userKeyboard = Markup.inlineKeyboard([
        [Markup.button.url(texts.connect_with_manager, 'https://t.me/atikur_7starswin')],
        [Markup.button.callback(texts.main_menu, 'main_menu')]
      ])
    } else {
      userMessage =
        `<b>${texts.rejection_response_title}</b> ${texts.rejection_response_body}\n\n` +
        `${texts.manager_anytime_contact}`

      userKeyboard = Markup.inlineKeyboard([
        [Markup.button.url(texts.connect_with_manager, 'https://t.me/atikur_7starswin')],
        [Markup.button.callback(texts.main_menu, 'main_menu')]
      ])
    }

    await ctx.editMessageText(userMessage, {
      parse_mode: 'HTML',
      ...userKeyboard
    })

    clearSession(userId)

  } catch (error) {
    console.error('Error handling agent response:', error)
    try {
      await ctx.reply(`⚠️ ${loadLanguage('en').error_processing_response}`)
    } catch {}
  }
}

// ================= MENUS =================
function userMenu() {
  return Markup.keyboard([
    ["Player Support"],
    ["Affiliate Support", "Become Agent"]
  ]).resize()
}

function adminMenu() {
  return Markup.keyboard([
    ["📥 Deposit Problems", "📤 Withdrawal Problems"],
    ["🤝 Agent Requests", "📢 Broadcast"],
    ["📊 Promo Activity", "🎨 Generate Promo"],
    ["👥 Users", "🔙 Main Menu"]
  ]).resize()
}

// ================= START =================
bot.start(async (ctx) => {
  try {
    const userId = ctx.from.id
    if (ADMIN_IDS.includes(userId)) {
      return ctx.reply("Welcome Admin! Use the menu below to manage tickets.", adminMenu())
    }

    const phone = await getPhone(userId)
    if (phone) {
      // Existing user – update info and show menu
      await updateUser(userId, {
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name
      })
      return ctx.reply("Welcome back to Support Bot!", userMenu())
    }

    // New user – ask for phone
    await ctx.reply(
      "Please share your phone number to continue:",
      Markup.keyboard([
        [Markup.button.contactRequest("📱 Share Contact")]
      ]).resize().oneTime()
    )
  } catch (err) {
    console.error("Error in start handler:", err)
  }
})

// ================= CONTACT HANDLER =================
bot.on("contact", async (ctx) => {
  try {
    const userId = ctx.from.id
    const phone = ctx.message.contact.phone_number

    await setPhone(userId, phone)
    await updateUser(userId, {
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name
    })

    if (ADMIN_IDS.includes(userId)) {
      ctx.reply("Thank you! Use the menu below.", adminMenu())
    } else {
      ctx.reply("Thank you! Welcome to Support Bot.", userMenu())
    }
  } catch (err) {
    console.error("Error in contact handler:", err)
  }
})

// ================= MAIN MENU HANDLER =================
bot.hears("🔙 Main Menu", async (ctx) => {
  try {
    if (ADMIN_IDS.includes(ctx.from.id)) {
      return ctx.reply("Admin menu:", adminMenu())
    }
    if (!(await ensurePhone(ctx))) return
    ctx.reply("Main menu:", userMenu())
  } catch (err) {
    console.error("Error in main menu handler:", err)
  }
})

// ================= USER MENU HANDLERS =================
bot.hears("Player Support", async (ctx) => {
  if (!(await ensurePhone(ctx))) return
  try {
    await updateUser(ctx.from.id, { isPlayer: true })
    const userId = ctx.from.id
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
  } catch (err) {
    console.error("Error in Player Support handler:", err)
  }
})

bot.hears("Affiliate Support", async (ctx) => {
  if (!(await ensurePhone(ctx))) return
  try {
    await updateUser(ctx.from.id, { isAffiliate: true })
    const userId = ctx.from.id
    clearSession(userId)

    const session = getSession(userId)
    session.state = "affiliate_start"
    session.data.type = "affiliate"

    const texts = loadLanguage("en")

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
  } catch (err) {
    console.error("Error in Affiliate Support handler:", err)
  }
})

bot.hears("Become Agent", async (ctx) => {
  if (!(await ensurePhone(ctx))) return
  try {
    const userId = ctx.from.id
    clearSession(userId)
    await agentFlow(ctx)
  } catch (err) {
    console.error("Error in Become Agent handler:", err)
  }
})

// ================= AFFILIATE MANAGER =================
bot.action("affiliate_manager", async (ctx) => {
  if (!(await ensurePhone(ctx))) return
  try {
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
        [
          Markup.button.callback(`🇹🇷 ${texts.turkey}`, "manager_country_turkey"),
          Markup.button.callback(`🇹🇭 ${texts.thailand}`, "manager_country_thailand")
        ],
        [Markup.button.callback(texts.back, "main_menu")]
      ])
    )
    await ctx.answerCbQuery().catch(() => {})
  } catch (err) {
    console.error("Error in affiliate_manager action:", err)
    try { await ctx.answerCbQuery().catch(() => {}) } catch {}
  }
})

bot.action(/manager_country_(.+)/, async (ctx) => {
  if (!(await ensurePhone(ctx))) return
  try {
    const country = ctx.match[1]
    const userId = ctx.from.id
    const texts = loadLanguage("en")

    const managerUsername = "@Contact_7starswinpartners"
    const countryNames = {
      bangladesh: texts.bangladesh,
      india: texts.india,
      pakistan: texts.pakistan,
      egypt: texts.egypt,
      turkey: texts.turkey,
      thailand: texts.thailand
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
    await ctx.answerCbQuery().catch(() => {})
  } catch (err) {
    console.error("Error in manager_country action:", err)
    try { await ctx.answerCbQuery().catch(() => {}) } catch {}
  }
})

// ================= AGENT FLOW CALLBACKS =================
bot.action(/agent_country_(.+)/, async (ctx) => {
  if (!(await ensurePhone(ctx))) return
  try {
    const country = ctx.match[1]
    await showAgentDetails(ctx, country)
    await ctx.answerCbQuery().catch(() => {})
  } catch (err) {
    console.error("Error in agent_country action:", err)
    try { await ctx.answerCbQuery().catch(() => {}) } catch {}
  }
})

bot.action(/agent_next_(.+)/, async (ctx) => {
  if (!(await ensurePhone(ctx))) return
  try {
    const country = ctx.match[1]
    await showAgentConfirmation(ctx, country)
    await ctx.answerCbQuery().catch(() => {})
  } catch (err) {
    console.error("Error in agent_next action:", err)
    try { await ctx.answerCbQuery().catch(() => {}) } catch {}
  }
})

bot.action(/agent_(accept|reject)_(.+)/, async (ctx) => {
  if (!(await ensurePhone(ctx))) return
  try {
    const response = ctx.match[1]
    const country = ctx.match[2]
    await handleAgentResponse(ctx, country, response)
    await ctx.answerCbQuery().catch(() => {})
  } catch (err) {
    console.error("Error in agent_accept/reject action:", err)
    try { await ctx.answerCbQuery().catch(() => {}) } catch {}
  }
})

// ================= PROMO BANNER (AFFILIATE) =================
bot.action("affiliate_promo_banner", async (ctx) => {
  if (!(await ensurePhone(ctx))) return
  try {
    await updateUser(ctx.from.id, { isAffiliate: true })
    await startPromoLanguageSelection(ctx)
    await ctx.answerCbQuery().catch(() => {})
  } catch (err) {
    console.error("Error in affiliate_promo_banner action:", err)
    try { await ctx.answerCbQuery().catch(() => {}) } catch {}
  }
})

// ================= ADMIN GENERATE PROMO =================
bot.hears("🎨 Generate Promo", async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return
  try {
    await startPromoLanguageSelection(ctx)
  } catch (err) {
    console.error("Error in Generate Promo hears:", err)
  }
})

// ================= TEXT HANDLER =================
bot.on("text", async (ctx) => {
  try {
    const session = getSession(ctx.from.id)
    const userId = ctx.from.id

    // ADMIN BROADCAST MESSAGE
    if (ADMIN_IDS.includes(userId) && session.state === "admin_broadcast_message") {
      const message = ctx.message.text
      const category = session.broadcastCategory

      let targetUserIds = []
      if (category === 'all') {
        targetUserIds = await getAllUserIds()
      } else {
        const flag = category === 'players' ? 'isPlayer' : (category === 'affiliates' ? 'isAffiliate' : 'isAgent')
        const users = await User.find({ [flag]: true }, 'userId')
        targetUserIds = users.map(u => u.userId)
      }

      const total = targetUserIds.length
      ctx.reply(`Broadcasting to ${total} users in category "${category}"...`)

      let successCount = 0
      let failCount = 0
      const promises = targetUserIds.map(uid =>
        bot.telegram.sendMessage(uid, `📢 Broadcast from admin (${category}):\n\n${message}`)
          .then(() => successCount++)
          .catch(() => failCount++)
      )

      Promise.all(promises).then(() => {
        ctx.reply(`✅ Broadcast finished.\nSent: ${successCount}\nFailed: ${failCount}`)
      })

      clearSession(userId)
      return
    }

    // USER REPLY TO ADMIN
    if (!ADMIN_IDS.includes(userId) && !session.state) {
      const adminId = userLastAdmin[userId]
      if (adminId) {
        bot.telegram.sendMessage(
          adminId,
          `✉️ Reply from user ${displayUser(ctx)}:\n\n${ctx.message.text}`,
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

    // ADMIN REPLY
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

    // PROMO CODE WAITING
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

    // SUPPORT FLOW
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
  } catch (err) {
    console.error("Error in text handler:", err)
  }
})

// ================= DELIVER PROMO MATERIALS =================
async function deliverPromoMaterials(ctx, session, userId) {
  try {
    const { bannerLanguage, promoCategory, promoCode } = session.data
    const texts = loadLanguage("en")
    const userData = { name: ctx.from.first_name }

    if (!promoCode || promoCode.length > 10) {
      await ctx.reply(`⚠️ ${texts.invalid_promo_code}`)
      return
    }
    const validLangs = ['en', 'bn', 'hi', 'tr', 'th', 'eg']
    const validCats = ['cricket', 'football', 'matchday', 'video']
    if (!validLangs.includes(bannerLanguage) || !validCats.includes(promoCategory)) {
      await ctx.reply(`⚠️ ${texts.category_not_available}`)
      return
    }

    const folderPath = path.join('./assets', bannerLanguage, promoCategory, 'banners')
    const tempFolder = path.join('./temp', userId.toString())

    await ensureFolder(folderPath)
    await ensureFolder(tempFolder)

    const imageFiles = await getFilesInFolder(folderPath)
    if (imageFiles.length === 0) {
      await ctx.reply(`⚠️ ${texts.no_banners_available.replace('{language}', bannerLanguage.toUpperCase()).replace('{category}', promoCategory)}`)
      return
    }

    await ctx.reply(`📄 Processing ${imageFiles.length} banners with promo '${promoCode}' in ${bannerLanguage}/${promoCategory}...`)

    let sentCount = 0
    let failedCount = 0
    const processedImages = []

    for (const fileName of imageFiles) {
      try {
        const inputPath = path.join(folderPath, fileName)
        const outputPath = path.join(tempFolder, `${promoCode}_${fileName}`)

        const image = sharp(inputPath)
        const { width, height } = await image.metadata()
        const fontSize = Math.max(54, Math.min(width * 0.091, 115))

        // ===== ADJUST x AND y TO MATCH YOUR BANNER'S PROMO BOX =====
        const textSvg = `
          <svg width="${width}" height="${height}">
            <text 
              x="50%" 
              y="85%" 
              text-anchor="middle" 
              font-family="Azo Sans Uber, 'Arial Black', Impact, sans-serif"
              font-size="${fontSize}" 
              font-weight="900"
              fill="#ff00a2" 
              stroke="black"
              stroke-width="4"
              paint-order="stroke"
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

    for (const imgPath of processedImages) {
      try { await fs.unlink(imgPath) } catch {}
    }
    try { await fs.rmdir(tempFolder) } catch {}

    // Save promo activity
    promoActivities.push({
      userId,
      username: ctx.from.username,
      promoCode,
      language: bannerLanguage,
      category: promoCategory,
      filesDelivered: sentCount,
      totalFiles: imageFiles.length,
      failedFiles: failedCount,
      timestamp: Date.now()
    })
    savePromo()

    // Mark user as affiliate
    await updateUser(userId, { isAffiliate: true })

    const adminMsg = `🎨 Promo Banner Request Complete\n\n` +
      `Name: ${userData.name}\n` +
      `User ID: ${userId}\n` +
      `Username: ${ctx.from.username ? '@' + ctx.from.username : 'None'}\n` +
      `Language: ${bannerLanguage.toUpperCase()}\n` +
      `Category: ${promoCategory}\n` +
      `Promo Code: ${promoCode}\n` +
      `Files Sent: ${sentCount}/${imageFiles.length}\n` +
      `Failed: ${failedCount}\n` +
      `Date: ${formatDate()}`
    await logToAdmin(bot, ADMIN_IDS, adminMsg)

    const successMsg = failedCount > 0
      ? `✅ **Complete!**\n\n${sentCount} banners delivered with promo '${promoCode}' in ${bannerLanguage}/${promoCategory}. Failed: ${failedCount}`
      : `✅ **Complete!**\n\n${sentCount} banners delivered with your promo code '${promoCode}' in ${bannerLanguage}/${promoCategory}!`
    await ctx.reply(successMsg, { parse_mode: 'Markdown' })

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
    try { await ctx.reply(`⚠️ ${loadLanguage('en').error_processing_banners}`) } catch {}
  }
})

// ================= FILE HANDLER =================
bot.on(["photo", "video"], async (ctx) => {
  try {
    const session = getSession(ctx.from.id)
    const userId = ctx.from.id

    if (!ADMIN_IDS.includes(userId) && !session.state) {
      const adminId = userLastAdmin[userId]
      if (adminId) {
        const caption = `📎 File from user ${displayUser(ctx)}`
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
  } catch (err) {
    console.error("Error in file handler:", err)
  }
})

// ================= CALENDAR =================
function showCalendar(ctx, session) {
  try {
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
  } catch (err) {
    console.error("Error in showCalendar:", err)
  }
}

bot.action(/date_(\d+)/, async (ctx) => {
  if (!(await ensurePhone(ctx))) return
  try {
    const day = ctx.match[1]
    const session = getSession(ctx.from.id)
    const year = session.calendar.year
    const month = session.calendar.month
    const selectedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    session.data.selectedDate = selectedDate
    session.state = "waiting_time"
    await ctx.editMessageText(`Selected date: ${selectedDate}\n\nPlease enter time in any format:`)
    await ctx.answerCbQuery().catch(() => {})
  } catch (err) {
    console.error("Error in date action:", err)
    try { await ctx.answerCbQuery().catch(() => {}) } catch {}
  }
})

bot.action("prev_month", async (ctx) => {
  if (!(await ensurePhone(ctx))) return
  try {
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
    await ctx.answerCbQuery().catch(() => {})
  } catch (err) {
    console.error("Error in prev_month action:", err)
    try { await ctx.answerCbQuery().catch(() => {}) } catch {}
  }
})

bot.action("next_month", async (ctx) => {
  if (!(await ensurePhone(ctx))) return
  try {
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
    await ctx.answerCbQuery().catch(() => {})
  } catch (err) {
    console.error("Error in next_month action:", err)
    try { await ctx.answerCbQuery().catch(() => {}) } catch {}
  }
})

bot.action("ignore", async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {})
  } catch (err) {
    console.error("Error in ignore action:", err)
  }
})

// ================= RESTART / MAIN MENU =================
bot.action("restart_player", async (ctx) => {
  if (!(await ensurePhone(ctx))) return
  try {
    const userId = ctx.from.id
    clearSession(userId)
    const session = getSession(userId)
    session.state = "player_country_selection"
    session.data.type = "player"
    await ctx.editMessageText(
      "👤 Player Support\n\nWhere are you from?",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("🇧🇩 Bangladesh", "player_select_bangladesh"),
          Markup.button.callback("🇮🇳 India", "player_select_india")
        ],
        [Markup.button.callback("« Back", "main_menu")]
      ])
    )
    await ctx.answerCbQuery().catch(() => {})
  } catch (err) {
    console.error("Error in restart_player action:", err)
    try { await ctx.answerCbQuery().catch(() => {}) } catch {}
  }
})

bot.action("main_menu", async (ctx) => {
  try {
    const userId = ctx.from.id
    clearSession(userId)
    await ctx.deleteMessage().catch(() => {})
    if (ADMIN_IDS.includes(userId)) {
      await ctx.reply("Admin menu:", adminMenu())
    } else {
      await ctx.reply("Main menu:", userMenu())
    }
    await ctx.answerCbQuery().catch(() => {})
  } catch (err) {
    console.error("Error in main_menu action:", err)
    try { await ctx.answerCbQuery().catch(() => {}) } catch {}
  }
})

// ================= ADMIN USERS SUBMENU =================
bot.hears("👥 Users", async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return
  try {
    await ctx.reply(
      "Select user category:",
      Markup.inlineKeyboard([
        [Markup.button.callback("👥 Players", "show_players")],
        [Markup.button.callback("👥 Affiliates", "show_affiliates")],
        [Markup.button.callback("👥 Agents", "show_agents")],
        [Markup.button.callback("🔙 Back to Admin Menu", "main_menu")]
      ])
    )
  } catch (err) {
    console.error("Error in Users hears:", err)
  }
})

async function showUserList(ctx, flag, displayName) {
  try {
    const usersList = await getUsersByFlag(flag)
    const total = await countUsersByFlag(flag)

    let msg = `👥 **${displayName}** (Total: ${total})\n\n`
    if (usersList.length === 0) {
      msg += "No users in this category."
    } else {
      usersList.forEach((u, i) => {
        const name = u.username ? `@${u.username}` : `ID: ${u.userId}`
        msg += `${i+1}. ${name}\n`
      })
    }
    await ctx.editMessageText(msg, { parse_mode: "Markdown" })
    await ctx.answerCbQuery().catch(() => {})
  } catch (err) {
    console.error(`Error in showUserList for ${displayName}:`, err)
    try { await ctx.answerCbQuery().catch(() => {}) } catch {}
  }
}

bot.action("show_players", async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return
  await showUserList(ctx, 'isPlayer', 'Players')
})

bot.action("show_affiliates", async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return
  await showUserList(ctx, 'isAffiliate', 'Affiliates')
})

bot.action("show_agents", async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return
  await showUserList(ctx, 'isAgent', 'Agents')
})

// ================= BROADCAST WITH CATEGORY =================
bot.hears("📢 Broadcast", async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return
  const session = getSession(ctx.from.id)
  session.state = "admin_broadcast_category"
  await ctx.reply(
    "Select broadcast target:",
    Markup.inlineKeyboard([
      [Markup.button.callback("All Users", "broadcast_all")],
      [Markup.button.callback("Players", "broadcast_players")],
      [Markup.button.callback("Affiliates", "broadcast_affiliates")],
      [Markup.button.callback("Agents", "broadcast_agents")],
      [Markup.button.callback("Cancel", "main_menu")]
    ])
  )
})

bot.action(/broadcast_(.+)/, async (ctx) => {
  const category = ctx.match[1] // all, players, affiliates, agents
  const adminId = ctx.from.id
  const session = getSession(adminId)
  session.state = "admin_broadcast_message"
  session.broadcastCategory = category
  await ctx.editMessageText(`📢 You selected: **${category}**.\nNow type the message to broadcast.`)
  await ctx.answerCbQuery().catch(() => {})
})

// ================= ADMIN MENU REGEX HANDLER =================
bot.hears(/^(.*Deposit Problems.*|.*Withdrawal Problems.*|.*Agent Requests.*|.*Promo Activity.*)$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return
  try {
    const text = ctx.message.text

    if (text.includes("Deposit Problems")) {
      showTicketList(ctx, "deposit", 0)
    } else if (text.includes("Withdrawal Problems")) {
      showTicketList(ctx, "withdrawal", 0)
    } else if (text.includes("Agent Requests")) {
      if (agentRequests.length === 0) {
        return ctx.reply("No agent requests yet.")
      }
      let msg = "🤝 **Agent Requests**\n\n"
      const recent = [...agentRequests].reverse().slice(0, 10)
      recent.forEach((req, i) => {
        const user = req.username ? `@${req.username}` : `ID: ${req.userId}`
        const status = req.interested ? "✅ Accepted" : "❌ Rejected"
        msg += `${i+1}. ${user} | ${req.country} | ${status} | ${new Date(req.timestamp).toLocaleString()}\n`
      })
      ctx.reply(msg, { parse_mode: "Markdown" })
    } else if (text.includes("Promo Activity")) {
      if (promoActivities.length === 0) {
        return ctx.reply("No promo activity yet.")
      }
      let msg = "📊 **Promo Banner Requests**\n\n"
      const recent = [...promoActivities].reverse().slice(0, 10)
      recent.forEach((p, i) => {
        const user = p.username ? `@${p.username}` : `ID: ${p.userId}`
        msg += `${i+1}. ${user} | Code: **${p.promoCode}** | Lang: ${p.language} | Cat: ${p.category} | ${new Date(p.timestamp).toLocaleString()}\n`
      })
      ctx.reply(msg, { parse_mode: "Markdown" })
    }
  } catch (err) {
    console.error("Error in admin menu regex handler:", err)
  }
})

// ================= ADMIN ACTIONS =================
bot.action(/resolve_(.+)_(\d+)/, async (ctx) => {
  try {
    const trackId = ctx.match[1]
    const userId = parseInt(ctx.match[2])
    const adminId = ctx.from.id

    const ticketIndex = pendingTickets.findIndex(t => t.trackId === trackId)
    if (ticketIndex !== -1) {
      pendingTickets.splice(ticketIndex, 1)
      saveTickets()
    }

    await ctx.answerCbQuery("Ticket marked resolved")
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] })

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
    console.error("Error in resolve action:", error)
    try { await ctx.answerCbQuery().catch(() => {}) } catch {}
  }
})

bot.action(/rate_(.+)_(\d+)_(\d)/, async (ctx) => {
  try {
    const trackId = ctx.match[1]
    const adminId = parseInt(ctx.match[2])
    const rating = ctx.match[3]
    const userId = ctx.from.id

    let ratingText = ""
    if (rating === "1") ratingText = "1⭐ Best"
    else if (rating === "2") ratingText = "2⭐ Good"
    else if (rating === "3") ratingText = "3⭐ Poor"

    await bot.telegram.sendMessage(
      adminId,
      `📊 User ${displayUser(ctx)} rated request ${trackId} as: ${ratingText}`
    )

    await ctx.editMessageText("Thank you for your feedback! 🙏")
    await ctx.answerCbQuery()
  } catch (error) {
    console.error("Error in rate action:", error)
    try { await ctx.answerCbQuery().catch(() => {}) } catch {}
  }
})

bot.action(/reply_(\d+)/, (ctx) => {
  try {
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
  } catch (err) {
    console.error("Error in reply action:", err)
    try { ctx.answerCbQuery().catch(() => {}) } catch {}
  }
})

// ================= COUNTRY SELECTION =================
bot.action(/player_select_(.+)/, async (ctx) => {
  if (!(await ensurePhone(ctx))) return
  try {
    const country = ctx.match[1]
    const session = getSession(ctx.from.id)
    if (session.processing) return
    session.processing = true

    session.data.country = country
    session.state = "player_issue_selection"

    await ctx.editMessageText(
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
    await ctx.answerCbQuery().catch(() => {})
  } catch (err) {
    console.error("Error in player_select action:", err)
    try { await ctx.answerCbQuery().catch(() => {}) } catch {}
  }
})

// ================= ISSUE TYPE =================
bot.action("player_issue_deposit", async (ctx) => {
  if (!(await ensurePhone(ctx))) return
  try {
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
    await ctx.answerCbQuery().catch(() => {})
  } catch (err) {
    console.error("Error in player_issue_deposit action:", err)
    try { await ctx.answerCbQuery().catch(() => {}) } catch {}
  }
})

bot.action("player_issue_withdrawal", async (ctx) => {
  if (!(await ensurePhone(ctx))) return
  try {
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
    await ctx.answerCbQuery().catch(() => {})
  } catch (err) {
    console.error("Error in player_issue_withdrawal action:", err)
    try { await ctx.answerCbQuery().catch(() => {}) } catch {}
  }
})

// ================= PAYMENT SYSTEMS =================
function showBangladeshPayments(ctx, session) {
  try {
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
  } catch (err) {
    console.error("Error in showBangladeshPayments:", err)
  }
}

function showIndiaPayments(ctx, session) {
  try {
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
  } catch (err) {
    console.error("Error in showIndiaPayments:", err)
  }
}

// ================= PAYMENT SELECTED =================
bot.action(/pay_(.+)/, async (ctx) => {
  if (!(await ensurePhone(ctx))) return
  try {
    const payment = ctx.match[1]
    const session = getSession(ctx.from.id)
    session.data.paymentSystem = payment
    session.state = "waiting_game_user_id"
    await ctx.reply("Enter User ID (numbers only):")
    await ctx.answerCbQuery().catch(() => {})
  } catch (err) {
    console.error("Error in pay action:", err)
    try { await ctx.answerCbQuery().catch(() => {}) } catch {}
  }
})

// ================= CONFIRMATION =================
async function showConfirmation(ctx, session) {
  try {
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

    await ctx.reply(
      "Please confirm:",
      Markup.inlineKeyboard([
        [Markup.button.callback("Submit", "submit_player")],
        [Markup.button.callback("Restart", "restart_player")],
        [Markup.button.callback("Main Menu", "main_menu")]
      ])
    )
  } catch (err) {
    console.error("Error in showConfirmation:", err)
  }
}

// ================= SUBMIT =================
bot.action("submit_player", async (ctx) => {
  if (!(await ensurePhone(ctx))) return
  try {
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

    // Mark user as player
    await updateUser(userId, { isPlayer: true })

    const message = `🎫 Player Request\nTrack ID: ${trackId}

User: ${ctx.from.first_name} ${username ? `(@${username})` : "(no username)"}
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
    await ctx.answerCbQuery().catch(() => {})
  } catch (err) {
    console.error("Error in submit_player action:", err)
    try { await ctx.answerCbQuery().catch(() => {}) } catch {}
  }
})

// ================= TICKET LIST DISPLAY FUNCTION =================
function showTicketList(ctx, category, page) {
  try {
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
  } catch (err) {
    console.error("Error in showTicketList:", err)
  }
}

bot.action(/^(deposit|withdrawal)_page_(\d+)$/, async (ctx) => {
  try {
    const category = ctx.match[1]
    const page = parseInt(ctx.match[2])
    showTicketList(ctx, category, page)
    await ctx.answerCbQuery().catch(() => {})
  } catch (err) {
    console.error("Error in pagination action:", err)
    try { await ctx.answerCbQuery().catch(() => {}) } catch {}
  }
})

bot.action(/^view_(deposit|withdrawal)_(TKT-.+)$/, async (ctx) => {
  try {
    const category = ctx.match[1]
    const trackId = ctx.match[2]
    const ticket = pendingTickets.find(t => t.trackId === trackId && t.status === "open")
    if (!ticket) {
      await ctx.answerCbQuery("Ticket not found or already resolved.")
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
    await ctx.answerCbQuery().catch(() => {})
  } catch (err) {
    console.error("Error in view ticket action:", err)
    try { await ctx.answerCbQuery().catch(() => {}) } catch {}
  }
})

// ================= GLOBAL ERROR HANDLER =================
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error)
})

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
})

// ================= START BOT =================
bot.launch()
console.log("🚀 Bot Running with All Features & MongoDB Connected")
