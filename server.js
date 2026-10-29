const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

// Logging middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Gemini API models
const AVAILABLE_MODELS = [
  { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash (Recommended)', badge: 'Recommended', isDefault: true },
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', badge: 'Latest' },
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', badge: 'Standard' },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite (Fast ⚡)', badge: 'Fast' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', badge: 'Advanced' }
];

// Endpoint: Health Check for Monitoring & Load Balancers
app.get(['/api/health', '/healthz'], (req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    service: 'zenith-assistant',
    version: '2.1.0'
  });
});

// Endpoint: Configuration & Status
app.get('/api/config', (req, res) => {
  const hasServerKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '');
  res.json({
    hasServerKey,
    provider: 'gemini',
    defaultModel: 'gemini-3.6-flash',
    models: AVAILABLE_MODELS,
    serverTime: new Date().toISOString()
  });
});

// Endpoint: Validate an API key
app.post('/api/test-key', async (req, res) => {
  const apiKey = (req.body && req.body.apiKey) || process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ valid: false, error: 'No Gemini API key provided.' });
  }

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': apiKey.trim() },
      signal: AbortSignal.timeout(15000)
    });
    if (response.ok) {
      const data = await response.json();
      return res.json({ valid: true, count: Array.isArray(data.models) ? data.models.length : 0 });
    } else {
      const errData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        valid: false,
        error: errData.error ? errData.error.message : 'Invalid Gemini API key or network error'
      });
    }
  } catch (err) {
    return res.status(500).json({ valid: false, error: err.message });
  }
});

function isImageGenerationRequestText(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.toLowerCase().trim();

  // If asking for definition or identity without photo/image keywords, skip
  if (/^(?:who is|what is|why is|how to|where is|koun hai|kya hai|kaun hai)\b/i.test(t) && !/\b(?:photo|image|picture|pic|tasveer)\b/i.test(t)) {
    return false;
  }

  if (/^(?:draw|paint|sketch)\s+(?:a|an|me|the)?\s+/i.test(t)) return true;

  const imageNouns = '(?:image|picture|photo|photograph|illustration|artwork|wallpaper|poster|logo|thumbnail|icon|tasveer|tasvir|pic|pics|chitra|तस्वीर|तसवीर|फोटो|चित्र|छवि|इमेज)';
  const imageVerbs = '(?:generate|create|make|draw|design|paint|illustrate|render|bana(?:o|do|na|ye|de)?|bna(?:o|do|de)?|karo|kar\\s*(?:do|de)|want|need|show(?:\\s+me)?|dikha(?:o|na|ye|do|de)?|bhej(?:o|na|do|de)?|send|give|do|de(?:\\s*(?:do|de))?|chahiye|mangta|बनाओ|बना\\s*दो|बनादो|दिखाओ|भेजो|दीजिए|चाहिए)';

  if (new RegExp('^' + imageVerbs + '\\s+(?:an?\\s+)?' + imageNouns, 'i').test(t)) return true;
  if (new RegExp(imageNouns + '\\s+' + imageVerbs, 'i').test(t)) return true;
  if (new RegExp(imageVerbs + '.*' + imageNouns, 'i').test(t)) return true;
  if (new RegExp(imageNouns + '.*' + imageVerbs, 'i').test(t)) return true;
  if (new RegExp('\\bki\\s+' + imageNouns + '\\b', 'i').test(t)) return true;
  if (new RegExp('\\bka\\s+' + imageNouns + '\\b', 'i').test(t)) return true;
  if (new RegExp('\\b' + imageNouns + '\\s+(?:of|for|ki|ka)\\b', 'i').test(t)) return true;
  if (new RegExp('\\b' + imageNouns + '$', 'i').test(t)) return true;

  return false;
}

