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

function checkSafetyViolation(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.toLowerCase();

  // 1. Cyberattacks, Hacking, Unauthorized Intrusion
  const hacking = /\b(?:hack(?:ing)?\s+(?:into|someone|account|wifi|bank|website|cctv|password|phone)|write\s+(?:a\s+)?(?:ransomware|trojan|keylogger|spyware|exploit|malware|virus\s+script)|ddos\s+attack|steal\s+(?:credit\s+card|password|otp)|phishing\s+(?:page|link)\s*(?:code|kaise)|kaise\s+hack\s+kare|hack\s+kaise\s+kare)\b/i;
  if (hacking.test(t)) {
    return 'Main hacking, cyberattacks, ya kisi illegal activity me madad nahi kar sakta. Agar aap cybersecurity defense ya ethical technology seekhna chahte hain, toh main zaroor madad kar sakta hoon.';
  }

  // 2. Weapons, Explosives, Dangerous Harm (both English & Hindi word order)
  const weapons = /\b(?:make|create|build|synthesize|manufacture|kaise\s+banaye|banane\s+ka\s+tarika).*(?:bomb|explosive|ied|grenade|weapon|pipe\s*bomb|molotov|poison|cyanide|anthrax|gunpowder|hathiyar)\b|\b(?:bomb|explosive|ied|grenade|weapon|pipe\s*bomb|molotov|poison|cyanide|hathiyar).*(?:bana(?:ne|ye|o|na)|banao|make|build|kaise\s+banaye)\b/i;
  if (weapons.test(t)) {
    return 'Main hathiyar, bomb, explosives, ya hanikarak rasayan (chemicals) banane se judi jankari pradan nahi kar sakta.';
  }

  // 3. Illicit Drugs (both English & Hindi word order)
  const drugs = /\b(?:how\s+to\s+)?(?:make|cook|synthesize|manufacture|produce|kaise\s+banaye|banane\s+ka\s+tarika).*(?:meth(?:amphetamine)?|heroin|cocaine|fentanyl|lsd|crack|drugs|nasha)\b|\b(?:meth|heroin|cocaine|fentanyl|lsd|drugs|nasha).*(?:bana(?:ne|ye|o|na)|kaise\s+bana(?:ye|o|ne)|cook|synthesize|make)\b/i;
  if (drugs.test(t)) {
    return 'Main illicit drugs ya hanikarak padarth banane ki jankari nahi de sakta.';
  }

  // 4. Suicide / Self-Harm
  const selfHarm = /\b(?:how\s+to\s+commit\s+suicide|how\s+to\s+kill\s+myself|ways\s+to\s+die|suicide\s+methods|apne\s+aap\s+ko\s+kaise\s+maru|marne\s+ka\s+tarika|aatmahatya)\b/i;
  if (selfHarm.test(t)) {
    return 'Aapki zindagi anmol hai. Agar aap pareshan hain ya kisi kathin daur se guzar rahe hain, kripya turant helpline par sampark karein (KIRAN Helpline: 1800-599-0019 ya Tele-MANAS: 14416). Main aisi kisi bhi gatividhi me sahayata nahi kar sakta.';
  }

  // 5. Theft, Fraud, Financial Crime
  const fraud = /\b(?:how\s+to\s+steal|carding\s+tutorial|fake\s+currency\s+printing|counterfeit\s+money|launder\s+money|chori\s+kaise\s+kare|fraud\s+kaise\s+kare)\b/i;
  if (fraud.test(t)) {
    return 'Main chori, fraud, ya kisi bhi illegal financial gatividhi me madad nahi kar sakta.';
  }

  return null;
}

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
  if (/\b(?:asli\s*(?:log(?:o|on)?|aadmi|insaan|aurat|ladki|ladka)|real\s*(?:people|person|human))\b/i.test(t)) return true;

  return false;
}

