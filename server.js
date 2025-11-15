// server.js
require("dotenv").config();
const http = require("http");
const { MongoClient, ObjectId } = require("mongodb");
const Razorpay = require("razorpay");
const cloudinary = require("cloudinary").v2;
const formidable = require("formidable");

// ------- Cloudinary config (already provided by you) -------
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "draibnla2",
    api_key: process.env.CLOUDINARY_API_KEY || "645837412569762",
    api_secret: process.env.CLOUDINARY_API_SECRET || "r9sIcLUqS_xhvNzKqqFDpFBCoJQ"
});

// ------- Razorpay config (already provided by you) -------
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_RfaAH0asHcuVZE",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "kipPapaSAY1JHzlGA4PWjhPV"
});

// ------- Mongo + server setup -------
const client = new MongoClient(process.env.MONGO_URL || "mongodb://localhost:27017");
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db("caferes");
    const usersCollection = db.collection("users");
    const menuCollection = db.collection("menu");
    const ordersCollection = db.collection("orders");
    const bookingsCollection = db.collection("bookings");
    const reviewsCollection = db.collection("reviews");

    const server = http.createServer(async (req, res) => {
      // ---------- GLOBAL CORS ----------
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

      // Preflight
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
      }

      // --------- ROUTES ---------

      // Create Razorpay order
      if (req.method === "POST" && req.url === "/create-razorpay-order") {
        let body = "";
        req.on("data", chunk => (body += chunk));
        req.on("end", async () => {
          try {
            const data = JSON.parse(body || "{}");
            if (!data.amount) {
              res.writeHead(400, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({ success: false, error: "Amount missing" }));
            }

            const options = {
              amount: data.amount,
              currency: "INR",
              receipt: "rcpt_" + Date.now()
            };

            const order = await razorpay.orders.create(options);

            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({
              success: true,
              orderId: order.id,
              amount: order.amount
            }));
          } catch (err) {
            console.error("❌ Razorpay order error:", err);
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ success: false, error: "Razorpay failed" }));
          }
        });
        return;
      }

      // Save order after payment
      if (req.method === "POST" && req.url === "/place-order-after-payment") {
        let body = "";
        req.on("data", chunk => (body += chunk));
        req.on("end", async () => {
          try {
            const data = JSON.parse(body || "{}");
            const { userId, username, item, paymentId, razorpayOrderId } = data;
            if (!paymentId) {
              res.writeHead(400, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({ error: "Payment ID missing" }));
            }
            const orderDoc = {
              userId: userId || null,
              username: username || "Guest",
              itemName: item?.name || "Unknown",
              itemPrice: item?.price || 0,
              itemDetails: item || {},
              paymentId,
              razorpayOrderId: razorpayOrderId || null,
              status: "Confirmed",
              timestamp: new Date()
            };

            const insert = await ordersCollection.insertOne(orderDoc);

            res.writeHead(201, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({
              success: true,
              message: "Order saved after payment",
              orderId: insert.insertedId
            }));
          } catch (err) {
            console.error("Save order error:", err);
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Server error" }));
          }
        });
        return;
      }

      // Booking
      if (req.method === "POST" && req.url === "/booking") {
        let body = "";
        req.on("data", chunk => (body += chunk));
        req.on("end", async () => {
          try {
            const bookingData = JSON.parse(body || "{}");
            const {
              itemId, itemName, date, time, tableNumber, persons, userId, username
            } = bookingData;

            if (!itemId || !itemName || !date || !time || !tableNumber || !persons) {
              res.writeHead(400, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({ error: "Missing booking fields" }));
            }

            if (parseInt(persons) > 10) {
              res.writeHead(400, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({ error: "Maximum 10 persons allowed per table" }));
            }

            if (parseInt(tableNumber) > 12 || parseInt(tableNumber) < 1) {
              res.writeHead(400, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({ error: "Invalid table number (1–12 only)" }));
            }

            const orderType = tableNumber ? "Intable" : "Online";
            const booking = {
              itemId,
              itemName,
              date,
              time,
              tableNumber,
              persons,
              orderType,
              userId: userId || null,
              username: username || (orderType === "Intable" ? `Table ${tableNumber}` : "Guest"),
              createdAt: new Date()
            };

            const result = await bookingsCollection.insertOne(booking);

            res.writeHead(201, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ success: true, message: "Booking successful", bookingId: result.insertedId }));
          } catch (error) {
            console.error("Booking error:", error);
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Server error while booking" }));
          }
        });
        return;
      }

      // Login
      if (req.method === "POST" && req.url === "/login") {
        let body = "";
        req.on("data", chunk => (body += chunk));
        req.on("end", async () => {
          try {
            const { username, password } = JSON.parse(body || "{}");
            const user = await usersCollection.findOne({ username, password });
            if (user) {
              res.writeHead(200, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({
                message: "Login successful",
                userId: user._id.toString(),
                username: user.username,
                email: user.email || null
              }));
            } else {
              res.writeHead(401, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({ error: "Invalid credentials" }));
            }
          } catch (err) {
            console.error("Login parse error:", err);
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Invalid JSON" }));
          }
        });
        return;
      }

      // Sign up
      if (req.method === "POST" && req.url === "/usersData") {
        let body = "";
        req.on("data", chunk => (body += chunk));
        req.on("end", async () => {
          try {
            const { username, email, password } = JSON.parse(body || "{}");
            if (!username || !email || !password) {
              res.writeHead(400, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({ error: "Missing fields" }));
            }

            if (username.toLowerCase().includes('admin') || email.toLowerCase().includes('admin')) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ error: 'Invalid input' }));
            }

            const existingUser = await usersCollection.findOne({ $or: [{ username }, { email }] });
            if (existingUser) {
              res.writeHead(409, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({ error: "Username or email already exists" }));
            }

            const result = await usersCollection.insertOne({ username, email, password, createdAt: new Date() });

            res.writeHead(201, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "User created successfully", userId: result.insertedId }));
          } catch (err) {
            console.error("Signup error:", err);
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Invalid data" }));
          }
        });
        return;
      }

      // Admin add menu (POST)
      if (req.method === "POST" && req.url === "/admin/menu") {
        let body = "";
        req.on("data", chunk => (body += chunk));
        req.on("end", async () => {
          try {
            const menuItem = JSON.parse(body || "{}");
            if (!menuItem.name || !menuItem.price) {
              res.writeHead(400, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({ error: "Name and price are required" }));
            }
            const result = await menuCollection.insertOne({ ...menuItem, createdAt: new Date() });
            res.writeHead(201, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ success: true, id: result.insertedId, message: "Menu item added successfully" }));
          } catch (err) {
            console.error("Add menu error:", err);
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Bad request" }));
          }
        });
        return;
      }

      // ===== ADD REVIEW (file upload via formidable) =====
      if (req.method === "POST" && req.url === "/add-review") {
        // Use formidable with keepExtensions
        const form = formidable({ multiples: false, keepExtensions: true });

        form.parse(req, async (err, fields, files) => {
          if (err) {
            console.error("Form parse error:", err);
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ success: false, error: "Form parsing error" }));
          }

          try {
            const { username, message, role } = fields || {};
            const photo = files?.photo;

            if (!photo) {
              res.writeHead(400, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({ success: false, error: "Photo missing" }));
            }

            // Upload to Cloudinary (wrap in try/catch)
            let upload;
            try {
              upload = await cloudinary.uploader.upload(photo.filepath, { folder: "reviews" });
            } catch (cloudErr) {
              console.error("Cloudinary upload error:", cloudErr);
              res.writeHead(500, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({ success: false, error: "Image upload failed" }));
            }

            const reviewDoc = {
              username: username || "Anonymous",
              message: message || "",
              role: role || "customer",
              photo: upload.secure_url,
              createdAt: new Date()
            };

            await reviewsCollection.insertOne(reviewDoc);

            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ success: true, review: reviewDoc }));
          } catch (error) {
            console.error("Add review error:", error);
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ success: false, error: "Server error" }));
          }
        });

        return;
      }

      // GET menu
      if (req.method === "GET" && req.url === "/menu") {
        try {
          const items = await menuCollection.find().toArray();
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(items));
        } catch (err) {
          console.error("Get menu error:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Server error" }));
        }
      }

      // Admin GETs
      if (req.method === "GET" && req.url === "/admin/menu") {
        try {
          const items = await menuCollection.find().toArray();
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(items));
        } catch (err) {
          console.error("Get admin menu error:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Server error" }));
        }
      }

      if (req.method === "GET" && req.url === "/admin/orders") {
        try {
          const orders = await ordersCollection.find({}).sort({ timestamp: -1 }).toArray();
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(orders));
        } catch (err) {
          console.error("Get orders error:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Server error" }));
        }
      }

      if (req.method === "GET" && req.url === "/admin/users") {
        try {
          const users = await usersCollection.find({ username: { $ne: "admin" } }, { projection: { password: 0 } }).toArray();
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(users));
        } catch (err) {
          console.error("Get users error:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Server error" }));
        }
      }

      if (req.method === "GET" && req.url === "/admin/bookings") {
        try {
          const bookings = await bookingsCollection.find({}).sort({ createdAt: -1 }).toArray();
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(bookings));
        } catch (err) {
          console.error("Get bookings error:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Server error" }));
        }
      }
      // ========= GET REVIEWS =========
