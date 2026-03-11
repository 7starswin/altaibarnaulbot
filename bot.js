require("dotenv").config()

const TelegramBot = require("node-telegram-bot-api")
const User = require("./models/User")
const banner = require("./services/banner")

const bot = new TelegramBot(process.env.BOT_TOKEN,{polling:true})

bot.onText(/\/start (.+)/, async(msg,match)=>{

 const code = match[1]

 let ref = null

 if(code.startsWith("agent_")){
  ref = code.split("_")[1]
 }

 await User.findOneAndUpdate(
  {telegramId:msg.from.id},
  {
   telegramId:msg.from.id,
   username:msg.from.username,
   referredBy:ref,
   campaign:code
  },
  {upsert:true}
 )

 const image = banner()

 bot.sendPhoto(msg.chat.id,image,{
  caption:"🔥 Welcome! Claim your promo bonus."
 })

})

bot.onText(/\/start/, async(msg)=>{

 await User.findOneAndUpdate(
  {telegramId:msg.from.id},
  {
   telegramId:msg.from.id,
   username:msg.from.username
  },
  {upsert:true}
 )

 const image = banner()

 bot.sendPhoto(msg.chat.id,image,{
  caption:"🔥 Welcome to our platform!"
 })

})

bot.onText(/\/agent/,async(msg)=>{

 const id = msg.from.id

 const link = `https://t.me/YOURBOT?start=agent_${id}`

 bot.sendMessage(msg.chat.id,

`🤝 Your Agent Link

${link}

Share this link and earn commission.`)

})

bot.onText(/\/promo/,async(msg)=>{

 const image = banner()

 bot.sendPhoto(msg.chat.id,image,{
  caption:"🎁 Share this banner and invite players!"
 })

})

module.exports = bot