function cleanImagePrompt(userPrompt) {
  let s = (userPrompt || '').trim();
  s = s.replace(/^(?:bhai|bro|please|kripya|can you|hey|hello|assistant)\s+/i, '');
  s = s.replace(/^(?:mujhe|humko|hame)\s+/i, '');
  s = s.replace(/^(?:(?:that\s+(?:the|teh)\s+)?(?:chatbot\s+)?(?:gem[\W_]*nerate|gen(?:er|ar)ate|generate|create|draw|make|render|paint|sketch|show(?:\s+me)?|give(?:\s+me)?|send(?:\s+me)?)\s+(?:the\s+)?(?:an?\s+)?(?:image|imag|picture|photo|illustration|artwork|pic|pics|wallpaper)\s*(?:e?of|about|depicting|for)?\s*)/i, '');
  s = s.replace(/^(?:an?\s+)?(?:image|photo|picture|pic|pics|wallpaper)\s+(?:of|for|about)\s+/i, '');
  s = s.replace(/^(?:(?:ek\s+)?(?:achi\s+|achhi\s+|badhiya\s+|sundar\s+|mast\s+)?(?:si\s+)?)?(?:image|photo|picture|tasveer|pic)\s*(?:banao|dikhao|generate\s*karo|bhejo|do|de\s*do|chahiye)\s*(?:ki|ka|ke|of)?\s*/i, '');
  s = s.replace(/\s*(?:ki|ka|ke)?\s*(?:image|photo|picture|tasveer|chitra|pic|pics|wallpaper)\s*(?:banao|generate\s*karo|dikhao|bana\s*(?:do|de|o)|bhej\s*(?:do|de|o)|bhejo|do|de\s*do|chahiye|mangta|karo)\s*$/i, '');
  s = s.replace(/\s*(?:ki|ka|ke)\s*(?:image|photo|picture|tasveer|pic|pics)\s*$/i, '');
  s = s.replace(/\s+(?:image|photo|picture|pic|pics)$/i, '');
  s = s.replace(/\s+(?:ki|ka|ke)\s*$/i, '');
  s = s.replace(/^(?:ki|ka|ke)\s+/i, '');
  s = s.replace(/^(?:draw|paint|sketch)\s+(?:a|an|me|the)?\s+/i, '');
  s = s.replace(/^(?:(?:ek\s+)?(?:achi\s+|achhi\s+|badhiya\s+|sundar\s+|mast\s+)?(?:si\s+)?)/i, '');
  s = s.replace(/^[\s:;,.-]+|[\s:;,.-]+$/g, '').trim();
  return s || 'beautiful vibrant artwork';
}

