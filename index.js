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

// ============================================
// flows/playerFlow.js - Player Issue Submission (LANGUAGE FIXED)
// ============================================

const { Markup } = require('telegraf');
const { loadLanguage } = require('../utils/i18n');
const { getUserData, saveSubmission } = require('../utils/db');
const { validatePhone, logToAdmin, formatDate } = require('../utils/helpers');

async function playerFlow(ctx, bot, adminChatIds, getSession, clearSession) {
  const userId = ctx.from.id;
  const userData = await getUserData(userId);
  const language = userData?.language || 'en';
  const texts = loadLanguage(language);

  const session = getSession(userId);
  
  // Clear any existing session state to prevent duplicates
  clearSession(userId);
  const newSession = getSession(userId);
  newSession.state = 'player_country_selection';
  newSession.data = { type: 'player', language };

  const keyboard = Markup.inlineKeyboard([
    [
        Markup.button.callback(`🇧🇩 ${texts.bangladesh}`, 'player_select_bangladesh'),
        Markup.button.callback(`🇮🇳 ${texts.india}`, 'player_select_india')
    ],
    [Markup.button.callback(texts.back, 'back_to_main')]
  ]);

  await ctx.reply(
    `👤 **${texts.player_support}**\n\n${texts.where_are_you_from}`,
    {
      parse_mode: 'Markdown',
      ...keyboard
    }
  );
}

// Country selection handlers
async function handlePlayerCountrySelection(ctx, country, getSession) {
  const session = getSession(ctx.from.id);
  const userData = await getUserData(ctx.from.id);
  const language = userData?.language || 'en';
  const texts = loadLanguage(language);
  
  // Prevent processing if already processing
  if (session.processing) {
    return;
  }
  session.processing = true;
  
  try {
    // Store selected country
    session.data.country = country;
    session.data.language = language;
    session.state = 'player_issue_selection';

    const keyboard = Markup.inlineKeyboard([
      [
          Markup.button.callback(texts.deposit, 'player_deposit_old')
      ],
      [Markup.button.callback(texts.withdrawal, 'player_withdrawal')],
      [Markup.button.callback(texts.back_arrow, 'menu_player')]
    ]);

    const countryFlags = {
      'bangladesh': '🇧🇩',
      'india': '🇮🇳', 
      'pakistan': '🇵🇰',
      'egypt': '🇪🇬',
      'nepal': '🇳🇵'
    };

    const countryNames = {
      'bangladesh': texts.bangladesh,
      'india': texts.india,
      'pakistan': texts.pakistan,
      'egypt': texts.egypt,
      'nepal': texts.nepal
    };

    await ctx.reply(
      `${countryFlags[country]} **${texts.player_support} - ${countryNames[country]}**\n\n${texts.what_issue_type}`,
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );
  } finally {
    session.processing = false;
  }
}

// Issue type handlers
async function handleDepositOld(ctx, getSession) {
  const session = getSession(ctx.from.id);
  
  if (session.processing) {
    return;
  }
  session.processing = true;
  
  try {
    const country = session.data.country;
    session.data.issueType = 'Deposit';
    
    if (country === 'bangladesh') {
      await showBangladeshOptions(ctx, session);
    } else if (country === 'india') {
      await showIndiaOptions(ctx, session);
    } else {
      await askUserId(ctx, session);
    }
  } finally {
    session.processing = false;
  }
}

async function handleWithdrawal(ctx, getSession) {
  const session = getSession(ctx.from.id);
  
  if (session.processing) {
    return;
  }
  session.processing = true;
  
  try {
    const country = session.data.country;
    session.data.issueType = 'Withdrawal';
    
    if (country === 'bangladesh') {
      await showBangladeshOptions(ctx, session);
    } else if (country === 'india') {
      await showIndiaOptions(ctx, session);
    } else {
      await askUserId(ctx, session);
    }
  } finally {
    session.processing = false;
  }
}

