const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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

    app.get("/books", async (req, res) => {
      const result = await booksCollection.find().toArray();
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
