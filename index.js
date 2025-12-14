const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);

// middle ware
app.use(express.json());
app.use(cors());
app.get("/", (req, res) => {
  res.send("Hello from book Nest!");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xyz4gji.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("book_nest_db");
    const booksCollection = db.collection("books");
    const userCollection = db.collection("users");
    const ordersCollection = db.collection("orders");
    const paymentCollection = db.collection("payments");

    // user releted api

    app.get("/users", async (req, res) => {
      const searchText = req.query.searchText;
      const query = {};

      if (searchText) {
        // query.displayName = {$regex: searchText, $options: 'i'}

        query.$or = [
          { displayName: { $regex: searchText, $options: "i" } },
          { email: { $regex: searchText, $options: "i" } },
        ];
      }

      const cursor = userCollection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(5);
      const result = await cursor.toArray();
      res.send(result);
    });

    // save user in database
    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "user";
      user.createdAt = new Date();
      const email = user.email;
      const userExists = await userCollection.findOne({ email });

      if (userExists) {
        return res.send({ message: "user exists" });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // get user role
    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await userCollection.findOne(query);
      res.send({ role: user?.role || "user" });
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await userCollection.findOne(query);
      res.send(user);
    });

    // Update user profile by email
    app.patch("/users/profile/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const { displayName, photoURL } = req.body;
        console.log(displayName, photoURL);

        const updatedDoc = {
          $set: {},
        };
        if (displayName) updatedDoc.$set.displayName = displayName;
        if (photoURL) updatedDoc.$set.photoURL = photoURL;
        console.log(updatedDoc);

        const result = await userCollection.updateOne(
          { email: email },
          updatedDoc
        );

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to update profile", error });
      }
    });

    // update user role
    app.patch(
      "/users/:id/role",

      async (req, res) => {
        const id = req.params.id;
        const roleInfo = req.body;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: roleInfo.role,
          },
        };
        const result = await userCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    );
    // admin update book status
    app.patch("/admin/books/status/:id", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;

      const result = await booksCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: status } }
      );

      res.send(result);
    });

    // delete book by admin (also delete related orders)
    app.delete("/admin/books/:id", async (req, res) => {
      try {
        const id = req.params.id;

        //  Check book exists
        const book = await booksCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!book) {
          return res.status(404).send({ error: "Book not found" });
        }

        //  Delete all orders of this book
        const orderDeleteResult = await ordersCollection.deleteMany({
          bookId: id,
        });

        const bookDeleteResult = await booksCollection.deleteOne({
          _id: new ObjectId(id),
        });

        res.send({
          success: true,
          message: "Book and related orders deleted successfully",
          deletedBook: bookDeleteResult.deletedCount,
          deletedOrders: orderDeleteResult.deletedCount,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({
          error: "Failed to delete book",
        });
      }
    });

    // book related api
    app.post("/books", async (req, res) => {
      const bookData = req.body;
      const result = await booksCollection.insertOne(bookData);
      res.send(result);
    });

    // get particular book infomation
    app.get("/book/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await booksCollection.findOne(query);
      res.send(result);
    });

    // update particular book
    app.patch("/update-book/:id", async (req, res) => {
      const id = req.params.id;
      const updatedBook = req.body;

      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          bookName: updatedBook.bookName,
          bookAuthor: updatedBook.bookAuthor,
          price: updatedBook.price,
          description: updatedBook.description,
          bookImage: updatedBook.bookImage,
        },
      };

      const result = await booksCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    // all books using search sort
    app.get("/books", async (req, res) => {
      const { status, search, sort } = req.query;

      let query = {};
      if (status) query.status = status;

      if (search) {
        query.bookName = { $regex: search, $options: "i" };
      }

      let sortQuery = {};
      if (sort === "asc") sortQuery.price = 1;
      if (sort === "desc") sortQuery.price = -1;

      const books = await booksCollection.find(query).sort(sortQuery).toArray();

      res.send(books);
    });

    // get latest books
    app.get("/books/latest", async (req, res) => {
      const result = await booksCollection
        .find({ status: "published" })
        .sort({ createdAt: -1 })
        .limit(4)
        .toArray();

      res.send(result);
    });

    app.get("/my-books/:email", async (req, res) => {
      const email = req.params.email;
      console.log(email);
      const query = { librarian: email };
      const result = await booksCollection.find(query).toArray();
      res.send(result);
    });

    // update book status

    app.patch("/update-book-status/:id", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;

      const result = await booksCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: status } }
      );

      res.send(result);
    });

    // order related api
    app.post("/orders", async (req, res) => {
      const order = req.body;
      const result = await ordersCollection.insertOne(order);
      res.send(result);
    });

    // usr order
    app.get("/orders/:email", async (req, res) => {
      const email = req.params.email;
      const query = { customerEmail: email };
      const result = await ordersCollection.find(query).toArray();
      res.send(result);
    });

    // order cancel by user
    app.patch("/orders/cancel/:id", async (req, res) => {
      const id = req.params.id;

      const result = await ordersCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            orderStatus: "cancelled",
          },
        }
      );

      res.send(result);
    });

    // librian order
    app.get("/librarian/orders/:email", async (req, res) => {
      const email = req.params.email;
      const query = { librarianEmail: email };
      const result = await ordersCollection.find(query).toArray();
      res.send(result);
    });

    // librian update status
    app.patch("/librian/update-status/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        // allowed transitions
        const allowedStatus = ["pending", "shipped", "delivered", "cancelled"];

        if (!allowedStatus.includes(status)) {
          return res.status(400).send({ error: "Invalid status" });
        }

        const order = await ordersCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!order) {
          return res.status(404).send({ error: "Order not found" });
        }

        //  once cancelled or delivered, cannot change
        if (
          order.orderStatus === "cancelled" ||
          order.orderStatus === "delivered"
        ) {
          return res.status(400).send({
            error: "This order status can no longer be changed",
          });
        }

        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { orderStatus: status } }
        );

        res.send({ success: true, result });
      } catch (error) {
        res.status(500).send({ error: "Status update failed" });
      }
    });

    // create checkout session
    app.post("/payment-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.price) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amount,
              product_data: {
                name: `Please pay for: ${paymentInfo.bookName}`,
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        metadata: {
          orderId: paymentInfo.orderId,
          bookId: paymentInfo.bookId,
          bookName: paymentInfo.bookName,
          librarianEmail: paymentInfo.librarianEmail,
        },
        customer_email: paymentInfo.customerEmail,
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });
      res.send({ url: session.url });
    });

    // // payemtnt succces
    app.patch("/payment-success", async (req, res) => {
      try {
        const sessionId = req.query.session_id;

        const session = await stripe.checkout.sessions.retrieve(sessionId);
        console.log(session);

        if (session.payment_status !== "paid") {
          return res.status(400).send({ success: false });
        }

        const transactionId = session.payment_intent;
        const orderId = session.metadata.orderId;

        const existingPayment = await paymentCollection.findOne({
          transactionId,
        });

        if (existingPayment) {
          return res.send({
            message: "Payment already recorded",
            transactionId,
          });
        }

        await ordersCollection.updateOne(
          { _id: new ObjectId(orderId) },
          {
            $set: {
              paymentStatus: "paid",
              orderStatus: "pending",
              transactionId,
            },
          }
        );

        const payment = {
          orderId: new ObjectId(orderId),
          bookId: session.metadata.bookId,
          bookName: session.metadata.bookName,
          librarianEmail: session.metadata.librarianEmail,
          customerEmail: session.customer_email,
          amount: session.amount_total / 100,
          currency: session.currency,
          transactionId,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
        };

        const result = await paymentCollection.insertOne(payment);

        res.send({
          success: true,
          transactionId,
          paymentId: result.insertedId,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Payment success handling failed" });
      }
    });

    // for invoices
    app.get("/payments/:email", async (req, res) => {
      const email = req.params.email;
      const query = { customerEmail: email };
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
