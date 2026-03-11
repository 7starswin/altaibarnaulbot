const mongoose = require("mongoose")

const UserSchema = new mongoose.Schema({

 telegramId:String,

 username:String,

 referredBy:String,

 campaign:String,

 joined:{
  type:Date,
  default:Date.now
 }

})

module.exports = mongoose.model("User",UserSchema)
