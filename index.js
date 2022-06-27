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
    
})

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
    } catch {
        res.sendStatus(422);
        client.close();
    }
})

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
        const participants = db.collection("participants");
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
})

server.post("/messages", async (req, res) => {
    const { user: from } = req.headers;
    const message = {...req.body, from: from, time: `${dayjs().hour()}:${dayjs().minute()}:${dayjs().second()}`};
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
})

server.listen(process.env.PORTA);