if (req.method === "GET" && req.url === "/reviews") {
  try {
    const reviews = await reviewsCollection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(reviews));

  } catch (err) {
    console.error("Get reviews error:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Server error" }));
  }
}
      // Dynamic: GET orders by userId
      if (req.method === "GET" && req.url.startsWith("/orders/")) {
        try {
          const userId = req.url.split("/").pop();
          if (userId && ObjectId.isValid(userId)) {
            const orders = await ordersCollection.find({ userId }).sort({ timestamp: -1 }).toArray();
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify(orders));
          }
        } catch (err) {
          console.error("Get user orders error:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Server error" }));
        }
        // fallthrough to 404 if not valid
      }

      // Update menu item (PUT)
      if (req.method === "PUT" && req.url.startsWith("/admin/menu/")) {
        const id = req.url.split("/").pop();
        let body = "";
        req.on("data", chunk => (body += chunk));
        req.on("end", async () => {
          try {
            const menuItem = JSON.parse(body || "{}");
            if (!ObjectId.isValid(id)) {
              res.writeHead(400, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({ error: "Invalid menu item ID" }));
            }

            const result = await menuCollection.updateOne({ _id: new ObjectId(id) }, { $set: { ...menuItem, updatedAt: new Date() } });
            if (result.matchedCount === 0) {
              res.writeHead(404, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({ error: "Menu item not found" }));
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ success: true, message: "Menu item updated successfully" }));
          } catch (err) {
            console.error("Update menu error:", err);
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Bad request" }));
          }
        });
        return;
      }

      // Delete menu item
      if (req.method === "DELETE" && req.url.startsWith("/admin/menu/")) {
        const id = req.url.split("/").pop();
        try {
          if (!ObjectId.isValid(id)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Invalid menu item ID" }));
          }
          const result = await menuCollection.deleteOne({ _id: new ObjectId(id) });
          if (result.deletedCount === 0) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Menu item not found" }));
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ success: true, message: "Menu item deleted successfully" }));
        } catch (err) {
          console.error("Delete menu error:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Server error" }));
        }
      }

      // Update order status
      if (req.method === "PUT" && req.url.startsWith("/admin/orders/")) {
        const id = req.url.split("/").pop();
        let body = "";
        req.on("data", chunk => (body += chunk));
        req.on("end", async () => {
          try {
            const { status } = JSON.parse(body || "{}");
            if (!ObjectId.isValid(id)) {
              res.writeHead(400, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({ error: "Invalid order ID" }));
            }
            const result = await ordersCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status, updatedAt: new Date() } });
            if (result.matchedCount === 0) {
              res.writeHead(404, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({ error: "Order not found" }));
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ success: true, message: "Order status updated successfully" }));
          } catch (err) {
            console.error("Update order error:", err);
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Bad request" }));
          }
        });
        return;
      }

      // Delete user (admin)
      if (req.method === "DELETE" && req.url.startsWith("/admin/users/")) {
        const id = req.url.split("/").pop();
        try {
          if (!ObjectId.isValid(id)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Invalid user ID" }));
          }
          const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
          if (result.deletedCount === 0) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "User not found" }));
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ success: true, message: "User deleted successfully" }));
        } catch (err) {
          console.error("Delete user error:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Server error" }));
        }
      }

      // Delete booking (admin)
      if (req.method === "DELETE" && req.url.startsWith("/admin/bookings/")) {
        const id = req.url.split("/").pop();
        try {
          if (!ObjectId.isValid(id)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Invalid booking ID" }));
          }
          const result = await bookingsCollection.deleteOne({ _id: new ObjectId(id) });
          if (result.deletedCount === 0) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Booking not found" }));
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ success: true, message: "Booking deleted successfully" }));
        } catch (err) {
          console.error("Delete booking error:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Server error" }));
        }
      }

      // Final 404
      console.log(`❌ 404 for: ${req.method} ${req.url}`);
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: `Endpoint not found: ${req.url}` }));
    });

    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log("✅ Available endpoints:");
      console.log("   POST /login");
      console.log("   POST /usersData");
      console.log("   POST /create-razorpay-order");
      console.log("   POST /place-order-after-payment");
      console.log("   GET  /menu");
      console.log("   POST /booking");
      console.log("   GET  /orders/:userId");
      console.log("   GET  /admin/menu");
      console.log("   GET  /admin/orders");
      console.log("   GET  /admin/users");
      console.log("   GET  /admin/bookings");
      console.log("   POST /admin/menu");
      console.log("   PUT  /admin/menu/:id");
      console.log("   DELETE /admin/bookings/:id");
      console.log("   DELETE /admin/menu/:id");
      console.log("   DELETE /admin/users/:id");
      console.log("   PUT  /admin/orders/:id");
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

startServer();
