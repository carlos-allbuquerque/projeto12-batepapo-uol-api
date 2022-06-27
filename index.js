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

const server = express();

server.use(cors());
server.use(express.json());

server.get("/participantes", async (req, res) => {
    try {
        await client.connect();
        const db = client.db("app");
        const participants = db.collection("uolCollection");

        const participantsArray = await participants.find({}).toArray();
        res.send(participantsArray);
    } catch (error){
        res.status(500).send(error);
    }
    
})

server.post("/participantes", async (req, res) => {
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
            return;
        } 
        await participants.insertOne(participant);
        await messages.insertOne(message);
        res.sendStatus(201)
    } catch {
        res.sendStatus(422)
        client.close()
    }
})

server.listen(process.env.PORTA);