// Robust Multi-Provider Image Generation Engine
async function generateHighQualityImage(userPrompt, apiKey, attachments = []) {
  // 1. Clean and normalize prompt
  const cleanPrompt = cleanImagePrompt(userPrompt);

  // 2. Prompt Enrichment for studio quality
  const lower = cleanPrompt.toLowerCase();
  let enrichedPrompt = cleanPrompt;
  let isCharacter = false;

  if (lower.includes('shinchan') || lower.includes('shin chan') || lower.includes('shin-chan')) {
    enrichedPrompt = 'Crayon Shin-chan (Shinnosuke Nohara) anime character, official anime art style, vibrant colors, joyful pose, clean studio illustration, high quality';
    isCharacter = true;
  } else if (lower.includes('doraemon')) {
    enrichedPrompt = 'Doraemon cute blue robotic cat anime character, official studio anime art style, happy expression, vibrant colors, high quality masterpiece';
    isCharacter = true;
  } else if (lower.includes('naruto')) {
    enrichedPrompt = 'Naruto Uzumaki anime character, official studio anime art style, vibrant colors, high quality masterpiece';
    isCharacter = true;
  } else if (lower.includes('goku') || lower.includes('dragon ball')) {
    enrichedPrompt = 'Son Goku Dragon Ball anime character, high quality studio anime art style, dynamic pose, vibrant colors';
    isCharacter = true;
  } else if (lower.includes('pikachu') || lower.includes('pokemon')) {
    enrichedPrompt = 'Pikachu cute Pokémon character, official anime style, bright yellow, cheerful pose, high quality';
    isCharacter = true;
  } else {
    const hasExplicitStyle = /\b(photo(?:realistic|graph)?|realistic|cinematic|anime|cartoon|illustration|painting|watercolor|sketch|pixel art|3d render|vector|comic|oil paint)\b/i.test(cleanPrompt);
    if (hasExplicitStyle) {
      enrichedPrompt = `${cleanPrompt}, masterpiece, sharp focus, 8k resolution, highly detailed`;
    } else {
      enrichedPrompt = `${cleanPrompt}, cinematic lighting, photorealistic, lifelike details, vibrant colors, sharp focus, high resolution 8k`;
    }
  }

  // Tier 1: Gemini Image API (if configured and quota available)
  if (apiKey && apiKey.trim()) {
    try {
      const input = [{ type: 'text', text: enrichedPrompt }];
      for (const attachment of attachments.slice(0, 10)) {
        const match = attachment && typeof attachment.data === 'string'
          ? attachment.data.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/) : null;
        if (match) input.push({ type: 'image', mime_type: match[1], data: match[2] });
      }
      const imageModels = ['gemini-3.1-flash-image', 'gemini-nano-banana-2.1', 'gemini-3.1-flash-lite-image'];
      for (const imageModel of imageModels) {
        const apiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
          body: JSON.stringify({
            model: imageModel,
            input,
            response_format: { type: 'image', aspect_ratio: '1:1', image_size: '1K' }
          }),
          signal: AbortSignal.timeout(8000)
        });
        if (apiResponse.ok) {
          const responseData = await apiResponse.json().catch(() => ({}));
          const outputImage = responseData.output_image || (responseData.outputs || []).find(output => output.type === 'image');
          const imageData = outputImage && (outputImage.data || outputImage.image?.data);
          if (imageData) {
            return {
              images: [{ mimeType: outputImage.mime_type || outputImage.mimeType || 'image/png', data: imageData }],
              text: `Generated image for: **"${cleanPrompt}"**`
            };
          }
        }
      }
    } catch (_) {
      // Free tier returns 429 quota, fallback seamlessly
    }
  }

  // Tier 2: Pollinations FLUX Engine (1024x1024 ultra-HD diffusion)
  try {
    const seed = Math.floor(Math.random() * 2147483640);
    const enc = encodeURIComponent(enrichedPrompt);
    const url = `https://image.pollinations.ai/prompt/${enc}?width=1024&height=1024&seed=${seed}&nologo=true&model=flux`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(18000)
    });
    if (res.ok) {
      const mime = res.headers.get('content-type') || 'image/jpeg';
      const buf = Buffer.from(await res.arrayBuffer());
      return {
        images: [{ mimeType: mime.split(';')[0].trim(), data: buf.toString('base64') }],
        text: `Generated image for: **"${cleanPrompt}"**`
      };
    }
  } catch (err) {
    console.warn('[IMAGE] Pollinations FLUX failed, cascading:', err.message);
  }

  // Tier 2.5: Pollinations Turbo Engine (Fast fallback diffusion)
  try {
    const seed = Math.floor(Math.random() * 2147483640);
    const enc = encodeURIComponent(enrichedPrompt);
    const url = `https://image.pollinations.ai/prompt/${enc}?width=768&height=768&seed=${seed}&nologo=true&model=turbo`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(12000)
    });
    if (res.ok) {
      const mime = res.headers.get('content-type') || 'image/jpeg';
      const buf = Buffer.from(await res.arrayBuffer());
      return {
        images: [{ mimeType: mime.split(';')[0].trim(), data: buf.toString('base64') }],
        text: `Generated image for: **"${cleanPrompt}"**`
      };
    }
  } catch (_) {}

  // Tier 3: Authentic Media Archive (for known characters, anime, and iconic subjects)
  if (isCharacter || cleanPrompt.split(/\s+/).length <= 4) {
    try {
      const variations = [cleanPrompt, cleanPrompt.replace(/\s+/g, '_')];
      if (lower.includes('shinchan') || lower.includes('shin chan')) variations.unshift('Shin-chan', 'Crayon_Shin-chan');
      if (lower.includes('doraemon')) variations.unshift('Doraemon');

      for (const v of variations) {
        const res = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(v), {
          headers: { 'User-Agent': 'MM-Chatbot/1.0 (info@example.com)' },
          signal: AbortSignal.timeout(5000)
        });
        if (res.ok) {
          const data = await res.json();
          const imgUrl = (data.thumbnail && data.thumbnail.source) || (data.originalimage && data.originalimage.source);
          if (imgUrl && !imgUrl.endsWith('.svg')) {
            const imgRes = await fetch(imgUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0' },
              signal: AbortSignal.timeout(10000)
            });
            if (imgRes.ok) {
              const mime = imgRes.headers.get('content-type') || 'image/jpeg';
              const buf = Buffer.from(await imgRes.arrayBuffer());
              return {
                images: [{ mimeType: mime.split(';')[0].trim(), data: buf.toString('base64') }],
                text: `Generated visual for: **"${cleanPrompt}"**`
              };
            }
          }
        }
      }

      // Title thumbnail lookup for general entities (Tiger, Lion, Taj Mahal, etc.)
      const titlesUrl = 'https://en.wikipedia.org/w/api.php?action=query&titles=' + encodeURIComponent(cleanPrompt) + '&prop=pageimages&format=json&pithumbsize=1024';
      const titlesRes = await fetch(titlesUrl, {
        headers: { 'User-Agent': 'MM-Chatbot/1.0' },
        signal: AbortSignal.timeout(5000)
      });
      if (titlesRes.ok) {
        const titlesData = await titlesRes.json();
        if (titlesData.query && titlesData.query.pages) {
          for (const page of Object.values(titlesData.query.pages)) {
            const imgUrl = page.thumbnail && page.thumbnail.source;
            if (imgUrl && !imgUrl.endsWith('.svg')) {
              const imgRes = await fetch(imgUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
              if (imgRes.ok) {
                const mime = imgRes.headers.get('content-type') || 'image/jpeg';
                const buf = Buffer.from(await imgRes.arrayBuffer());
                return {
                  images: [{ mimeType: mime.split(';')[0].trim(), data: buf.toString('base64') }],
                  text: `Generated visual for: **"${cleanPrompt}"**`
                };
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[IMAGE] Media archive check bypassed:', e.message);
    }
  }

  // Tier 4: AI Horde Decentralized Diffusion Engine (Zero limits, any prompt)
  try {
    const postRes = await fetch('https://aihorde.net/api/v2/generate/async', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': '0000000000',
        'Client-Agent': 'mm-chatbot:1.0:user@example.com'
      },
      body: JSON.stringify({
        prompt: enrichedPrompt,
        params: { steps: 20, width: 512, height: 512, sampler_name: 'k_euler' }
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (postRes.ok) {
      const { id } = await postRes.json();
      const start = Date.now();
      while (Date.now() - start < 30000) {
        await new Promise(r => setTimeout(r, 2000));
        const check = await fetch('https://aihorde.net/api/v2/generate/status/' + id, { signal: AbortSignal.timeout(6000) });
        if (check.ok) {
          const statusData = await check.json();
          if (statusData.done && statusData.generations && statusData.generations[0]) {
            const imgRes = await fetch(statusData.generations[0].img, { signal: AbortSignal.timeout(12000) });
            if (imgRes.ok) {
              const mime = imgRes.headers.get('content-type') || 'image/webp';
              const buf = Buffer.from(await imgRes.arrayBuffer());
              return {
                images: [{ mimeType: mime.split(';')[0].trim(), data: buf.toString('base64') }],
                text: `Generated image for: **"${cleanPrompt}"**`
              };
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[IMAGE] AI Horde engine error:', err.message);
  }

  throw new Error('All image generation engines are currently busy. Please retry in a few moments.');
}

app.post('/api/generate-image', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const apiKey = (typeof body.apiKey === 'string' && body.apiKey.trim()) || process.env.GEMINI_API_KEY;
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];

  if (!prompt) {
    return res.status(400).json({ error: 'Describe the image you want to generate.' });
  }

  try {
    const result = await generateHighQualityImage(prompt, apiKey, attachments);
    return res.json(result);
  } catch (err) {
    console.warn(`[WARN] Image generation failed: ${err.message}`);
    return res.status(502).json({ error: `Image generation failed: ${err.message}` });
  }
});

// Stream smart cognitive response (High-Speed instant output)
async function streamSmartCognitiveResponse(res, query, attachments, model, notice = '') {
  // Never present canned placeholder text as an answer from an AI model.
  res.write(`data: ${JSON.stringify({ type: 'error', error: notice || 'The AI provider could not answer this request. Please try again.' })}\n\n`);
  res.end();
}

// Gemini Interactions input supports text and inline image inputs.
function normalizeGeminiInteractionInput(messages = [], attachments = [], systemInstruction = '') {
  const transcript = [];
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (!message || !['user', 'assistant', 'model'].includes(message.role)) continue;
    const role = message.role === 'assistant' || message.role === 'model' ? 'Assistant' : 'User';
    const text = String(message.content || '')
      .replace(/>\s*⚠️\s*\*\*Request Failed:.*$/gm, '')
      .replace(/>\s*⚠️\s*\*\*Error:.*$/gm, '').trim();
    if (text) transcript.push(role + ': ' + text);
  }
  const input = [];
  const baseInstruction = 'You are Zenith Assistant, an intelligent, articulate, helpful, and friendly multimodal AI assistant. Provide thoughtful, well-structured, accurate, and comprehensive responses. If the user writes or speaks in Hindi or Hinglish, reply naturally and accurately in Hindi/Hinglish. Use clear markdown formatting with bold headings, bullet points, and code blocks where helpful. Never tell the user to go to Google Images, Pinterest, or external search engines to find photos. You are a multimodal assistant that can generate and perceive visuals directly.';
  const effectiveInstruction = (systemInstruction && systemInstruction.trim())
    ? `${baseInstruction}\n\nAdditional user guidelines: ${systemInstruction.trim()}`
    : baseInstruction;
  input.push({ type: 'text', text: 'System instruction: ' + effectiveInstruction });
  input.push({ type: 'text', text: transcript.join('\n\n') || 'User: Hello' });
  const latest = messages[messages.length - 1];
  if (latest && latest.role === 'user') {
      for (const attachment of attachments) {
        if (!attachment || typeof attachment.data !== 'string' || !attachment.data.startsWith('data:')) continue;
        const comma = attachment.data.indexOf(',');
        if (comma < 0) continue;
        const mimeType = attachment.mimeType || attachment.data.slice(5, attachment.data.indexOf(';')) || 'application/octet-stream';
        const encoded = attachment.data.slice(comma + 1);
        if (mimeType.startsWith('image/')) {
          input.push({ type: 'image', mime_type: mimeType, data: encoded });
        } else if (/^(application\/pdf|audio\/)/i.test(mimeType)) {
          input.push({ type: 'text', text: '[Attached ' + mimeType + ' file: ' + (attachment.name || 'file') + ' is not available in this interaction.]' });
        } else {
          try { input.push({ type: 'text', text: '\n[Attached file: ' + (attachment.name || 'document') + ']\n' + Buffer.from(encoded, 'base64').toString('utf8') }); } catch (_) {}
        }
      }
  }
  return input;
}

app.post('/api/chat', async (req, res) => {
  const { messages = [], model = 'gemini-3.6-flash', systemInstruction = '', apiKey: clientApiKey, attachments = [] } = req.body || {};
  const apiKey = (clientApiKey && clientApiKey.trim()) || process.env.GEMINI_API_KEY;
  const selectedModel = AVAILABLE_MODELS.some(item => item.id === model) ? model : 'gemini-3.6-flash';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write('data: ' + JSON.stringify({ type: 'start', model: selectedModel }) + '\n\n');
  if (!apiKey) return streamSmartCognitiveResponse(res, '', [], selectedModel, 'Add your Gemini API key in Settings or configure GEMINI_API_KEY on the server.');

  // If user is directly requesting a photo/image inside chat, generate and stream it directly
  const latestUser = (messages || []).slice().reverse().find(m => m && m.role === 'user');
  const userText = latestUser ? String(latestUser.content || '') : '';
  if (isImageGenerationRequestText(userText)) {
    try {
      const imgResult = await generateHighQualityImage(userText, apiKey, attachments);
      const firstImg = imgResult.images && imgResult.images[0];
      if (firstImg && firstImg.data) {
        const cleanPrompt = cleanImagePrompt(userText);
        const dataUri = `data:${firstImg.mimeType};base64,${firstImg.data}`;
        const markdown = `Yeh lijiye aapki image for **"${cleanPrompt}"**:\n\n![${cleanPrompt}](${dataUri})\n\n[📥 Download Image](${dataUri})\n\n`;
        res.write('data: ' + JSON.stringify({ type: 'chunk', text: markdown }) + '\n\n');
        res.write('data: ' + JSON.stringify({ type: 'done', stats: { live: true, model: 'image-engine' } }) + '\n\n');
        res.end();
        return;
      }
    } catch (imgErr) {
      console.warn('[CHAT] Auto image generation error, falling through to model:', imgErr.message);
    }
  }

  try {
    const input = normalizeGeminiInteractionInput(messages, attachments, systemInstruction);
    let response;
    let activeModel = selectedModel;
    const modelFallbacks = [selectedModel, 'gemini-3.6-flash', 'gemini-3.5-flash-lite'].filter((item, index, list) => list.indexOf(item) === index);
    for (const candidateModel of modelFallbacks) {
      activeModel = candidateModel;
      response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
        body: JSON.stringify({ model: candidateModel, input, stream: true }),
        signal: AbortSignal.timeout(120000)
      });
      if (response.ok || ![429, 503].includes(response.status)) break;
      await response.body?.cancel().catch(() => {});
    }
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return streamSmartCognitiveResponse(res, '', [], selectedModel, errorData.error?.message || ('Gemini API returned HTTP ' + response.status));
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim().startsWith('data:')) continue;
        try {
          const event = JSON.parse(line.trim().slice(5).trim());
          const delta = event.delta || (event.data && event.data.delta) || {};
          const text = delta.type === 'text' ? delta.text : event.delta_text;
          if (text) res.write('data: ' + JSON.stringify({ type: 'chunk', text }) + '\n\n');
          const providerError = event.error && (event.error.message || event.error) || event.message && /error|failed/i.test(event.event_type || '') && event.message;
          if (providerError) {
            res.write('data: ' + JSON.stringify({ type: 'error', error: providerError }) + '\n\n');
            res.end();
            return;
          }
        } catch (_) {}
      }
    }
    if (!res.destroyed) {
      res.write('data: ' + JSON.stringify({ type: 'done', stats: { live: true, model: activeModel } }) + '\n\n');
      res.end();
    }
  } catch (error) {
    if (!res.destroyed) {
      res.write('data: ' + JSON.stringify({ type: 'error', error: 'Gemini request failed: ' + error.message }) + '\n\n');
      res.end();
    }
  }
});
// Start server
app.listen(PORT, () => {
  console.log(`🚀 ZENITH ASSISTANT Server running at http://localhost:${PORT}`);
});
