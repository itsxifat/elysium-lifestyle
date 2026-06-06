import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  name: { type: String, required: true },
  image: { type: String },
  size: { type: String, required: true },
  color: { type: String },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
});

const shippingAddressSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String },
  street: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String },
  postalCode: { type: String },
  country: { type: String, default: "Bangladesh" },
});

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    guestEmail: { type: String },
    items: [orderItemSchema],
    shippingAddress: { type: shippingAddressSchema, required: true },
    paymentMethod: {
      type: String,
      enum: ["sslcommerz", "cod"],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    orderStatus: {
      type: String,
      enum: ["pending", "processing", "shipped", "delivered", "cancelled"],
      default: "pending",
    },
    shippingZone: {
      type: String,
      enum: ["inside_dhaka", "suburbs", "outside_dhaka"],
      default: "inside_dhaka",
    },
    subtotal: { type: Number, required: true },
    shippingFee: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    transactionId: { type: String },
    valId: { type: String },
    notes: { type: String },

    // Steadfast (Packzy) courier fraud/delivery history for the order's phone,
    // fetched automatically on order creation. See lib/fraud.js.
    fraudCheck: {
      status: {
        type: String,
        enum: ["pending", "checking", "done", "error", "skipped", "unavailable"],
        default: "pending",
      },
      delivered: { type: Number, default: 0 },
      cancelled: { type: Number, default: 0 },
      frauds: { type: Number, default: 0 },
      totalParcels: { type: Number, default: 0 },
      successRate: { type: Number, default: 0 }, // delivered / total, %
      autoProcessed: { type: Boolean, default: false }, // did it auto-move to processing
      checkedAt: { type: Date, default: null },
      error: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

orderSchema.pre("save", async function () {
  if (!this.orderNumber) {
    const year = new Date().getFullYear();
    const count = await mongoose.model("Order").countDocuments();
    this.orderNumber = `ELY-${year}-${String(count + 1).padStart(5, "0")}`;
  }
});

const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);
export default Order;
