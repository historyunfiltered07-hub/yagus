const express = require('express');
const { OpenAI } = require('openai');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(cors());

// Groq API Setup
const openai = new OpenAI({ 
    apiKey: process.env.GROQ_API_KEY, 
    baseURL: "https://api.groq.com/openai/v1" 
});

// 👇 EXISTING CHAT ENDPOINT 👇
app.post('/chat', async (req, res) => {
    try {
        const { message } = req.body;
        const response = await openai.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [
                { role: "system", content: "You are the friendly AI assistant for The Furry Nest. Help customers with pet advice." },
                { role: "user", content: message }
            ],
        });
        res.json({ reply: response.choices[0].message.content });
    } catch (error) {
        console.error("AI Error:", error);
        res.status(500).json({ reply: "AI is napping. Try again later." });
    }
});

// 👇 EXISTING SUPER BRAIN UI ENDPOINT 👇
app.post('/voice-health', async (req, res) => {
    try {
        const { symptoms } = req.body;
        const superBrainPrompt = `You are a vet assistant. Create a detailed HTML report for symptoms: "${symptoms}".
        RULES:
        1. "⚠️ Consult your Vet" warning in red.
        2. Detailed causes and remedies.
        3. STYLE: style="font-family: 'Bagel Fat One', cursive; border: 3px solid #AE918B; padding: 25px; border-radius: 15px; background-color: #fffaf9;"
        4. BUTTONS: style="background-color: #AE918B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;"
        5. Return ONLY raw HTML.`;

        const response = await openai.chat.completions.create({
            model: "llama-3.1-8b-instant", 
            messages: [{ role: "user", content: superBrainPrompt }],
        });
        res.json({ html: response.choices[0].message.content });
    } catch (error) {
        res.status(500).json({ html: "<p>Error generating report.</p>" });
    }
});

// 👇 NEW: DUAL UPLOAD TRY-ON ENDPOINT 👇
// We use upload.fields to accept two specific files
app.post('/try-on', upload.fields([{ name: 'pet_image' }, { name: 'cloth_image' }]), async (req, res) => {
  try {
    // 1. Check if both files exist
    if (!req.files['pet_image'] || !req.files['cloth_image']) {
        return res.status(400).send("Please upload both a pet photo and a clothing photo.");
    }

    const petPath = req.files['pet_image'][0].path;
    const clothPath = req.files['cloth_image'][0].path;

    // 2. Prepare Pet Image for AI (to find the neck)
    const imageBuffer = fs.readFileSync(petPath);
    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64Image}`;

    // 3. Ask AI for coordinates
    const chatCompletion = await openai.chat.completions.create({
      model: "llama-3.2-11b-vision-preview", 
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Locate the center of the dog/cat's neck/chest area. Return ONLY a JSON object with keys: x (number), y (number), and width (number, representing the neck width). Do not write any other text." },
            { type: "image_url", image_url: { url: dataUrl } }
          ],
        },
      ],
      response_format: { type: "json_object" }
    });

    const visionData = JSON.parse(chatCompletion.choices[0].message.content);
    const { x, y, width } = visionData;

    // 4. Process Images with Sharp
    const petMeta = await sharp(petPath).metadata();
    
    // Calculate resize width for the cloth
    // If AI fails to give width, default to 40% of pet image width
    const targetWidth = width ? parseInt(width * 1.5) : Math.round(petMeta.width * 0.4);

    // Resize the uploaded cloth image
    const resizedCloth = await sharp(clothPath)
      .resize({ width: targetWidth })
      .toBuffer();

    const clothMeta = await sharp(resizedCloth).metadata();

    // Calculate position (Center cloth on the neck coordinates)
    const left = Math.round(x - (clothMeta.width / 2));
    const top = Math.round(y - (clothMeta.height / 2)); // Adjust this if you want it lower/higher

    // Composite
    const finalImage = await sharp(petPath)
      .composite([{ input: resizedCloth, left: left, top: top }])
      .toBuffer();

    // 5. Cleanup & Send
    fs.unlinkSync(petPath);
    fs.unlinkSync(clothPath);
    
    res.set('Content-Type', 'image/png');
    res.send(finalImage);

  } catch (error) {
    console.error("Try-On Error:", error);
    // Cleanup files if they exist
    if (req.files['pet_image']) fs.unlinkSync(req.files['pet_image'][0].path);
    if (req.files['cloth_image']) fs.unlinkSync(req.files['cloth_image'][0].path);
    res.status(500).send({ error: "Failed to process image" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