// Bangladesh payment options
async function showBangladeshOptions(ctx, session) {
  const userData = await getUserData(ctx.from.id);
  const texts = loadLanguage(userData?.language || 'en');

  const keyboard = Markup.inlineKeyboard([
    [
        Markup.button.callback('1. bKash', 'bd_bkash'),
        Markup.button.callback('2. Nagad', 'bd_nagad')
    ],
    [
        Markup.button.callback('3. Rocket', 'bd_rocket'),
        Markup.button.callback('4. Upay', 'bd_upay')
    ],
    [
        Markup.button.callback('5. MoneyGo', 'bd_moneygo'),
        Markup.button.callback('6. Binance', 'bd_binance')
    ],
    [Markup.button.callback(texts.main_menu, 'back_to_main')]
  ]);
  
  await ctx.reply(`🇧🇩 **${texts.bangladesh_payment_systems}**`, {
    parse_mode: 'Markdown', 
    ...keyboard
  });
}

// India payment options
async function showIndiaOptions(ctx, session) {
  const userData = await getUserData(ctx.from.id);
  const texts = loadLanguage(userData?.language || 'en');

  const keyboard = Markup.inlineKeyboard([
    [
        Markup.button.callback('1. PhonePe', 'in_phonepe'),
        Markup.button.callback('2. PayTM UPI', 'in_paytmupi')
    ],
    [Markup.button.callback(texts.main_menu, 'back_to_main')]
  ]);
  
  await ctx.reply(`🇮🇳 **${texts.india_payment_systems}**`, {
    parse_mode: 'Markdown', 
    ...keyboard
  });
}

// Legacy functions for other countries
async function handleBangladeshCountry(ctx) {
  const session = getSession(ctx.from.id);
  await showBangladeshOptions(ctx, session);
}

async function handleIndiaCountry(ctx) {
  const session = getSession(ctx.from.id);
  await showIndiaOptions(ctx, session);
}

// Simplified withdrawal flow for bKash, Nagad, Rocket, Upay
async function askPlayerIdForWithdrawal(ctx, session, paymentType) {
  const userData = await getUserData(ctx.from.id);
  const texts = loadLanguage(userData?.language || 'en');

  session.data.paymentSystem = paymentType;
  session.state = 'waiting_player_id_withdrawal';
  
  await ctx.reply(
    `📢 **${session.data.issueType} - ${paymentType}**\n\n${texts.enter_player_id}`,
    { parse_mode: 'Markdown' }
  );
}

// Date picker for withdrawal flow
async function showDatePickerForWithdrawal(ctx, session) {
  const userData = await getUserData(ctx.from.id);
  const texts = loadLanguage(userData?.language || 'en');

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const monthNames = {
    en: ['January', 'February', 'March', 'April', 'May', 'June',
         'July', 'August', 'September', 'October', 'November', 'December'],
    bn: ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
         'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'],
    hi: ['जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून',
         'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर']
  };

  const currentMonthNames = monthNames[userData?.language || 'en'] || monthNames['en'];

  const keyboard = [];
  keyboard.push([Markup.button.callback(`📅 ${currentMonthNames[month]} ${year}`, 'date_header')]);
  keyboard.push([
    Markup.button.callback(texts.monday_short || 'Mo', 'day_header'),
    Markup.button.callback(texts.tuesday_short || 'Tu', 'day_header'),
    Markup.button.callback(texts.wednesday_short || 'We', 'day_header'),
    Markup.button.callback(texts.thursday_short || 'Th', 'day_header'),
    Markup.button.callback(texts.friday_short || 'Fr', 'day_header'),
    Markup.button.callback(texts.saturday_short || 'Sa', 'day_header'),
    Markup.button.callback(texts.sunday_short || 'Su', 'day_header')
  ]);

  let week = [];
  for (let i = 0; i < firstDay; i++) {
    week.push(Markup.button.callback(' ', 'empty_day'));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    week.push(Markup.button.callback(day.toString(), `date_withdrawal_${day}`));
    if (week.length === 7) {
      keyboard.push(week);
      week = [];
    }
  }

  while (week.length < 7 && week.length > 0) {
    week.push(Markup.button.callback(' ', 'empty_day'));
  }
  if (week.length > 0) keyboard.push(week);

  keyboard.push([Markup.button.callback(texts.main_menu, 'back_to_main')]);

  session.state = 'waiting_withdrawal_date';

  await ctx.reply(
    `📅 **${texts.select_date}**\n\n${texts.current_month}: ${currentMonthNames[month]} ${year}`,
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    }
  );
}

