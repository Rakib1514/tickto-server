const express = require("express");
require("dotenv").config();
const cors = require("cors");

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const jwt = require("jsonwebtoken");
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
    const paymentsCollection = client.db("tickto").collection("payments");
    const busCollection = client.db("tickto").collection("bus");
    const tripCollection = client.db("tickto").collection("trips");

    //!jwt related API's

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.TOKEN_SECRET_KEY, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    //middlewares
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.TOKEN_SECRET_KEY, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    //use verify admin after verifyToken

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // ! Users Related API's

    app.get("/api/users", verifyToken, verifyAdmin, async (req, res) => {
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

    app.get("/api/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
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
    app.patch(
      "/api/users/admin/:uid",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.uid;
        const filter = { _id: new ObjectId(id) };
        const updateUser = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, updateUser);
        res.send(result);
      }
    );

    // Delete user by uid
    app.delete(
      "/api/users/:uid",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const uid = req.params.uid;
          const result = await userCollection.deleteOne({
            _id: new ObjectId(uid),
          });

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
      }
    );

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

    // ! Bus Related api

    app.post("/api/buses", async (req, res) => {
      const busInfo = req.body;
      const result = await busCollection.insertOne(busInfo);
      res.send(result);
    });

    app.get("/api/buses/:uid", async (req, res) => {
      const uid = req.params.uid;
      const query = { organizerID: uid };
      const buses = await busCollection.find(query).toArray();
      res.send(buses);
    });

    // ! Trip Related apis

    app.post("/api/trips", async (req, res) => {
      const tripInfo = req.body;
      const result = await tripCollection.insertOne(tripInfo);
      res.send(result);
    });

    //! get user and status wise trips
    app.get("/api/trips", async (req, res) => {
      const { userId, status } = req.query;

      const query = {};

      if (userId) {
        query.organizerUid = userId;
      }

      if (status) {
        query.status = status;
      }

      const trips = await tripCollection.find(query).toArray();
      res.send(trips);
    });

    // update trip data by id. if only status is upcoming then update
    app.patch("/api/trips/:id", async (req, res) => {
      const id = req.params.id;
      const updatedTrip = req.body;

      if (!updatedTrip || Object.keys(updatedTrip).length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "Trip data is required" });
      }

      const result = await tripCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedTrip }
      );

      if (result.modifiedCount > 0) {
        res
          .status(200)
          .json({ success: true, message: "Trip updated successfully" });
      } else if (result.matchedCount > 0 && result.modifiedCount === 0) {
        res.status(200).json({ success: false, message: "Already up to date" });
      } else {
        res
          .status(500)
          .json({ success: false, message: "Failed to update trip" });
      }
    });
    
    // ! Transport related api

    app.get("/api/trips/bus", async (req, res) => {
      try {
        const { origin, destination, departure } = req.query;
        const now = new Date();

        // 1) BULK‐UPDATE statuses before we read anything:
        //    a) active  = departure ≤ now ≤ arrival
        await tripCollection.updateMany(
          {
            $expr: {
              $and: [
                { $lte: [{ $toDate: "$departureTime" }, now] },
                { $gte: [{ $toDate: "$arrivalTime" }, now] },
              ],
            },
          },
          { $set: { status: "active" } }
        );
        //    b) completed = arrival < now
        await tripCollection.updateMany(
          {
            $expr: { $lt: [{ $toDate: "$arrivalTime" }, now] },
          },
          { $set: { status: "completed" } }
        );
        //    c) upcoming = departure > now
        await tripCollection.updateMany(
          {
            $expr: { $gt: [{ $toDate: "$departureTime" }, now] },
          },
          { $set: { status: "upcoming" } }
        );

        // 2) Build your aggregation, only reading upcoming trips
        const pipeline = [
          // always start by only pulling upcoming
          { $match: { status: "upcoming" } },
        ];

        // 3) Optional origin / destination filters (case-insensitive)
        const match = {};
        if (origin) {
          match.origin = { $regex: new RegExp(`^${origin.trim()}$`, "i") };
        }
        if (destination) {
          match.destination = {
            $regex: new RegExp(`^${destination.trim()}$`, "i"),
          };
        }
        if (Object.keys(match).length) pipeline.push({ $match: match });

        // 4) Optional date-only departure filter
        if (departure) {
          const dateOnly = departure.slice(0, 10); // "YYYY-MM-DD"
          pipeline.push({
            $match: {
              $expr: {
                $eq: [
                  {
                    $dateToString: {
                      format: "%Y-%m-%d",
                      date: { $toDate: "$departureTime" },
                      timezone: "UTC",
                    },
                  },
                  dateOnly,
                ],
              },
            },
          });
        }

        // 5) Lookup busDetails & sort
        pipeline.push(
          { $addFields: { busObjectId: { $toObjectId: "$busId" } } },
          {
            $lookup: {
              from: "bus",
              localField: "busObjectId",
              foreignField: "_id",
              as: "busDetails",
            },
          },
          { $unwind: "$busDetails" },
          { $sort: { departureTime: 1 } }
        );

        // 6) Run and respond
        const trips = await tripCollection.aggregate(pipeline).toArray();
        res.send(trips);
      } catch (err) {
        console.error("Aggregation error:", err);
        res.status(500).send({
          message: "Failed to fetch trips with buses",
          error: err.message,
        });
      }
    });

    // ! Trip Search

    app.get("/api/location", async (req, res) => {
      const { from, to } = req.query;

      // Validate parameters
      if (!from && !to) {
        return res.status(400).send({
          error: "Please provide either 'from' or 'to' parameter",
        });
      }

      if (from && to) {
        return res.status(400).send({
          error: "Please provide only one parameter ('from' or 'to')",
        });
      }

      // Determine search type and get search text
      const searchType = from ? "from" : "to";
      const searchText = from || to;
      const field = searchType === "from" ? "origin" : "destination";

      // Input validation
      if (!searchText || searchText.trim().length < 2) {
        return res.status(400).send({
          error: `Please provide at least 2 characters for ${searchType}`,
        });
      }

      // Sanitize input
      const sanitizedSearch = searchText.replace(/[^\w\s]/gi, "");

      try {
        const pipeline = [
          {
            $match: {
              [field]: {
                $regex: `^${sanitizedSearch}`,
                $options: "i",
              },
            },
          },
          {
            $group: {
              _id: `$${field}`, // Group by the field to get unique values
            },
          },
          {
            $project: {
              _id: 0,
              value: "$_id", // Rename _id to value
            },
          },
          { $limit: 10 },
        ];

        const results = await tripCollection.aggregate(pipeline).toArray();

        // Extract just the values from the results
        res.send(results.map((item) => item.value));
      } catch (error) {
        console.error("Database error:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    //

    //payment intent
    app.post('/create-payment-intent', async(req, res) =>{
      const {price} = req.body;
      const amount = parseInt(price * 100);
      console.log('amount test--->',amount);
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'usd',
      payment_method_types: ['card'],
    });

    res.send({
      clientSecret: paymentIntent.client_secret
    })
    });

    //payment related api
    app.post('/payments', async(req, res) =>{
      const payment = req.body;
      const paymentResult = await paymentsCollection.insertOne(payment);

      //carefully delete the event from events collection
      console.log('payment info--->', payment);
      res.send(paymentResult);

    });

    app.get('/payments/:email', async(req, res) =>{
      const query = { email: req.params.email};
      if(req.params.email !== req.params.email){
        return res.status(403).send({ message: 'forbidden access'});
      }
      const result = await paymentsCollection.find(query).toArray();
      res.send(result);
    });

    // All payment get end API
app.get('/payments', async (req, res) => {
  try {
    const payments = await paymentsCollection.find().toArray();
    
    res.status(200).send({
      success: true,
      data: payments,
      message: payments.length > 0 
        ? 'Payments fetched successfully'
        : 'No payments found'
    });

  } catch (error) {
    console.error('Error fetching payments.', error);
    res.status(500).send({
      success: false,
      message: 'Internal server error'
    });
  }
});


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
