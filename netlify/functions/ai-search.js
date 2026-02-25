const axios = require('axios');

exports.handler = async (event, context) => {
    // Only allow POST
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const { query, history, researchMode } = JSON.parse(event.body);

        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

        if (!OPENAI_API_KEY) {
            throw new Error("API Key configuration missing on server.");
        }

        const systemPrompt = researchMode
            ? "You are Clario AI, a deep research assistant. Provide a structured, long-form, academic detailed answer with sections, technical insights, and references if applicable. Use Markdown formatting."
            : "You are Clario AI, a fast search assistant. Provide a concise, clear, and helpful summary of the topic. Use bold text for key terms and bullet points for lists. Use Markdown formatting.";

        const messages = [
            { role: "system", content: systemPrompt },
            ...history.map(h => ({ role: h.role, content: h.content })),
            { role: "user", content: query }
        ];

        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-3.5-turbo", // or gpt-4o-mini
            messages: messages,
            temperature: 0.7,
            max_tokens: researchMode ? 1000 : 400
        }, {
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const answer = response.data.choices[0].message.content;

        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ answer })
        };

    } catch (error) {
        console.error("AI Search Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Clario AI is temporarily unavailable." })
        };
    }
};
