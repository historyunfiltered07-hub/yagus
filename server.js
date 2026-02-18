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

// 👇 UPDATED HEALTH ASSISTANT (Fixed Links for India) 👇
app.post('/voice-health', async (req, res) => {
    try {
        const { symptoms } = req.body;
        
        // 🔴 FIX: I changed the prompt to force Amazon.in and Flipkart search links
        const superBrainPrompt = `You are a virtual vet assistant and expert web developer for TheFurrynest.store. 
        A user just reported these symptoms for their pet: "${symptoms}".
        Generate a comprehensive, highly detailed UI component in raw HTML. 
        
        RULES:
        1. Start with a strict "⚠️ Consult your Vet" warning formatted in red.
        2. Provide a long, detailed overview of the possible causes for these symptoms. Write at least two full paragraphs.
        3. List the top remedies and medicines found across the web for this issue.
        
        4. LINKING RULE (CRITICAL):
           - You MUST create buttons for the recommended remedies.
           - The buttons MUST link to a SEARCH PAGE on Amazon India or Flipkart.
           - Format: <a href="https://www.amazon.in/s?k=YOUR_REMEDY_KEYWORD" target="_blank">Buy on Amazon</a>
           - Format: <a href="https://www.flipkart.com/search?q=YOUR_REMEDY_KEYWORD" target="_blank">Buy on Flipkart</a>
           - NEVER generate direct product links (they break). ALWAYS use search links.
        
        CRITICAL STYLING RULES:
        5. Wrap the ENTIRE generated output inside a main container div with this style: style="font-family: 'Bagel Fat One', cursive, sans-serif; border: 3px solid #AE918B; padding: 25px; border-radius: 15px; background-color: #fffaf9;"
        6. Use color #AE918B for all headings (h2, h3).
        7. Style ALL product link buttons with this exact style so they are NOT green: style="background-color: #AE918B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-size: 18px; display: inline-block; margin: 10px 5px;"

        8. Return ONLY raw HTML code. Do NOT wrap it in markdown blocks like \`\`\`html.`;

        const response = await openai.chat.completions.create({
            model: "llama-3.1-8b-instant", 
            messages: [
                { role: "system", content: "You are an AI that only outputs raw, valid HTML code following strict CSS rules." },
                { role: "user", content: superBrainPrompt }
            ],
        });
        
        res.json({ html: response.choices[0].message.content });
    } catch (error) {
        console.error("Health AI Error:", error);
        res.status(500).json({ html: "<p style='color:red;'>Brain freeze! The AI needs a nap. Check your server logs.</p>" });
    }
});

// 👇 ROBUST TRY-ON ENDPOINT (With Resize & Fallback) 👇
app.post('/try-on', upload.fields([{ name: 'pet_image' }, { name: 'cloth_image' }]), async (req, res) => {
  console.log("Try-on request started...");

  // cleanup helper
  const cleanup = () => {
    if (req.files?.['pet_image']) fs.unlinkSync(req.files['pet_image'][0].path);
    if (req.files?.['cloth_image']) fs.unlinkSync(req.files['cloth_image'][0].path);
  };

  try {
    if (!req.files || !req.files['pet_image'] || !req.files['cloth_image']) {
        return res.status(400).send("Both images are required.");
    }

    const petPath = req.files['pet_image'][0].path;
    const clothPath = req.files['cloth_image'][0].path;

    // 1. Shrink Image for AI (Groq can't handle huge 4MB iphone photos)
    const smallBuffer = await sharp(petPath)
        .resize({ width: 500 }) // Resize to 500px width max
        .jpeg({ quality: 70 })
        .toBuffer();
    
    const base64Image = smallBuffer.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64Image}`;

    // 2. Default Coordinates (Center) - The "Fallback"
    const metadata = await sharp(petPath).metadata();
    let x = Math.round(metadata.width / 2);
    let y = Math.round(metadata.height / 2);

    // 3. Try to ask AI (Vision)
    try {
        console.log("Asking Llama Vision...");
        const chatCompletion = await openai.chat.completions.create({
          model: "llama-3.2-11b-vision-preview", 
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Locate the center of the animal's neck. Return ONLY JSON: {\"x\": number, \"y\": number}. Coordinates must be relative to a 500px wide image." },
                { type: "image_url", image_url: { url: dataUrl } }
              ],
            },
          ],
          max_tokens: 50,
          response_format: { type: "json_object" }
        });

        const rawContent = chatCompletion.choices[0].message.content;
        const visionData = JSON.parse(rawContent);

        // Scale coordinates back up to full size
        const scaleFactor = metadata.width / 500;
        
        if (visionData.x && visionData.y) {
            x = Math.round(visionData.x * scaleFactor);
            y = Math.round(visionData.y * scaleFactor);
            console.log(`AI found neck at: ${x}, ${y}`);
        }

    } catch (aiError) {
        console.error("⚠️ AI Vision Failed (Using Center Fallback):", aiError.message);
    }

    // 4. Process Final Image
    const targetWidth = Math.round(metadata.width * 0.5); // Make cloth 50% of pet width

    const resizedCloth = await sharp(clothPath)
      .resize({ width: targetWidth })
      .toBuffer();

    const clothMeta = await sharp(resizedCloth).metadata();

    const left = Math.round(x - (clothMeta.width / 2));
    const top = Math.round(y - (clothMeta.height / 2));

    const finalImage = await sharp(petPath)
      .composite([{ input: resizedCloth, left: left, top: top }])
      .toBuffer();

    // 5. Send back
    cleanup();
    res.set('Content-Type', 'image/png');
    res.send(finalImage);

  } catch (error) {
    console.error("CRITICAL SERVER ERROR:", error);
    cleanup();
    res.status(500).send({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
