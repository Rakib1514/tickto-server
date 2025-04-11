const express = require("express");
require("dotenv").config();
const cors = require("cors");
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId, Admin } = require("mongodb");

const app = express();

const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;

// Create a MongoClient
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const userCollection = client.db("tickto").collection("users");
    const eventsCollection = client.db("tickto").collection("events");

    //!jwt related API's

    app.post('/jwt', async(req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.TOKEN_SECRET_KEY,
        {expiresIn: '1h'});
      res.send({ token });
    });

    //middlewares 
    const verifyToken = (req, res, next) => {
      console.log('Inside verify token', req.headers.authorization);
      if(!req.headers.authorization){
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.TOKEN_SECRET_KEY, (err, decoded) => {
        if(err){
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
      })
      // next();
    }

    // ! Users Related API's

    app.get("/api/users", verifyToken, async (req, res) => {
      console.log(req.headers);
      try {
        const users = await userCollection.find({}).toArray();
        if (users.length > 0) {
          res.status(200).json({
            success: true,
            data: users,
            message: "Users fetched successfully",
          });
        } else {
          res.status(404).json({ success: false, message: "No users found" });
        }
      } catch (error) {
        console.error("Error fetching users:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // get user by uid
    app.get("/api/users/:uid", async (req, res) => {
      try {
        const uid = req.params.uid;
        const user = await userCollection.findOne({ uid: uid });
        if (!user) {
          return res
            .status(404)
            .json({ success: false, message: "User not found" });
        }
        res.status(200).json({
          success: true,
          data: user,
          message: "User fetched successfully",
        });
      } catch (error) {
        console.error("Error fetching user:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    app.get('/api/users/admin/:email', verifyToken, async(req, res) => {
      const email = req.params.email;
      if(email !== req.decoded.email){
        return res.status(403).send({ message: "forbidden access" })
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if(user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    })

    // Post User data to DB
    app.post("/api/users", async (req, res) => {
      try {
        const newUser = req.body;

        if (!newUser || Object.keys(newUser).length === 0) {
          return res
            .status(400)
            .json({ success: false, message: "User data is required" });
        }

        const result = await userCollection.insertOne(newUser);

        console.log(result);

        if (result.insertedId) {
          res.status(201).json({
            success: true,
            insertedId: result.insertedId,
            message: "User created successfully",
          });
        } else {
          res
            .status(500)
            .json({ success: false, message: "Failed to create user" });
        }
      } catch (error) {
        console.error("Error creating user:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // Update user by uid
    app.put("/api/users/:uid", async (req, res) => {
      try {
        const uid = req.params.uid;
        const updatedUser = req.body;

        if (!updatedUser || Object.keys(updatedUser).length === 0) {
          return res
            .status(400)
            .json({ success: false, message: "User data is required" });
        }

        const result = await userCollection.updateOne(
          { uid: uid },
          { $set: updatedUser }
        );

        console.log(result);

        if (result.modifiedCount > 0) {
          res
            .status(200)
            .json({ success: true, message: "User updated successfully" });
        } else if (result.matchedCount > 0 && result.modifiedCount === 0) {
          res
            .status(200)
            .json({ success: false, message: "Already up to date" });
        } else {
          res
            .status(500)
            .json({ success: false, message: "Failed to update user" });
        }
      } catch (error) {
        console.error("Error updating user:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // Make admin user by uid
    app.patch('/api/users/admin/:uid', async(req, res) => {
      const id = req.params.uid;
      const filter = { _id: new ObjectId(id) };
      const updateUser = {
        $set: {
          role: 'admin'
        }
      }
      const result = await userCollection.updateOne(filter, updateUser);
      res.send(result)
    })


    // Delete user by uid
    app.delete("/api/users/:uid", async (req, res) => {
      try {
        const uid = req.params.uid;
        const result = await userCollection.deleteOne({ _id: new ObjectId(uid) });

        if (result.deletedCount > 0) {
          res.json({ success: true, message: "User deleted successfully" });
        } else {
          res.status(404).json({ success: false, message: "User not found" });
        }
      } catch (error) {
        console.error("Error deleting user:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // ! Events Related API's

    // get events :: Custom Projection
    app.get("/api/events", async (req, res) => {
      try {
        const events = await eventsCollection
          .aggregate([
            {
              $group: {
                _id: { category: "$category", subCategory: "$subCategory" },
                data: { $push: "$$ROOT" },
              },
            },
            {
              $project: {
                _id: 0,
                category: "$_id.category",
                subCategory: "$_id.subCategory",
                data: 1,
                dataCount: { $size: "$data" },
              },
            },
            {
              $sort: { dataCount: -1 },
            },
          ])
          .toArray();
        if (events.length > 0) {
          res.status(200).json({
            success: true,
            data: events,
            message: "Events fetched successfully",
          });
        } else {
          res.status(404).json({ success: false, message: "No events found" });
        }
      } catch (error) {
        console.error("Error fetching events:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // get Category wise events
    app.get("/api/events/:category", async (req, res) => {
      try {
        const category = req.params.category;
        const events = await eventsCollection
          .find({ subCategory: category })
          .toArray();
        if (events.length > 0) {
          res.status(200).json({
            success: true,
            data: events,
            message: "Events fetched successfully",
          });
        } else {
          res
            .status(404)
            .json({ success: false, message: "No events found for category" });
        }
      } catch (error) {
        console.error("Error fetching events:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // Get single event by id
    app.get("/api/event/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const event = await eventsCollection.findOne({ _id: new ObjectId(id) });
        if (!event) {
          return res
            .status(404)
            .json({ success: false, message: "Event not found" });
        } else {
          res.status(200).json({
            success: true,
            data: event,
            message: "Event fetched successfully",
          });
        }
      } catch (error) {
        console.error("Error fetching event:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    //Post a event
    app.post("/api/events", async (req, res) => {
      try {
        const newEvent = req.body;

        if (!newEvent || Object.keys(newEvent).length === 0) {
          return res
            .status(400)
            .json({ success: false, message: "Event data is required" });
        }

        const result = await eventsCollection.insertOne(newEvent);

        if (result.insertedId) {
          res.status(201).json({
            success: true,
            insertedId: result.insertedId,
            message: "Event created successfully",
          });
        } else {
          res
            .status(500)
            .json({ success: false, message: "Failed to create event" });
        }
      } catch (error) {
        console.error("Error creating event:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // custom events data category wise get
    // ! get all category
    app.get("/api/categories", async (req, res) => {
      try {
        const categories = await eventsCollection
          .aggregate([
            {
              $group: {
                _id: "$subCategory",
                count: { $sum: 1 }, // Add count of documents per category
              },
            },
            {
              $sort: { count: -1 }, // Sort descending by count
            },
            {
              $project: {
                _id: 0,
                subCategory: "$_id",
                // count: 1 // Optional: include count if needed
              },
            },
          ])
          .toArray();

        if (categories.length > 0) {
          res.status(200).json({
            success: true,
            data: categories,
            message: "Categories fetched successfully",
          });
        } else {
          res
            .status(404)
            .json({ success: false, message: "No categories found" });
        }
      } catch (error) {
        console.error("Error fetching categories:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    //
    //
  } finally {
    //
  }
}

run().catch(console.dir);

app.get("/", async (req, res) => {
  res.send("Tickto Server is Running");
});

app.listen(port, () => {
  console.log(`Running on port ${port}`);
});