// Common flow functions
async function askUserId(ctx, session) {
  const userData = await getUserData(ctx.from.id);
  const texts = loadLanguage(userData?.language || 'en');

  session.state = 'waiting_user_id';

  await ctx.reply(
    `📢 **${session.data.issueType} - ${session.data.paymentSystem || texts.generic}**\n\n${texts.enter_user_id}`,
    { parse_mode: 'Markdown' }
  );
}

// Date picker with text time input (original flow)
async function showDatePicker(ctx, session) {
  const userData = await getUserData(ctx.from.id);
  const texts = loadLanguage(userData?.language || 'en');

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const monthNames = {
    en: ['January', 'February', 'March', 'April', 'May', 'June',
         'July', 'August', 'September', 'October', 'November', 'December'],
    bn: ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
         'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'],
    hi: ['जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून',
         'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर']
  };

  const currentMonthNames = monthNames[userData?.language || 'en'] || monthNames['en'];

  const keyboard = [];
  keyboard.push([Markup.button.callback(`📅 ${currentMonthNames[month]} ${year}`, 'date_header')]);
  keyboard.push([
    Markup.button.callback(texts.monday_short || 'Mo', 'day_header'),
    Markup.button.callback(texts.tuesday_short || 'Tu', 'day_header'),
    Markup.button.callback(texts.wednesday_short || 'We', 'day_header'),
    Markup.button.callback(texts.thursday_short || 'Th', 'day_header'),
    Markup.button.callback(texts.friday_short || 'Fr', 'day_header'),
    Markup.button.callback(texts.saturday_short || 'Sa', 'day_header'),
    Markup.button.callback(texts.sunday_short || 'Su', 'day_header')
  ]);

  let week = [];
  for (let i = 0; i < firstDay; i++) {
    week.push(Markup.button.callback(' ', 'empty_day'));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    week.push(Markup.button.callback(day.toString(), `date_${day}`));
    if (week.length === 7) {
      keyboard.push(week);
      week = [];
    }
  }

  while (week.length < 7 && week.length > 0) {
    week.push(Markup.button.callback(' ', 'empty_day'));
  }
  if (week.length > 0) keyboard.push(week);

  keyboard.push([Markup.button.callback(texts.main_menu, 'back_to_main')]);

  session.state = 'waiting_date';

  await ctx.reply(
    `📅 **${texts.select_date}**\n\n${texts.current_month}: ${currentMonthNames[month]} ${year}`,
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    }
  );
}

// Generic confirmation function
async function showPlayerConfirmation(ctx, session) {
  const userData = await getUserData(ctx.from.id);
  const texts = loadLanguage(userData?.language || 'en');

  // Show uploaded file
  if (session.data.fileId) {
    try {
      if (session.data.fileName && (session.data.fileName.toLowerCase().includes('video') ||
        session.data.fileName.toLowerCase().match(/\.(mp4|avi|mov|mkv)$/))) {
        await ctx.reply(`📎 **${texts.your_uploaded_file}:**`);
        await ctx.replyWithVideo(session.data.fileId);
      } else {
        await ctx.reply(`📎 **${texts.your_uploaded_file}:**`);
        await ctx.replyWithPhoto(session.data.fileId);
      }
    } catch (error) {
      console.error('Error showing file preview:', error);
      await ctx.reply(`📎 **${texts.file_preview}:** ✅ ${texts.file_uploaded_success}`);
    }
  }

  // Build dynamic confirmation text
  let details = '';
  for (const [key, val] of Object.entries(session.data)) {
    if (['fileId', 'language', 'type'].includes(key)) continue;
    details += `**${key}:** ${val}\n`;
  }

  const confirmationText = `📋 **${texts.confirm_details}**\n\n${details}\n${texts.is_information_correct}`;

  const keyboard = Markup.inlineKeyboard([
    [
        Markup.button.callback(texts.submit, 'player_submit'),
        Markup.button.callback(texts.restart, 'player_restart')
    ],
    [Markup.button.callback(texts.main_menu, 'back_to_main')]
  ]);

  await ctx.reply(confirmationText, {
    parse_mode: 'Markdown',
    ...keyboard
  });
}

