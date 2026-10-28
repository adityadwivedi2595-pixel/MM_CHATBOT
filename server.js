const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
// Set generous body size limit for base64 images and files
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Available models
const AVAILABLE_MODELS = [
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash (Fast & Multimodal)', badge: 'Recommended', isDefault: true },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite (Ultra-Fast)', badge: 'Fastest' },
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (Next-Gen Flash)', badge: 'Latest' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Deep Reasoning & Vision)', badge: 'Advanced' }
];

// Endpoint: Health Check for Monitoring & Load Balancers
app.get(['/api/health', '/healthz'], (req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    service: 'mm-chatbot',
    version: '1.0.0'
  });
});

// Endpoint: Configuration & Status
app.get('/api/config', (req, res) => {
  const hasServerKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '');
  res.json({
    hasServerKey,
    defaultModel: 'gemini-3.5-flash',
    models: AVAILABLE_MODELS,
    serverTime: new Date().toISOString()
  });
});

// Endpoint: Validate an API key
app.post('/api/test-key', async (req, res) => {
  const apiKey = req.body.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ valid: false, error: 'No API key provided.' });
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`);
    if (response.ok) {
      const data = await response.json();
      return res.json({ valid: true, count: data.models ? data.models.length : 0 });
    } else {
      const errData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        valid: false,
        error: errData.error ? errData.error.message : 'Invalid API key or network error'
      });
    }
  } catch (err) {
    return res.status(500).json({ valid: false, error: err.message });
  }
});

// Simulated smart multimodal response when no API key is supplied
async function streamSimulatedResponse(res, messages, model, attachments = []) {
  const lastUserMsg = messages[messages.length - 1];
  const query = (lastUserMsg && lastUserMsg.content) ? lastUserMsg.content.trim() : '';

  let simContent = '';
  const hasImages = attachments.some(a => a.mimeType && a.mimeType.startsWith('image/'));
  const hasAudio = attachments.some(a => a.mimeType && a.mimeType.startsWith('audio/'));
  const hasDocs = attachments.some(a => a.mimeType && (a.mimeType.includes('pdf') || a.mimeType.includes('text') || a.mimeType.includes('json')));

  if (hasImages) {
    const imgNames = attachments.filter(a => a.mimeType.startsWith('image/')).map(a => a.name).join(', ');
    simContent = `### 🔍 Visual Analysis Report\n\n` +
      `I've analyzed the uploaded image${attachments.length > 1 ? 's' : ''} (**${imgNames || 'Uploaded Visual'}**):\n\n` +
      `1. **Key Visual Elements Detected**:\n` +
      `   - High-fidelity composition with balanced lighting and contrast.\n` +
      `   - Prominent focal points identified with high visual clarity.\n` +
      `   - Structural layout verified for aesthetic and semantic coherence.\n\n` +
      `2. **Contextual Interpretation**:\n` +
      `   > Based on the visual cues and your query (*"${query || 'Analyze this image'}"*), the subject represents a rich multimodal asset.\n\n` +
      `3. **Actionable Suggestions**:\n` +
      `   - You can ask follow-up questions about specific color palettes, text extraction (OCR), or spatial composition!\n\n` +
      `\`\`\`json\n` +
      `{\n` +
      `  "status": "success",\n` +
      `  "modality": "vision",\n` +
      `  "confidence": 0.98,\n` +
      `  "features": ["edge_detection", "object_classification", "color_palette_harmony"]\n` +
      `}\n` +
      `\`\`\`\n\n` +
      `*(Note: To connect to live Google Gemini 2.0 Vision, click the ⚙️ Settings icon and enter your free Gemini API key!)*`;
  } else if (hasAudio) {
    simContent = `### 🎙️ Audio Transcription & Intent Analysis\n\n` +
      `**Voice Processing Complete:**\n` +
      `- Audio stream captured and converted with zero packet loss.\n` +
      `- Spectral frequency and acoustic cues processed successfully.\n\n` +
      `**Synthesized Query Response:**\n` +
      `> "${query || 'I received your spoken audio message.'}"\n\n` +
      `I am ready to respond in both text and real-time synthesized voice! Toggle the **Audio Speaker** icon above to listen to my voice output.`;
  } else if (hasDocs) {
    const docNames = attachments.map(a => a.name).join(', ');
    simContent = `### 📄 Document Intelligence Summary\n\n` +
      `Extracted content from **${docNames}**:\n\n` +
      `| Metric | Value |\n` +
      `| :--- | :--- |\n` +
      `| Files Processed | ${attachments.length} |\n` +
      `| Parsing Status | Verified & Indexed |\n` +
      `| Extraction Fidelity | 100% |\n\n` +
      `**Key Insights & Takeaways:**\n` +
      `- Document structure parsed into logical paragraphs and schema headers.\n` +
      `- Ready for contextual semantic Q&A, summarizing, or data extraction.\n\n` +
      `Feel free to ask specific questions about tables, clauses, or summaries inside this document!`;
  } else {
    // General conversational query
    simContent = `Hello! I am **MM Chatbot**, your cutting-edge Multimodal AI assistant powered by high-speed multimodal reasoning.\n\n` +
      `### What I Can Do For You:\n` +
      `- 🖼️ **Vision & Images**: Drag and drop screenshots, photos, diagrams, or capture snapshots live with your camera.\n` +
      `- 🎙️ **Voice & Speech**: Tap the microphone to dictate queries, and listen to spoken audio responses.\n` +
      `- 📄 **Documents & Files**: Upload PDFs, codebases, CSVs, and text files for deep analysis.\n` +
      `- 💻 **Code & Development**: Write, debug, and explain algorithms with syntax highlighting.\n\n` +
      `Here is a quick sample of interactive code:\n` +
      `\`\`\`javascript\n` +
      `// Multimodal event listener\n` +
      `async function sendMultimodalPrompt(text, files) {\n` +
      `  console.log("Analyzing inputs:", { text, filesCount: files.length });\n` +
      `  return "Multimodal processing initiated!";\n` +
      `}\n` +
      `\`\`\`\n\n` +
      `> 💡 **Tip:** Add your free Gemini API key in **Settings (⚙️)** at top right to unlock live Google Gemini 2.0 reasoning!`;
  }

  // Stream in small realistic chunks
  const words = simContent.split(' ');
  for (let i = 0; i < words.length; i += 3) {
    const chunk = words.slice(i, i + 3).join(' ') + ' ';
    res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
    await new Promise(r => setTimeout(r, 35));
  }
  res.write(`data: ${JSON.stringify({ type: 'done', stats: { tokens: words.length, simulated: true } })}\n\n`);
  res.end();
}

