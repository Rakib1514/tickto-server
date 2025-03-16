const express = require("express");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");

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

    // ! Users Related API's

    app.get("/api/users", async (req, res) => {
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
          return res.status(400).json({success: false, message: "User data is required" });
        }

        const result = await userCollection.updateOne(
          { uid: uid },
          { $set: updatedUser }
        );

        console.log(result);

        if (result.modifiedCount > 0) {
          res.status(200).json({ success: true, message: "User updated successfully" });
        } else if(result.matchedCount > 0 && result.modifiedCount === 0) {
          res.status(200).json({ success: false, message: "Already up to date" });
        } else {
          res.status(500).json({ success: false, message: "Failed to update user" });
        }
      } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({success: false, message: "Internal server error" });
      }
    });

    // Delete user by uid
    app.delete("/api/users/:uid", async (req, res) => {
      try {
        const uid = req.params.uid;
        const result = await userCollection.deleteOne({ uid: uid });

        console.log(result);

        if (result.deletedCount > 0) {
          res.json({ success: true, message: "User deleted successfully" });
        } else {
          res.status(500).json({ error: "Failed to delete user" });
        }
      } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).json({ error: "Internal server error" });
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