function generateRequestNumber() {
  return Math.floor(1000 + Math.random() * 9000);
}

// Fixed submit function with proper error handling and anti-duplicate
async function submitPlayerRequest(ctx, session, bot, adminChatIds) {
  const userId = ctx.from.id;
  const userData = await getUserData(userId);
  const texts = loadLanguage(userData?.language || 'en');

  // Prevent duplicate submissions
  if (session.submitting) {
    return;
  }
  session.submitting = true;

  try {
    const requestNumber = generateRequestNumber();
    session.data.requestNumber = requestNumber;

    const userLanguage = userData?.language || session.data.language || 'en';
    
    await saveSubmission({
      userId,
      type: 'player',
      requestNumber,
      data: session.data,
      status: 'pending'
    });

    // Enhanced admin keyboard with reply feature
    const adminKeyboard = Markup.inlineKeyboard([
      [
          Markup.button.callback('💬 Reply to User', `admin_reply_${userId}_${requestNumber}`),
          Markup.button.callback('✅ Mark Resolved', `admin_resolve_${userId}_${requestNumber}`)
      ]
    ]);

    let adminMessage = `👤 **New ${session.data.issueType} Request #${requestNumber}**\n\n` +
      `**User:** ${userData?.name || 'Unknown'}\n` +
      `**User ID (Telegram):** ${userId}\n` +
      `**Country:** ${session.data.country || 'Unknown'}\n` +
      `**Payment System:** ${session.data.paymentSystem}\n` +
      `**Language:** ${userLanguage.toUpperCase()}\n` +
      `**Submitted:** ${formatDate()}\n\n`;

    // Add all fields dynamically
    for (const [key, val] of Object.entries(session.data)) {
      if (['fileId', 'language', 'type', 'requestNumber'].includes(key)) continue;
      adminMessage += `**${key}:** ${val}\n`;
    }

    for (const chatId of adminChatIds) {
      try {
        if (session.data.fileId) {
          if (session.data.fileName && (session.data.fileName.toLowerCase().includes('video') ||
            session.data.fileName.toLowerCase().match(/\.(mp4|avi|mov|mkv)$/))) {
            await bot.telegram.sendVideo(chatId, session.data.fileId, {
              caption: adminMessage,
              parse_mode: 'Markdown',
              ...adminKeyboard
            });
          } else {
            await bot.telegram.sendPhoto(chatId, session.data.fileId, {
              caption: adminMessage,
              parse_mode: 'Markdown',
              ...adminKeyboard
            });
          }
        } else {
          await bot.telegram.sendMessage(chatId, adminMessage, {
            parse_mode: 'Markdown',
            ...adminKeyboard
          });
        }
      } catch (error) {
        console.error(`Failed to send to admin ${chatId}:`, error.message);
      }
    }

    const userKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback(texts.main_menu, 'back_to_main')]
    ]);

    await ctx.reply(
      `✅ **${texts.request_registered}** **${requestNumber}**\n\n` +
      `${texts.admin_team_response}\n\n` +
      `📱 ${texts.notification_info}`,
      {
        parse_mode: 'Markdown',
        ...userKeyboard
      }
    );

  } catch (error) {
    console.error('Player submission error:', error);
    await ctx.reply(`⚠️ ${texts.error_submitting_request}`);
  } finally {
    session.submitting = false;
  }
}

module.exports = {
  playerFlow,
  handlePlayerCountrySelection,
  handleDepositOld,
  handleWithdrawal,
  handleBangladeshCountry,
  handleIndiaCountry,
  askUserId,
  showDatePicker,
  showDatePickerForWithdrawal,
  askPlayerIdForWithdrawal,
  showPlayerConfirmation,
  submitPlayerRequest,
  generateRequestNumber
};

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
