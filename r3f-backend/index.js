import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import express from "express";
import OpenAI from "openai";
import { sleep } from "openai/core.mjs";
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "-",
});

const voiceID = "echo";

const app = express();
app.use(express.json());
app.use(cors());
const port = 3002;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve(stdout);
    });
  });
};

const textToSpeech = async (voiceID, fileName, textInput) => {
  try {
    if (!voiceID || !fileName || !textInput) {
      console.log("ERR: Missing parameter");
      return;
    }

    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: voiceID,
      input: textInput,
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.promises.writeFile(fileName, buffer);
    
    console.log(`Audio file saved: ${fileName}`);
    return { status: "ok", fileName: fileName };
  } catch (error) {
    console.error("Error in textToSpeech:", error);
  }
};

const lipSyncMessage = async (message) => {
  const time = new Date().getTime();
  console.log(`Starting conversion for message ${message}`);
  await execCommand(
    `ffmpeg -y -i audios/message_${message}.mp3 audios/message_${message}.wav`
  );
  console.log(`Conversion done in ${new Date().getTime() - time}ms`);
  await execCommand(
    `./bin/rhubarb/rhubarb -f json -o audios/message_${message}.json audios/message_${message}.wav -r phonetic`
  );
  console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
};

app.get("/chat-stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendMessage = (message) => {
    res.write(`data: ${JSON.stringify(message)}\n\n`);
  };

  const userMessage = req.query.message; // Getting the message from query params for SSE
  if (!userMessage) {
    sendMessage({
      text: "Hey dear... How was your day?",
      audio: await audioFileToBase64("audios/intro_0.wav"),
      lipsync: await readJsonTranscript("audios/intro_0.json"),
      facialExpression: "smile",
      animation: "Talking",
    });
    sendMessage({
      text: "I missed you so much... Please don't go for so long!",
      audio: await audioFileToBase64("audios/intro_1.wav"),
      lipsync: await readJsonTranscript("audios/intro_1.json"),
      facialExpression: "sad",
      animation: "Talking",
    });
    return;
  }

  if (openai.apiKey === "-") {
    sendMessage({
      text: "Please my dear, don't forget to add your API keys!",
      audio: await audioFileToBase64("audios/api_0.wav"),
      lipsync: await readJsonTranscript("audios/api_0.json"),
      facialExpression: "angry",
      animation: "Talking",
    });
    sendMessage({
      text: "You don't want to ruin Wawa Sensei with a crazy ChatGPT and ElevenLabs bill, right?",
      audio: await audioFileToBase64("audios/api_1.wav"),
      lipsync: await readJsonTranscript("audios/api_1.json"),
      facialExpression: "smile",
      animation: "Talking",
    });
    return;
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1000,
    temperature: 0.6,
    response_format: {
      type: "json_object",
    },
    messages: [
      {
        role: "system",
        content: `
        You are a virtual girlfriend.
        You will always reply with a JSON array of messages. With a maximum of 3 messages.
        Each message has a text, facialExpression, and animation property.
        The different facial expressions are: smile, sad, angry, and default.
        The different animations are: Breathing and Talking. 
        `,
      },
      {
        role: "user",
        content: userMessage || "Hello",
      },
    ],
  });

  let messages = JSON.parse(completion.choices[0].message.content);
  if (messages.messages) {
    messages = messages.messages; // Handle the potential inconsistency
  }

  // Async function to handle the processing
  (async () => {
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const sentences = message.text.match(/[^.!?]+[.!?]*\s*/g) || []; // Split message into sentences

      for (let j = 0; j < sentences.length; j++) {
        const sentence = sentences[j].trim(); // Get individual sentence
        if (!sentence) continue; // Skip empty sentences

        const fileName = `audios/message_${i}_${j}.mp3`; // Unique filename for each sentence
        await textToSpeech(voiceID, fileName, sentence); // Convert sentence to audio
        await lipSyncMessage(`${i}_${j}`); // Unique index for lip sync

        message.audio = await audioFileToBase64(fileName); // Get audio in base64
        message.lipsync = await readJsonTranscript(`audios/message_${i}_${j}.json`); // Read lip sync

        // Send the message as soon as it is ready
        sendMessage({ ...message, text: sentence }); // Send sentence with audio and lipsync
      }
    }

    // Close the connection after sending all messages
    res.write("event: end\n");
    res.write("data: All messages sent\n\n");
    res.end();
  })();
});

const readJsonTranscript = async (file) => {
  const data = await fs.promises.readFile(file, "utf8");
  return JSON.parse(data);
};

const audioFileToBase64 = async (file) => {
  const data = await fs.promises.readFile(file);
  return data.toString("base64");
};

app.listen(port, () => {
  console.log(`Digital Human listening on port ${port}`);
});
