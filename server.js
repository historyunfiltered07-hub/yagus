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

app.post('/chat', async (req, res) => {
    try {
        const { message } = req.body;
        
        const response = await openai.chat.completions.create({
            model: "llama3-8b-8192", // Groq's super fast, free model
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

// Render assigns a dynamic port, so this line is crucial
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
