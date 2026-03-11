require("dotenv").config()

const express = require("express")
const connectDB = require("./config/database")

// start telegram bot
require("./bot")

const app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// connect database
connectDB()

// test route
app.get("/", (req, res) => {
  res.send("Telegram Marketing Bot Running")
})

// start server
const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("Server started")
})

// prevent crash
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err)
})

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err)
})
