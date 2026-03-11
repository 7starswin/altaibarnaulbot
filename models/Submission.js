const mongoose = require("mongoose")

const submissionSchema = new mongoose.Schema({

userId:Number,
type:String,
requestNumber:Number,
data:Object,
status:{
type:String,
default:"pending"
},
createdAt:{
type:Date,
default:Date.now
}

})

module.exports = mongoose.model("Submission",submissionSchema)
