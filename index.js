require("dotenv").config()

const express = require("express")
const connectDB = require("./config/database")

const adminRoutes = require("./routes/admin")

require("./bot")

const app = express()

connectDB()

app.use(express.urlencoded({extended:true}))
app.use(express.json())

app.use("/admin",adminRoutes)

app.get("/",(req,res)=>{

 res.send("Bot running")

})

app.listen(process.env.PORT,()=>{

 console.log("Server started")

})

process.on("unhandledRejection",console.error)
process.on("uncaughtException",console.error)
