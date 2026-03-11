const express = require("express")
const router = express.Router()

const broadcast = require("../services/broadcast")
const bot = require("../bot")

router.get("/",(req,res)=>{

 res.sendFile(__dirname+"/../views/dashboard.html")

})

router.post("/broadcast",async(req,res)=>{

 const msg = req.body.message

 await broadcast(bot,msg)

 res.send("Broadcast sent")

})

module.exports = router
