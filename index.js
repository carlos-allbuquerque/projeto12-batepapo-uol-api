import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import joi from "joi";
import dayjs from "dayjs";

dotenv.config();

const client = new MongoClient(process.env.MONGO_CONNECT);
let db;

const participantSchema = joi.object({ 
    name: joi.string().empty().required(),
    lastStatus: joi.number().required()
})

const messageSchema = joi.object({
    to: joi.string().empty().required(),
    text: joi.string().empty().required(),
    type: joi.string().equal("private_message", "message").required(),
    from: joi.string().empty().required(),
    time: joi.string()
})

const server = express(); 

server.use(cors());
server.use(express.json());


server.get("/participants", async (req, res) => {
    try {
        await client.connect();
        const db = client.db("app");
        const participants = db.collection("participants");
        const participantsArray = await participants.find({}).toArray();
        res.send(participantsArray);
    } catch (error){
        res.status(500).send(error);
        client.close();
    }
    
});

server.post("/participants", async (req, res) => {
    const {name} = req.body;
    const participant = {name, lastStatus: Date.now()};
    const validation =  participantSchema.validate(participant, { abortEarly: false});
    const { error } = validation;
    if (error) {
        const messages = error.details.map(item => item.message);
        res.status(402).send(messages);
        return;
    }
    try {
        await client.connect();
        const db = client.db("app");
        const participants = db.collection("participants");
        const messages = db.collection("messages");

        const message = {from: name,
            to: 'Todos',
            text: 'entra na sala...',
            type: 'status', 
            time: `${dayjs().hour()}:${dayjs().minute()}:${dayjs().second()}`
        }
        const alreadyExists = await participants.findOne({ name: name }) 
        if (alreadyExists) {
            res.sendStatus(409);
        } 
        await participants.insertOne(participant);
        await messages.insertOne(message);
        res.sendStatus(201);
        return;
    } catch {
        res.sendStatus(422);
    }
});

server.get("/messages", async (req, res) => {
    let { limit } = req.query;
    limit = parseInt(limit)
    const { user: from }  = req.headers;

    function filterMessage(message, participantName) {
        const {from, to, type} = message;

        const related = 
            from === participantName || to === participantName || to === "Todos";

        return related;
    }
    try {
        await client.connect();
        const db = client.db("app");
        const messages = db.collection("messages");

        let messagesArray = await messages.find({}).toArray();

        messagesArray = messagesArray.filter((message) => 
            filterMessage(message, from)
        );

        if (limit && limit !== NaN) return res.send(messagesArray.slice(-limit));

        res.send(messagesArray);
    } catch (error) {
        console.log(error);
        res.sendStatus(500);
    }
});

server.post("/messages", async (req, res) => {
    const { user: from } = req.headers;
    const message = {
        ...req.body,
        from: from,
        time: `${dayjs().hour()}:${dayjs().minute()}:${dayjs().second()}`};

    const validation =  messageSchema.validate(message, { abortEarly: false});
    const { error } = validation;
    if (error) {
        const messages = error.details.map(item => item.message);
        res.status(422).send(messages);
        return;
    }
    try {
        await client.connect();
        const db = client.db("app");
        const participants = db.collection("participants");
        const messages = db.collection("messages");

        const participantExists = await participants.findOne({name: from});
        if (!participantExists) {
            res.sendStatus(404);
            return;
        }
        await messages.insertOne(message);

        res.sendStatus(201); 
    } catch (error) {
        res.status(500).send(error);
    }
});

server.post("/status", async(req, res) => {
    const { user } = req.headers;

    try {
        await client.connect();
        const db = client.db("app");
        const participants = db.collection("participants");

        const participantExists = await participants.findOne({ name: user })
        if (!participantExists) return res.sendStatus(404);

        await participants.updateOne(
            { name: user },
            { $set: { lastStatus: Date.now() } }
        );

        res.sendStatus(200);
    } catch (error) {
        res.status(500).send(error);
    }
});

setInterval(async () => {
    try {
        await client.connect();
        const db = client.db("app");
        const participants = db.collection("participants");
        const messages = db.collection("messages");

        const disconnectionTime = Date.now() - 10000;
        const inactiveParticipants =  
            await participants.find({lastStatus : { $lt: disconnectionTime }}).toArray();

        inactiveParticipants.forEach(async ({ name }) => {
            const time = dayjs(Date.now()).format("HH:mm:ss");
            await messages.insertOne({
                from: name,
                to: "Todos",
                text: "sai da sala...",
                type: "status",
                time,
            });
            await participants.deleteOne({ name });
        });
    } catch (error) {
        res.status(500).send(error);
    }
}, 15000);

server.listen(process.env.PORTA);