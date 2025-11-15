require("dotenv").config();
const http = require("http");
const { MongoClient } = require("mongodb");
const Razorpay = require("razorpay");
const cloudinary = require("cloudinary").v2;
const formidable = require("formidable");

cloudinary.config({
    cloud_name: "draibnla2",
    api_key: "645837412569762",
    api_secret: "r9sIcLUqS_xhvNzKqqFDpFBCoJQ"
});


const razorpay = new Razorpay({
  key_id: "rzp_test_RfaAH0asHcuVZE",
  key_secret: "kipPapaSAY1JHzlGA4PWjhPV"  
});


const client = new MongoClient(process.env.MONGO_URL);
const PORT = process.env.PORT 
async function startServer() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB Atlas");

    const db = client.db("caferes");
    const usersCollection = db.collection("users");
    const menuCollection = db.collection("menu");
    const ordersCollection = db.collection("orders");
    const bookingsCollection = db.collection("bookings");
    const reviewsCollection = db.collection("reviews");

    const server = http.createServer(async (req, res) => {
      // CORS headers
      // ===== CORS FIX =====
res.setHeader("Access-Control-Allow-Origin", "*");
res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
res.setHeader("Access-Control-Allow-Headers", "Content-Type");

// Handle preflight requests
if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
}


      console.log(`📨 ${req.method} ${req.url}`);

    // ===== CREATE RAZORPAY ORDER =====
if (req.method === "POST" && req.url === "/create-razorpay-order") {
  let body = "";

  req.on("data", chunk => {
    body += chunk;
  });

  req.on("end", async () => {
    try {
      const data = JSON.parse(body);

      if (!data.amount) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: false, error: "Amount missing" }));
      }

      const options = {
        amount: data.amount,     // price * 100 frontend se
        currency: "INR",
        receipt: "rcpt_" + Date.now()
      };

      console.log("Creating Razorpay order with:", options);

      const order = await razorpay.orders.create(options);
      console.log("Backend Razorpay order:", order);


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


// ===== SAVE ORDER AFTER PAYMENT =====
if (req.method === "POST" && req.url === "/place-order-after-payment") {
  let body = "";

  req.on("data", chunk => {
    body += chunk;
  });

  req.on("end", async () => {
    try {
      const data = JSON.parse(body);

      const {
        userId,
        username,
        item,
        paymentId,
        razorpayOrderId
      } = data;

      if (!paymentId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Payment ID missing" }));
      }

      // ---- Save order in DB ----
      const orderDoc = {
        userId,
        username,
        itemName: item.name,
        itemPrice: item.price,
        itemDetails: item,
        paymentId,
        razorpayOrderId,
        status: "Confirmed",
        timestamp: new Date()
      };

      const insert = await ordersCollection.insertOne(orderDoc);

      res.writeHead(201, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          success: true,
          message: "Order saved after payment",
          orderId: insert.insertedId
        })
      );

    } catch (err) {
      console.error("Save order error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Server error" }));
    }
  });

  return;
}


      // ===== PLACE BOOKING =====
      else if (req.method === "POST" && req.url === "/booking") {
        let body = "";

        req.on("data", (chunk) => {
          body += chunk;
        });

        req.on("end", async () => {
          try {
            const bookingData = JSON.parse(body);

            const {
              itemId,
              itemName,
              date,
              time,
              tableNumber,
              persons,
              userId, 
              username, 
            } = bookingData;

           
            if (
              !itemId ||
              !itemName ||
              !date ||
              !time ||
              !tableNumber ||
              !persons
            ) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Missing booking fields" }));
              return;
            }

            if (parseInt(persons) > 10) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  error: "Maximum 10 persons allowed per table",
                })
              );
              return;
            }

            if (parseInt(tableNumber) > 12 || parseInt(tableNumber) < 1) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({ error: "Invalid table number (1–12 only)" })
              );
              return;
            }

            const orderType = bookingData.tableNumber ? "Intable" : "Online";
            const booking = {
              itemId,
              itemName,
              date,
              time,
              tableNumber,
              persons,
              orderType: orderType,
              userId: userId || null,
              username:
                username ||
                (orderType === "Intable" ? `Table ${tableNumber}` : "Guest"),
              createdAt: new Date(),
            };

            const result = await bookingsCollection.insertOne(booking);

            res.writeHead(201, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                success: true,
                message: "Booking successful",
                bookingId: result.insertedId,
              })
            );
          } catch (error) {
            console.error("Booking error:", error);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Server error while booking" }));
          }
        });

        return;
      }

      // ===== LOGIN =====
      else if (req.method === "POST" && req.url === "/login") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
          try {
            const { username, password } = JSON.parse(body);
            const user = await usersCollection.findOne({ username, password });
            if (user) {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  message: "Login successful",
                  userId: user._id.toString(),
                  username: user.username,
                  email: user.email,
                })
              );
            } else {
              res.writeHead(401, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Invalid credentials" }));
            }
          } catch (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON" }));
          }
        });
        return;
      }

      // ===== SIGN UP =====
      else if (req.method === "POST" && req.url === "/usersData") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
          try {
            const { username, email, password } = JSON.parse(body);
          
      if (username.toLowerCase().includes('admin') || email.toLowerCase().includes('admin')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid input' }));
        return;
      }
             // Check if user already exists
            const existingUser = await usersCollection.findOne({
              $or: [{ username }, { email }],
            });

            if (existingUser) {
              res.writeHead(409, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  error: "Username or email already exists",
                })
              );
              return;
            }

            const result = await usersCollection.insertOne({
              username,
              email,
              password,
              createdAt: new Date(),
            });

            res.writeHead(201, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                message: "User created successfully",
                userId: result.insertedId,
              })
            );
          } catch (err) {
            console.error("Signup error:", err);
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid data" }));
          }
        });
        return;
      }

      // --- EXACT MATCH ROUTES (GET, POST) ---
      if (req.method === "GET") {
        if (req.url === "/menu") {
          try {
            const items = await menuCollection.find().toArray();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(items));
          } catch (err) {
            console.error("Get menu error:", err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Server error" }));
          }
          return;
        }
        if (req.url === "/admin/menu") {
          try {
            const items = await menuCollection.find().toArray();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(items));
          } catch (err) {
            console.error("Get admin menu error:", err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Server error" }));
          }
          return;
        }
        if (req.url === "/admin/orders") {
          try {
            const orders = await ordersCollection
              .find({})
              .sort({ timestamp: -1 })
              .toArray();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(orders));
          } catch (err) {
            console.error("Get orders error:", err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Server error" }));
          }
          return;
        }
        if (req.url === "/admin/users") {
          try {
            const users = await usersCollection
              .find(
                { username: { $ne: "admin" } },
                { projection: { password: 0 } }
              )
              .toArray();

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(users));
          } catch (err) {
            console.error("Get users error:", err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Server error" }));
          }
          return;
        }
        if (req.url === "/admin/bookings") {
          try {
            const bookings = await bookingsCollection
              .find({})
              .sort({ createdAt: -1 })
              .toArray();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(bookings));
          } catch (err) {
            console.error("Get bookings error:", err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Server error" }));
          }
          return;
        }
      }

      if (req.method === "POST") {
        if (req.url === "/admin/menu") {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", async () => {
            try {
              const menuItem = JSON.parse(body);
              if (!menuItem.name || !menuItem.price) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({ error: "Name and price are required" })
                );
                return;
              }
              const result = await menuCollection.insertOne({
                ...menuItem,
                createdAt: new Date(),
              });
              res.writeHead(201, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  success: true,
                  id: result.insertedId,
                  message: "Menu item added successfully",
                })
              );
            } catch (err) {
              console.error("Add menu error:", err);
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Bad request" }));
            }
          });
          return;
        }
      }

      // ===== GET REVIEWS =====
