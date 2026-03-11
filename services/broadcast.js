const User = require("../models/User")

async function broadcast(bot,text){

 const users = await User.find()

 for(const user of users){

  try{

   await bot.sendMessage(user.telegramId,text)

   await new Promise(r=>setTimeout(r,50))

  }catch(e){

   console.log("failed:",user.telegramId)

  }

 }

}

module.exports = broadcast