// Authentic Real Entities: Real Celebrities, Public Figures, Monuments, and Brand Logos
const AUTHENTIC_ENTITIES = [
  // Famous Brand Logos (authentic official branding)
  { patterns: [/\b(?:nike|swoosh)\b/i], article: 'Swoosh', label: 'Nike' },
  { patterns: [/\bapple\s*(?:inc|computer|logo|brand)?\b/i], article: 'Apple_Inc.', label: 'Apple' },
  { patterns: [/\badidas\b/i], article: 'Adidas', label: 'Adidas' },
  { patterns: [/\btesla\b/i], article: 'Tesla,_Inc.', label: 'Tesla' },
  { patterns: [/\bmcdonalds|mcdonald'?s|golden arches\b/i], article: 'Golden_Arches', label: "McDonald's" },
  { patterns: [/\b(?:twitter|x\s+logo)\b/i], article: 'Twitter', label: 'Twitter' },
  { patterns: [/\bcoca[\s-]*cola|coke\b/i], article: 'Coca-Cola', label: 'Coca-Cola' },
  { patterns: [/\bpepsi\b/i], article: 'Pepsi', label: 'Pepsi' },
  { patterns: [/\bnetflix\b/i], article: 'Netflix', label: 'Netflix' },
  { patterns: [/\bspotify\b/i], article: 'Spotify', label: 'Spotify' },
  { patterns: [/\blamborghini\b/i], article: 'Lamborghini', label: 'Lamborghini' },
  { patterns: [/\baudi\b/i], article: 'Audi', label: 'Audi' },
  // Iconic Anime & Cartoon Characters
  { patterns: [/\bshin[\s-]*chan\b/i], article: 'Crayon_Shin-chan', label: 'Shin-chan' },
  { patterns: [/\bdoraemon\b/i], article: 'Doraemon', label: 'Doraemon' },
  { patterns: [/\bpikachu\b/i], article: 'Pikachu', label: 'Pikachu' },
  // Famous Real People & Public Figures (100% authentic photograph)
  { patterns: [/\bshah[\s-]*rukh[\s-]*khan|srk\b/i], article: 'Shah_Rukh_Khan', label: 'Shah Rukh Khan' },
  { patterns: [/\bvirat[\s-]*kohli\b/i], article: 'Virat_Kohli', label: 'Virat Kohli' },
  { patterns: [/\bnarendra[\s-]*modi|modi[\s-]*ji\b/i], article: 'Narendra_Modi', label: 'Narendra Modi' },
  { patterns: [/\bsalman[\s-]*khan\b/i], article: 'Salman_Khan', label: 'Salman Khan' },
  { patterns: [/\bms[\s-]*dhoni|dhoni\b/i], article: 'MS_Dhoni', label: 'MS Dhoni' },
  { patterns: [/\brohit[\s-]*sharma\b/i], article: 'Rohit_Sharma', label: 'Rohit Sharma' },
  { patterns: [/\bsachin[\s-]*tendulkar\b/i], article: 'Sachin_Tendulkar', label: 'Sachin Tendulkar' },
  { patterns: [/\bamitabh[\s-]*bachchan\b/i], article: 'Amitabh_Bachchan', label: 'Amitabh Bachchan' },
  { patterns: [/\belon[\s-]*musk\b/i], article: 'Elon_Musk', label: 'Elon Musk' },
  { patterns: [/\bbill[\s-]*gates\b/i], article: 'Bill_Gates', label: 'Bill Gates' },
  { patterns: [/\bsteve[\s-]*jobs\b/i], article: 'Steve_Jobs', label: 'Steve Jobs' },
  { patterns: [/\balbert[\s-]*einstein|einstein\b/i], article: 'Albert_Einstein', label: 'Albert Einstein' },
  { patterns: [/\bbhagat[\s-]*singh\b/i], article: 'Bhagat_Singh', label: 'Bhagat Singh' },
  { patterns: [/\bsubhas[\s-]*chandra[\s-]*bose|netaji\b/i], article: 'Subhas_Chandra_Bose', label: 'Netaji Subhas Chandra Bose' },
  { patterns: [/\babdul[\s-]*kalam|apj\s*abdul\s*kalam\b/i], article: 'A._P._J._Abdul_Kalam', label: 'Dr. A.P.J. Abdul Kalam' },
  { patterns: [/\bmahatma[\s-]*gandhi|gandhi[\s-]*ji\b/i], article: 'Mahatma_Gandhi', label: 'Mahatma Gandhi' },
  { patterns: [/\bcristiano[\s-]*ronaldo|ronaldo\b/i], article: 'Cristiano_Ronaldo', label: 'Cristiano Ronaldo' },
  { patterns: [/\blionel[\s-]*messi|messi\b/i], article: 'Lionel_Messi', label: 'Lionel Messi' },
  // Iconic World Landmarks & Monuments
  { patterns: [/\btaj[\s-]*mahal\b/i], article: 'Taj_Mahal', label: 'Taj Mahal' },
  { patterns: [/\beiffel[\s-]*tower|effel[\s-]*tower\b/i], article: 'Eiffel_Tower', label: 'Eiffel Tower' },
  { patterns: [/\bindia[\s-]*gate\b/i], article: 'India_Gate', label: 'India Gate' },
  { patterns: [/\bred[\s-]*fort\b/i], article: 'Red_Fort', label: 'Red Fort' }
];

async function fetchAuthenticVisual(prompt) {
  for (const item of AUTHENTIC_ENTITIES) {
    if (item.patterns.some(p => p.test(prompt))) {
      try {
        const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(item.article);
        const res = await fetch(url, { headers: { 'User-Agent': 'MM-Chatbot/1.0 (info@example.com)' }, signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const d = await res.json();
          const imgUrl = (d.thumbnail && d.thumbnail.source) || (d.originalimage && d.originalimage.source);
          if (imgUrl && !imgUrl.endsWith('.svg')) {
            const imgRes = await fetch(imgUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, signal: AbortSignal.timeout(8000) });
            if (imgRes.ok) {
              const buf = Buffer.from(await imgRes.arrayBuffer());
              const mime = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
              return {
                label: item.label,
                mimeType: mime,
                data: buf.toString('base64'),
                text: `Authentic verified visual for **${item.label}**`
              };
            }
          }
        }
      } catch (e) {
        console.warn(`[WARN] Authentic visual fetch for ${item.label} failed:`, e.message);
      }
    }
  }
  return null;
}

function cleanImagePrompt(userPrompt) {
  let s = (userPrompt || '').trim();
  s = s.replace(/^(?:bhai|bro|please|kripya|can you|hey|hello|assistant|are|yaar|sun|suno)\s+/i, '');
  s = s.replace(/^(?:mujhe|humko|hame|mere ko)\s+/i, '');
  s = s.replace(/^(?:that\s+(?:the|teh)\s+)?(?:chatbot\s+)?/i, '');
  s = s.replace(/^(?:(?:generate|gen(?:er|ar)ate|gem[\W_]*nerate|create|draw|make|render|paint|sketch|show(?:\s+me)?|give(?:\s+me)?|send(?:\s+me)?)\s+(?:the\s+)?(?:an?\s+)?(?:image|imag|picture|photo|illustration|artwork|pic|pics|wallpaper)\s*(?:e?of|about|depicting|for)?\s*)/i, '');
  s = s.replace(/^(?:an?\s+)?(?:image|photo|picture|pic|pics|wallpaper)\s+(?:of|for|about)\s+/i, '');
  s = s.replace(/^(?:(?:ek\s+)?(?:achi\s+|achhi\s+|badhiya\s+|sundar\s+|mast\s+)?(?:si\s+)?)?(?:image|photo|picture|tasveer|pic)\s*(?:banao|dikhao|generate\s*karo|bhejo|do|de\s*do|chahiye)\s*(?:ki|ka|ke|of)?\s*/i, '');
  s = s.replace(/\s*(?:ke|ki|ka)?\s*(?:image|photo|picture|tasveer|chitra|pic|pics|wallpaper)\s*(?:generate\s*karke\s*(?:do|de|bhejo)?|generate\s*karo|banao|dikhao|bana\s*(?:do|de|o)|bhej\s*(?:do|de|o)|bhejo|do|de\s*do|chahiye|mangta|karo)\s*$/i, '');
  s = s.replace(/\s*(?:ki|ka|ke)\s*(?:image|photo|picture|tasveer|pic|pics)\s*$/i, '');
  s = s.replace(/\s+(?:image|photo|picture|pic|pics)$/i, '');
  s = s.replace(/\s+(?:generate\s*karke\s*(?:do|de|bhejo)?|generate\s*karo|banao|dikhao|bana\s*(?:do|de|o)|bhej\s*(?:do|de|o)|bhejo|do|de\s*do|chahiye|mangta|karo)\s*$/i, '');
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

  // 2. Check authentic verified visual database (real celebrities, brands, monuments)
  const authenticMatch = await fetchAuthenticVisual(userPrompt + ' ' + cleanPrompt);
  if (authenticMatch) {
    return {
      images: [{ mimeType: authenticMatch.mimeType, data: authenticMatch.data }],
      text: authenticMatch.text
    };
  }

  // 3. Prompt Enrichment for studio quality & exact text box intent
  let enrichedPrompt = cleanPrompt;
  let isRealPerson = false;
  let isLogo = false;

  // CRITICAL: In Hindi/Hinglish, "asli logo" or "asli log" means "Real People" (not a corporate vector logo!)
  const isRealPeopleQuery = /\b(?:asli\s*(?:log(?:o|on)?|aadmi|insaan|manav|janta|vyakti|aurat|ladki|ladka)|real\s*(?:people|person|human(?:s)?|man|woman|portrait|face)|indian\s*(?:people|man|woman|girl|boy))\b/i.test(cleanPrompt) ||
    /\b(?:asli\s*(?:log(?:o|on)?|aadmi|insaan|manav|janta|vyakti|aurat|ladki|ladka)|real\s*(?:people|person|human(?:s)?|man|woman|portrait|face))\b/i.test(userPrompt);

  if (isRealPeopleQuery && !/\b(?:brand|company|vector|graphic)\b/i.test(cleanPrompt)) {
    isRealPerson = true;
    enrichedPrompt = 'photorealistic portrait of authentic real people with genuine warm smiles, highly detailed natural skin texture with visible pores, realistic eyes and hair, professional 85mm portrait photography, soft studio lighting, sharp focus, 8k resolution, photorealism masterpiece';
  } else if (/\b(?:logo|emblem|symbol|crest|icon)\b/i.test(cleanPrompt)) {
    isLogo = true;
    enrichedPrompt = `${cleanPrompt}, clean minimalist modern vector emblem design, sharp edges, iconic branding, centered, solid clean background, 4k high resolution`;
  } else {
    // Translate common Hindi/Hinglish terms so diffusion models render exact intent
    let eng = cleanPrompt;
    const translations = [
      [/\b(?:sundar|khubsurat)\s+(?:ladki|kanya|mahila|aurat)\b/gi, 'beautiful Indian woman'],
      [/\b(?:ladki|kanya)\b/gi, 'Indian girl'],
      [/\b(?:aurat|mahila)\b/gi, 'Indian woman'],
      [/\b(?:ladka)\b/gi, 'Indian boy'],
      [/\b(?:aadmi|purush)\b/gi, 'Indian man'],
      [/\b(?:billi)\b/gi, 'cute domestic cat'],
      [/\b(?:kutta|kutte)\b/gi, 'friendly dog'],
      [/\b(?:sher)\b/gi, 'majestic lion'],
      [/\b(?:hathi)\b/gi, 'majestic elephant'],
      [/\b(?:ghoda)\b/gi, 'majestic galloping horse'],
      [/\b(?:gadi|gaadi)\b/gi, 'luxury modern car'],
      [/\b(?:pahad|parvat)\b/gi, 'majestic snow-capped mountains'],
      [/\b(?:nadi)\b/gi, 'serene flowing river landscape'],
      [/\b(?:samundar|samudra)\b/gi, 'beautiful ocean waves beach at sunset'],
      [/\b(?:suraj)\b/gi, 'golden glowing sun'],
      [/\b(?:chand|chanda)\b/gi, 'radiant full moon in starry night sky'],
      [/\b(?:ped|paudhe)\b/gi, 'lush green ancient tree'],
      [/\b(?:phool|gulab)\b/gi, 'vibrant blossoming red rose flower'],
      [/\b(?:barish)\b/gi, 'dramatic rain drops aesthetic'],
      [/\b(?:asli)\b/gi, 'photorealistic real authentic'],
      [/\b(?:sundar|khubsurat)\b/gi, 'beautiful breathtaking'],
      [/\b(?:achhi|achi|badhiya|mast)\b/gi, 'stunning high quality']
    ];
    for (const [pattern, replacement] of translations) {
      eng = eng.replace(pattern, replacement);
    }
    eng = eng.replace(/\s+/g, ' ').trim();

    const hasExplicitStyle = /\b(photo(?:realistic|graph)?|realistic|cinematic|anime|cartoon|illustration|painting|watercolor|sketch|pixel art|3d render|vector|comic|oil paint)\b/i.test(eng);
    if (hasExplicitStyle) {
      enrichedPrompt = `${eng}, masterpiece, sharp focus, 8k resolution, highly detailed`;
    } else {
      enrichedPrompt = `${eng}, photorealistic, cinematic lighting, lifelike details, vibrant colors, sharp focus, high resolution 8k`;
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
          signal: AbortSignal.timeout(6000)
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

  // Tier 2: Pollinations Realism Engine (Fast 3.5s check, cascades instantly on 402/503/timeout)
  try {
    const seed = Math.floor(Math.random() * 2147483640);
    const enc = encodeURIComponent(enrichedPrompt);
    const url = `https://image.pollinations.ai/prompt/${enc}?width=768&height=768&seed=${seed}&nologo=true`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(3500)
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('image/')) {
      const mime = contentType.split(';')[0].trim();
      const buf = Buffer.from(await res.arrayBuffer());
      return {
        images: [{ mimeType: mime, data: buf.toString('base64') }],
        text: `Generated image for: **"${cleanPrompt}"**`
      };
    }
  } catch (_) {
    // Fast cascade to AI Horde
  }

  // Tier 3: AI Horde Diffusion Engine with Photorealism Models
  // (Produces authentic real people portraits, crisp logos, and exact text box prompts)
  try {
    const hordeModels = isRealPerson
      ? ['ICBINP - I Can\'t Believe It\'s Not Photography', 'AbsoluteReality', 'Deliberate', 'stable_diffusion']
      : (isLogo ? ['Deliberate', 'stable_diffusion'] : ['AbsoluteReality', 'Deliberate', 'stable_diffusion']);

    const negativePrompt = isRealPerson
      ? 'deformed, disfigured, bad anatomy, poorly drawn face, mutated, extra limbs, blurry, low quality, distorted, cartoon, 3d render, anime, painting, bad eyes, missing fingers, extra fingers, doll, plastic skin, wax figure, artifact'
      : (isLogo ? 'photorealistic human, photo, textured background, complex 3d noise, blurry, low quality, watermark, text distortion' : 'deformed, low quality, blurry, distorted, antique 1925 vintage car, cartoon, extra limbs');

    const postRes = await fetch('https://aihorde.net/api/v2/generate/async', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': '0000000000',
        'Client-Agent': 'mm-chatbot:1.0:user@example.com'
      },
      body: JSON.stringify({
        prompt: enrichedPrompt,
        params: {
          steps: 25,
          width: 512,
          height: 512,
          sampler_name: 'k_euler',
          cfg_scale: 7.5,
          negative_prompt: negativePrompt
        },
        models: hordeModels
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (postRes.ok) {
      const { id } = await postRes.json();
      const start = Date.now();
      while (Date.now() - start < 35000) {
        await new Promise(r => setTimeout(r, 1800));
        const check = await fetch('https://aihorde.net/api/v2/generate/status/' + id, { signal: AbortSignal.timeout(6000) });
        if (check.ok) {
          const statusData = await check.json();
          if (statusData.done && statusData.generations && statusData.generations[0]) {
            const imgRes = await fetch(statusData.generations[0].img, { signal: AbortSignal.timeout(12000) });
            if (imgRes.ok) {
              const mime = (imgRes.headers.get('content-type') || 'image/webp').split(';')[0].trim();
              const buf = Buffer.from(await imgRes.arrayBuffer());
              return {
                images: [{ mimeType: mime, data: buf.toString('base64') }],
                text: `Generated image for: **"${cleanPrompt}"**`
              };
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[IMAGE] AI Horde photorealism engine error:', err.message);
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

  const safetyIssue = checkSafetyViolation(prompt);
  if (safetyIssue) {
    return res.status(400).json({ error: safetyIssue });
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
  const baseInstruction = 'You are Zenith Assistant, an intelligent, articulate, helpful, and friendly multimodal AI assistant. Provide thoughtful, well-structured, accurate, and comprehensive responses. If the user writes or speaks in Hindi or Hinglish, reply naturally and accurately in Hindi/Hinglish. Use clear markdown formatting with bold headings, bullet points, and code blocks where helpful. Never tell the user to go to Google Images, Pinterest, or external search engines to find photos. You are a multimodal assistant that can generate and perceive visuals directly. Safety & Legal Policy: Strictly adhere to industry standard safety policies like ChatGPT and Gemini. Never assist with, encourage, or provide instructions for illegal activities, cyberattacks, hacking, weapons, explosives, illicit drug manufacturing, violence, severe self-harm, fraud, or non-consensual exploitation. If asked for illegal or harmful instructions, refuse politely, firmly, and constructively, offering safe educational alternatives if appropriate.';
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

  const latestUser = (messages || []).slice().reverse().find(m => m && m.role === 'user');
  const userText = latestUser ? String(latestUser.content || '') : '';

  // Safety & Legal Guardrail (ChatGPT & Gemini style standard limits)
  const safetyIssue = checkSafetyViolation(userText);
  if (safetyIssue) {
    res.write('data: ' + JSON.stringify({ type: 'chunk', text: safetyIssue }) + '\n\n');
    res.write('data: ' + JSON.stringify({ type: 'done', stats: { live: true, model: 'safety-guardrail' } }) + '\n\n');
    res.end();
    return;
  }

  // If user is directly requesting a photo/image inside chat, generate and stream it directly
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