if (req.method === "POST" && req.url === "/add-review") {
    const form = formidable({ multiples: false });

    form.parse(req, async (err, fields, files) => {
        try {
            if (err) {
                console.log("Form parse error:", err);
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ success: false, error: "Form parsing failed" }));
            }

            const { username, message, role } = fields;
            const photoFile = files.photo;

            if (!photoFile) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ success: false, error: "Photo missing" }));
            }

            // Cloudinary Upload
            const uploaded = await cloudinary.uploader.upload(photoFile.filepath, {
                folder: "cafe_reviews",
            });

            // Save in DB
            const review = {
                username,
                message,
                role,
                photo: uploaded.secure_url,
                createdAt: new Date(),
            };

            await reviewsCollection.insertOne(review);

            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ success: true }));

        } catch (error) {
            console.error("Review upload error:", error);
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ success: false, error: "Server error" }));
        }
    });

    return;
}


      // --- DYNAMIC ROUTES (startsWith) ---

      // ===== GET USER ORDERS =====
      if (req.method === "GET" && req.url.startsWith("/orders/")) {
        try {
          const userId = req.url.split("/").pop();
          if (userId && ObjectId.isValid(userId)) {
            const orders = await ordersCollection
              .find({ userId })
              .sort({ timestamp: -1 })
              .toArray();

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(orders));
          } else {
            // Do not throw an error, just let it fall through to the final 404
          }
        } catch (err) {
          console.error("Get user orders error:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Server error" }));
        }
      }

      // ===== UPDATE MENU ITEM =====
      else if (req.method === "PUT" && req.url.startsWith("/admin/menu/")) {
        const id = req.url.split("/").pop();
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
          try {
            const menuItem = JSON.parse(body);

            if (!ObjectId.isValid(id)) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Invalid menu item ID" }));
              return;
            }

            const result = await menuCollection.updateOne(
              { _id: new ObjectId(id) },
              { $set: { ...menuItem, updatedAt: new Date() } }
            );

            if (result.matchedCount === 0) {
              res.writeHead(404, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Menu item not found" }));
              return;
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                success: true,
                message: "Menu item updated successfully",
              })
            );
          } catch (err) {
            console.error("Update menu error:", err);
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Bad request" }));
          }
        });
        return;
      }

      // ===== DELETE MENU ITEM =====
      else if (req.method === "DELETE" && req.url.startsWith("/admin/menu/")) {
        const id = req.url.split("/").pop();
        try {
          if (!ObjectId.isValid(id)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid menu item ID" }));
            return;
          }

          const result = await menuCollection.deleteOne({
            _id: new ObjectId(id),
          });

          if (result.deletedCount === 0) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Menu item not found" }));
            return;
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: true,
              message: "Menu item deleted successfully",
            })
          );
        } catch (err) {
          console.error("Delete menu error:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Server error" }));
        }
        return;
      }

      // ===== UPDATE ORDER STATUS =====
      else if (req.method === "PUT" && req.url.startsWith("/admin/orders/")) {
        const id = req.url.split("/").pop();
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
          try {
            const { status } = JSON.parse(body);

            if (!ObjectId.isValid(id)) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Invalid order ID" }));
              return;
            }

            const result = await ordersCollection.updateOne(
              { _id: new ObjectId(id) },
              { $set: { status, updatedAt: new Date() } }
            );

            if (result.matchedCount === 0) {
              res.writeHead(404, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Order not found" }));
              return;
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                success: true,
                message: "Order status updated successfully",
              })
            );
          } catch (err) {
            console.error("Update order error:", err);
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Bad request" }));
          }
        });
        return;
      }

      // ===== DELETE USER (Admin) =====
      else if (req.method === "DELETE" && req.url.startsWith("/admin/users/")) {
        const id = req.url.split("/").pop();
        try {
          if (!ObjectId.isValid(id)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid user ID" }));
            return;
          }

          const result = await usersCollection.deleteOne({
            _id: new ObjectId(id),
          });

          if (result.deletedCount === 0) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "User not found" }));
            return;
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: true,
              message: "User deleted successfully",
            })
          );
        } catch (err) {
          console.error("Delete user error:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Server error" }));
        }
        return;
      }

      // ===== DELETE BOOKING (Admin) =====
      else if (
        req.method === "DELETE" &&
        req.url.startsWith("/admin/bookings/")
      ) {
        const id = req.url.split("/").pop();
        try {
          if (!ObjectId.isValid(id)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid booking ID" }));
            return;
          }

          const result = await bookingsCollection.deleteOne({
            _id: new ObjectId(id),
          });

          if (result.deletedCount === 0) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Booking not found" }));
            return;
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: true,
              message: "Booking deleted successfully",
            })
          );
        } catch (err) {
          console.error("Delete booking error:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Server error" }));
        }
        return;
      } else {
        // ===== 404 NOT FOUND =====
        console.log(`❌ 404 for: ${req.method} ${req.url}`);
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Endpoint not found: ${req.url}` }));
      }
    });

    server.listen(PORT, () => {
      console.log("🚀 Server running on http://localhost:{PORT}}");
      console.log("✅ Available endpoints:");
      console.log("   POST /login");
      console.log("   POST /usersData");
      console.log("   POST /order");
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
  }
}

startServer();
