const mongoose = require("mongoose")

const userSchema = new mongoose.Schema({
  telegramId: Number,
  name: String,
  phone: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
})

module.exports = mongoose.model("User", userSchema)
