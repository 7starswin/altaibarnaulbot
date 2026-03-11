const User = require("../models/User")
const Submission = require("../models/Submission")

async function getUserData(id){

return User.findOne({telegramId:id})

}

async function saveUser(data){

return User.create(data)

}

async function updateUserData(id,data){

return User.updateOne({telegramId:id},data)

}

async function saveSubmission(data){

return Submission.create(data)

}

module.exports = {
getUserData,
saveUser,
updateUserData,
saveSubmission
}
