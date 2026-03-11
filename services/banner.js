const fs = require("fs")
const path = require("path")

function randomBanner(){

 const folder = path.join(__dirname,"../assets/banners")

 const files = fs.readdirSync(folder)

 const file = files[Math.floor(Math.random()*files.length)]

 return path.join(folder,file)

}

module.exports = randomBanner
