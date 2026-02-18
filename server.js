const express = require('express');
const { OpenAI } = require('openai');
const cors = require('cors');
const multer = require('multer'); // Handles image uploads
const sharp = require('sharp');   // Handles image editing
const axios = require('axios');   // Downloads images
const fs = require('fs');         // Reads files
const path = require('path');

const app = express();
// Configure Multer to save uploaded files temporarily
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(cors()); // Allows your Shopify store to talk to this server

// Pointing the OpenAI library to Groq's servers
const openai = new OpenAI({ 
    apiKey: process.env.GROQ_API_KEY, 
    baseURL: "https://api.groq.com/openai/v1" 
});

// 👇 YOUR EXISTING CHAT ENDPOINT (Unchanged) 👇
app.post('/chat', async (req, res) => {
    try {
        const { message } = req.body;
        
        const response = await openai.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [
                { 
                    role: "system", 
                    content: "You are the friendly AI assistant for The Furry Nest pet store. Use dog and cat emojis. Help customers with pet advice and recommend our products. Keep answers short and helpful. If it's a serious medical issue, advise them to see a vet." 
                },
                { role: "user", content: message }
            ],
        });
        
        res.json({ reply: response.choices[0].message.content });
    } catch (error) {
        console.error("AI Error:", error);
        res.status(500).json({ reply: "Oops! Our AI is taking a nap. Try again later." });
    }
});

// 👇 YOUR EXISTING GENERATIVE UI ENDPOINT (Styles Preserved!) 👇
app.post('/voice-health', async (req, res) => {
    try {
        const { symptoms } = req.body;
        
        const superBrainPrompt = `You are a virtual vet assistant and expert web developer for TheFurrynest.store. 
        A user just reported these symptoms for their pet: "${symptoms}".
        Generate a comprehensive, highly detailed UI component in raw HTML. 
        
        RULES:
        1. Start with a strict "⚠️ Consult your Vet" warning formatted in red.
        2. Provide a long, detailed overview of the possible causes for these symptoms. Write at least two full paragraphs.
        3. List the top remedies and medicines found across the web for this issue, explaining *why* they work in deep detail.
        4. You MUST include actual HTML clickable buttons for these specific medicines linking to Amazon or Chewy search links.
        
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
        console.error("Generative UI Error:", error);
        res.status(500).json({ html: "<p style='color:red;'>Brain freeze! The AI needs a nap. Check your server logs.</p>" });
    }
});

// 👇 NEW: VIRTUAL TRY-ON ENDPOINT 👇
app.post('/try-on', upload.single('pet_image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send("No image uploaded.");
    
    const petImagePath = req.file.path;
    const productImageUrl = req.body.product_image_url;

    // 1. Prepare Image for Groq Vision
    const imageBuffer = fs.readFileSync(petImagePath);
    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64Image}`;

    // 2. Ask Groq (Llama 3.2 Vision) for coordinates
    // We ask it to find the neck to place a collar/bandana
    const chatCompletion = await openai.chat.completions.create({
      model: "llama-3.2-11b-vision-preview", 
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Locate the center of the dog's neck in this image. Return ONLY a JSON object with keys: x (number), y (number), and width (number, representing the approximate width of the neck). Do not write any other text." },
            { type: "image_url", image_url: { url: dataUrl } }
          ],
        },
      ],
      response_format: { type: "json_object" }
    });

    const visionData = JSON.parse(chatCompletion.choices[0].message.content);
    const { x, y, width } = visionData;

    // 3. Download the Product Image (from Shopify)
    const productResponse = await axios.get(productImageUrl, { responseType: 'arraybuffer' });
    let productBuffer = Buffer.from(productResponse.data, 'binary');

    // 4. Process Images with Sharp
    // Get pet image metadata to calculate relative sizing
    const metadata = await sharp(petImagePath).metadata();
    
    // Safety check: If AI fails to give width, guess 30% of image width
    const targetWidth = width || Math.round(metadata.width * 0.3);
    
    // Resize product to fit the neck
    const resizedProduct = await sharp(productBuffer)
      .resize({ width: parseInt(targetWidth) })
      .toBuffer();

    const productMeta = await sharp(resizedProduct).metadata();

    // Calculate centering logic
    // We want the center of the product to be at the (x,y) the AI found
    const left = Math.round(x - (productMeta.width / 2));
    const top = Math.round(y - (productMeta.height / 2));

    // Composite (Paste) the product on top
    const finalImage = await sharp(petImagePath)
      .composite([{ input: resizedProduct, left: left, top: top }])
      .toBuffer();

    // 5. Clean up and Send back
    fs.unlinkSync(petImagePath); // Delete the temp file
    res.set('Content-Type', 'image/png');
    res.send(finalImage);

  } catch (error) {
    console.error("Try-On Error:", error);
    // If temp file exists, delete it
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).send({ error: "Failed to process image" });
  }
});

// Render assigns a dynamic port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
