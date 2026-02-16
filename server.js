const express = require('express');
const { OpenAI } = require('openai');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors()); // Allows your Shopify store to talk to this server

// Pointing the OpenAI library to Groq's free servers
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

// 👇 YOUR UPDATED GENERATIVE UI ENDPOINT (With fixed fonts and colors!) 👇
app.post('/voice-health', async (req, res) => {
    try {
        const { symptoms } = req.body;
        
        // The upgraded Super Brain prompt with strict brand styling rules!
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
        
        // Send the newly built HTML page back to Shopify
        res.json({ html: response.choices[0].message.content });
    } catch (error) {
        console.error("Generative UI Error:", error);
        res.status(500).json({ html: "<p style='color:red;'>Brain freeze! The AI needs a nap. Check your server logs.</p>" });
    }
});

// Render assigns a dynamic port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
