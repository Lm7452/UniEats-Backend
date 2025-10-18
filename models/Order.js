const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  items: [{
    itemName: String,
    price: Number,
    quantity: Number,
  }],
  totalPrice: { type: Number, required: true },
  status: {
    type: String,
    enum: ['placed', 'accepted', 'picked-up', 'delivered'],
    default: 'placed',
  },
  deliveryAddress: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Order', OrderSchema);