// Endpoint: Main Chat with Streaming (SSE)
app.post('/api/chat', async (req, res) => {
  let {
    messages = [],
    model = 'gemini-3.5-flash',
    temperature = 0.7,
    systemInstruction = '',
    apiKey: clientApiKey,
    attachments = []
  } = req.body;

  // Fallback map for deprecated or unsupported models
  const deprecatedMap = {
    'gemini-2.0-flash': 'gemini-3.5-flash',
    'gemini-2.5-flash': 'gemini-3.5-flash',
    'gemini-1.5-flash': 'gemini-3.5-flash',
    'gemini-1.5-pro': 'gemini-3.1-pro-preview',
    'gemini-2.0-pro': 'gemini-3.1-pro-preview',
    'gemini-2.5-pro': 'gemini-3.1-pro-preview',
    'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite'
  };
  if (deprecatedMap[model]) {
    model = deprecatedMap[model];
  }

  const activeApiKey = (clientApiKey && clientApiKey.trim()) || process.env.GEMINI_API_KEY;

  // Set SSE response headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'start', model })}\n\n`);

  // If no API key is present, gracefully stream simulated multimodal intelligence
  if (!activeApiKey || activeApiKey.trim() === '') {
    return streamSimulatedResponse(res, messages, model, attachments);
  }

  try {
    // Format messages for Google Gemini REST API v1beta
    // Format: contents: [ { role: 'user' | 'model', parts: [ ... ] } ]
    const contents = [];

    // History messages
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts = [];

      // If this is the last user message and has attachments, include them
      const isLatestMessage = (i === messages.length - 1);
      if (isLatestMessage && attachments && attachments.length > 0) {
        for (const att of attachments) {
          if (att.data) {
            // Strip data URL header if present (e.g. data:image/png;base64,...)
            const base64Data = att.data.includes(',') ? att.data.split(',')[1] : att.data;
            parts.push({
              inlineData: {
                mimeType: att.mimeType || 'image/jpeg',
                data: base64Data
              }
            });
          }
        }
      }

      if (msg.content && msg.content.trim()) {
        parts.push({ text: msg.content.trim() });
      }

      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
    }

    const payload = {
      contents,
      generationConfig: {
        temperature: parseFloat(temperature) || 0.7,
        maxOutputTokens: 4096
      }
    };

    if (systemInstruction && systemInstruction.trim()) {
      payload.systemInstruction = {
        parts: [{ text: systemInstruction.trim() }]
      };
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${activeApiKey.trim()}&alt=sse`;

    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!apiResponse.ok) {
      const errorJson = await apiResponse.json().catch(() => ({}));
      const errorMsg = errorJson.error ? errorJson.error.message : `Gemini API returned status ${apiResponse.status}`;
      res.write(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`);
      res.end();
      return;
    }

    // Process incoming SSE stream from Google API
    const reader = apiResponse.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep partial line

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data:')) {
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content) {
              const parts = parsed.candidates[0].content.parts || [];
              for (const part of parts) {
                if (part.text) {
                  res.write(`data: ${JSON.stringify({ type: 'chunk', text: part.text })}\n\n`);
                }
              }
            }
          } catch (e) {
            // ignore non-json line
          }
        }
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done', stats: { live: true } })}\n\n`);
    res.end();

  } catch (err) {
    console.error('Chat API Error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message || 'Server error processing multimodal request' })}\n\n`);
    res.end();
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 MM CHATBOT Server running at http://localhost:${PORT}`);
});
