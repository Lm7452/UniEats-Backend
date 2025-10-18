const mongoose = require('mongoose');

const RestaurantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  menu: [{
    itemName: String,
    description: String,
    price: Number,
  }],
}, { timestamps: true });

module.exports = mongoose.model('Restaurant', RestaurantSchema);