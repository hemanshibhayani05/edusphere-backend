const mongoose = require("mongoose");

let isConnected = false;

const connectDB = async () => {
  if (isConnected) {
    console.log("✅ MongoDB already connected.");
    return;
  }

  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error("❌ MONGODB_URI is not defined in .env");
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000, // 10 second timeout
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    console.log(`✅ MongoDB Atlas connected: ${conn.connection.host}`);
    console.log(`📦 Database: ${conn.connection.name}`);
  } catch (error) {
    console.error("❌ MongoDB connection failed:");
    console.error(error.message);
    process.exit(1);
  }
};

mongoose.connection.on("disconnected", () => {
  console.warn("⚠️  MongoDB disconnected. Attempting to reconnect...");
  isConnected = false;
});

mongoose.connection.on("reconnected", () => {
  console.log("✅ MongoDB reconnected.");
  isConnected = true;
});

module.exports = connectDB;
