"""Zenith Assistant FastAPI backend powered by the Google Gemini API."""

import os
import sys
import json
import base64
import re
from typing import List, Optional
from pathlib import Path

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

load_dotenv()
app = FastAPI(title="ZENITH ASSISTANT API", description="Multimodal AI powered by Google Gemini", version="2.2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

AVAILABLE_MODELS = [
    {"id": "gemini-3.6-flash", "name": "Gemini 3.6 Flash (Recommended)", "badge": "Recommended", "isDefault": True},
    {"id": "gemini-3.8-flash", "name": "Gemini 3.8 Flash", "badge": "Latest"},
    {"id": "gemini-3.5-flash", "name": "Gemini 3.5 Flash", "badge": "Standard"},
    {"id": "gemini-3.5-flash-lite", "name": "Gemini 3.5 Flash Lite (Fast ⚡)", "badge": "Fast"},
    {"id": "gemini-3.1-pro-preview", "name": "Gemini 3.1 Pro", "badge": "Advanced"},
]
MODEL_IDS = {model["id"] for model in AVAILABLE_MODELS}


class Attachment(BaseModel):
    name: Optional[str] = "file"
    mimeType: Optional[str] = "application/octet-stream"
    size: Optional[int] = 0
    data: Optional[str] = None


class ChatMessage(BaseModel):
    role: str
    content: Optional[str] = ""
    attachments: Optional[List[Attachment]] = Field(default_factory=list)
    timestamp: Optional[str] = None


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(default_factory=list)
    model: Optional[str] = "gemini-3.6-flash"
    temperature: Optional[float] = 0.7
    systemInstruction: Optional[str] = ""
    apiKey: Optional[str] = ""
    attachments: Optional[List[Attachment]] = Field(default_factory=list)


class KeyTestRequest(BaseModel):
    apiKey: Optional[str] = ""


class ImageGenerationRequest(BaseModel):
    prompt: Optional[str] = ""
    apiKey: Optional[str] = ""
    attachments: List[Attachment] = Field(default_factory=list)


def get_api_key(provided: Optional[str]) -> str:
    return (provided or os.getenv("GEMINI_API_KEY", "")).strip()


def sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.get("/api/health")
@app.get("/healthz")
async def health_check():
    return {"status": "healthy", "service": "zenith-assistant", "version": "2.2.0"}


@app.get("/api/config")
async def get_config():
    return {"hasServerKey": bool(os.getenv("GEMINI_API_KEY", "").strip()), "provider": "gemini", "defaultModel": "gemini-3.6-flash", "models": AVAILABLE_MODELS}


@app.post("/api/test-key")
async def test_key(req: KeyTestRequest):
    api_key = get_api_key(req.apiKey)
    if not api_key:
        return JSONResponse(status_code=400, content={"valid": False, "error": "No Gemini API key provided."})
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get("https://generativelanguage.googleapis.com/v1beta/models", headers={"x-goog-api-key": api_key})
        if response.is_success:
            return {"valid": True, "count": len(response.json().get("models", []))}
        detail = response.json().get("error", {}).get("message", "Invalid Gemini API key")
        return JSONResponse(status_code=response.status_code, content={"valid": False, "error": detail})
    except Exception as exc:
        return JSONResponse(status_code=502, content={"valid": False, "error": str(exc)})


def check_safety_violation(text: str) -> Optional[str]:
    if not text or not isinstance(text, str):
        return None
    t = text.lower()
    hacking = r"\b(?:hack(?:ing)?\s+(?:into|someone|account|wifi|bank|website|cctv|password|phone)|write\s+(?:a\s+)?(?:ransomware|trojan|keylogger|spyware|exploit|malware|virus\s+script)|ddos\s+attack|steal\s+(?:credit\s+card|password|otp)|phishing\s+(?:page|link)\s*(?:code|kaise)|kaise\s+hack\s+kare|hack\s+kaise\s+kare)\b"
    if re.search(hacking, t, re.I):
        return "Main hacking, cyberattacks, ya kisi illegal activity me madad nahi kar sakta. Agar aap cybersecurity defense ya ethical technology seekhna chahte hain, toh main zaroor madad kar sakta hoon."
    weapons = r"\b(?:make|create|build|synthesize|manufacture|kaise\s+banaye|banane\s+ka\s+tarika).*(?:bomb|explosive|ied|grenade|weapon|pipe\s*bomb|molotov|poison|cyanide|anthrax|gunpowder|hathiyar)\b|\b(?:bomb|explosive|ied|grenade|weapon|pipe\s*bomb|molotov|poison|cyanide|hathiyar).*(?:bana(?:ne|ye|o|na)|banao|make|build|kaise\s+banaye)\b"
    if re.search(weapons, t, re.I):
        return "Main hathiyar, bomb, explosives, ya hanikarak rasayan (chemicals) banane se judi jankari pradan nahi kar sakta."
    drugs = r"\b(?:how\s+to\s+)?(?:make|cook|synthesize|manufacture|produce|kaise\s+banaye|banane\s+ka\s+tarika).*(?:meth(?:amphetamine)?|heroin|cocaine|fentanyl|lsd|crack|drugs|nasha)\b|\b(?:meth|heroin|cocaine|fentanyl|lsd|drugs|nasha).*(?:bana(?:ne|ye|o|na)|kaise\s+bana(?:ye|o|ne)|cook|synthesize|make)\b"
    if re.search(drugs, t, re.I):
        return "Main illicit drugs ya hanikarak padarth banane ki jankari nahi de sakta."
    self_harm = r"\b(?:how\s+to\s+commit\s+suicide|how\s+to\s+kill\s+myself|ways\s+to\s+die|suicide\s+methods|apne\s+aap\s+ko\s+kaise\s+maru|marne\s+ka\s+tarika|aatmahatya)\b"
    if re.search(self_harm, t, re.I):
        return "Aapki zindagi anmol hai. Agar aap pareshan hain ya kisi kathin daur se guzar rahe hain, kripya turant helpline par sampark karein (KIRAN Helpline: 1800-599-0019 ya Tele-MANAS: 14416). Main aisi kisi bhi gatividhi me sahayata nahi kar sakta."
    fraud = r"\b(?:how\s+to\s+steal|carding\s+tutorial|fake\s+currency\s+printing|counterfeit\s+money|launder\s+money|chori\s+kaise\s+kare|fraud\s+kaise\s+kare)\b"
    if re.search(fraud, t, re.I):
        return "Main chori, fraud, ya kisi bhi illegal financial gatividhi me madad nahi kar sakta."
    return None


def is_image_generation_request_text(text: str) -> bool:
    if not text or not isinstance(text, str):
        return False
    t = text.lower().strip()
    if re.search(r"^(?:who is|what is|why is|how to|where is|koun hai|kya hai|kaun hai)\b", t, re.I) and not re.search(r"\b(?:photo|image|picture|pic|tasveer)\b", t, re.I):
        return False
    if re.search(r"^(?:draw|paint|sketch)\s+(?:a|an|me|the)?\s+", t, re.I):
        return True
    nouns = r"(?:image|picture|photo|photograph|illustration|artwork|wallpaper|poster|logo|thumbnail|icon|tasveer|tasvir|pic|pics|chitra|तस्वीर|तसवीर|फोटो|चित्र|छवि|इमेज)"
    verbs = r"(?:generate|create|make|draw|design|paint|illustrate|render|bana(?:o|do|na|ye|de)?|bna(?:o|do|de)?|karo|kar\s*(?:do|de)|want|need|show(?:\s+me)?|dikha(?:o|na|ye|do|de)?|bhej(?:o|na|do|de)?|send|give|do|de(?:\s*(?:do|de))?|chahiye|mangta|बनाओ|बना\s*दो|बनादो|दिखाओ|भेजो|दीजिए|चाहिए)"
    if re.search(rf"^{verbs}\s+(?:an?\s+)?{nouns}", t, re.I):
        return True
    if re.search(rf"{nouns}\s+{verbs}", t, re.I):
        return True
    if re.search(rf"{verbs}.*{nouns}", t, re.I):
        return True
    if re.search(rf"{nouns}.*{verbs}", t, re.I):
        return True
    if re.search(rf"\bki\s+{nouns}\b", t, re.I) or re.search(rf"\bka\s+{nouns}\b", t, re.I):
        return True
    if re.search(rf"\b{nouns}\s+(?:of|for|ki|ka)\b", t, re.I):
        return True
    if re.search(rf"\b{nouns}$", t, re.I):
        return True
    if re.search(r"\b(?:asli\s*(?:log(?:o|on)?|aadmi|insaan|aurat|ladki|ladka)|real\s*(?:people|person|human))\b", t, re.I):
        return True
    return False


AUTHENTIC_ENTITIES = [
    {"patterns": [r"\b(?:nike|swoosh)\b"], "article": "Swoosh", "label": "Nike"},
    {"patterns": [r"\bapple\s*(?:inc|computer|logo|brand)?\b"], "article": "Apple_Inc.", "label": "Apple"},
    {"patterns": [r"\badidas\b"], "article": "Adidas", "label": "Adidas"},
    {"patterns": [r"\btesla\b"], "article": "Tesla,_Inc.", "label": "Tesla"},
    {"patterns": [r"\bmcdonalds|mcdonald'?s|golden arches\b"], "article": "Golden_Arches", "label": "McDonald's"},
    {"patterns": [r"\b(?:twitter|x\s+logo)\b"], "article": "Twitter", "label": "Twitter"},
    {"patterns": [r"\bcoca[\s-]*cola|coke\b"], "article": "Coca-Cola", "label": "Coca-Cola"},
    {"patterns": [r"\bpepsi\b"], "article": "Pepsi", "label": "Pepsi"},
    {"patterns": [r"\bnetflix\b"], "article": "Netflix", "label": "Netflix"},
    {"patterns": [r"\bspotify\b"], "article": "Spotify", "label": "Spotify"},
    {"patterns": [r"\blamborghini\b"], "article": "Lamborghini", "label": "Lamborghini"},
    {"patterns": [r"\baudi\b"], "article": "Audi", "label": "Audi"},
    {"patterns": [r"\bshin[\s-]*chan\b"], "article": "Crayon_Shin-chan", "label": "Shin-chan"},
    {"patterns": [r"\bdoraemon\b"], "article": "Doraemon", "label": "Doraemon"},
    {"patterns": [r"\bpikachu\b"], "article": "Pikachu", "label": "Pikachu"},
    {"patterns": [r"\bshah[\s-]*rukh[\s-]*khan|srk\b"], "article": "Shah_Rukh_Khan", "label": "Shah Rukh Khan"},
    {"patterns": [r"\bvirat[\s-]*kohli\b"], "article": "Virat_Kohli", "label": "Virat Kohli"},
    {"patterns": [r"\bnarendra[\s-]*modi|modi[\s-]*ji\b"], "article": "Narendra_Modi", "label": "Narendra Modi"},
    {"patterns": [r"\bsalman[\s-]*khan\b"], "article": "Salman_Khan", "label": "Salman Khan"},
    {"patterns": [r"\bms[\s-]*dhoni|dhoni\b"], "article": "MS_Dhoni", "label": "MS Dhoni"},
    {"patterns": [r"\brohit[\s-]*sharma\b"], "article": "Rohit_Sharma", "label": "Rohit Sharma"},
    {"patterns": [r"\bsachin[\s-]*tendulkar\b"], "article": "Sachin_Tendulkar", "label": "Sachin Tendulkar"},
    {"patterns": [r"\bamitabh[\s-]*bachchan\b"], "article": "Amitabh_Bachchan", "label": "Amitabh Bachchan"},
    {"patterns": [r"\belon[\s-]*musk\b"], "article": "Elon_Musk", "label": "Elon Musk"},
    {"patterns": [r"\bbill[\s-]*gates\b"], "article": "Bill_Gates", "label": "Bill Gates"},
    {"patterns": [r"\bsteve[\s-]*jobs\b"], "article": "Steve_Jobs", "label": "Steve Jobs"},
    {"patterns": [r"\balbert[\s-]*einstein|einstein\b"], "article": "Albert_Einstein", "label": "Albert Einstein"},
    {"patterns": [r"\bbhagat[\s-]*singh\b"], "article": "Bhagat_Singh", "label": "Bhagat Singh"},
    {"patterns": [r"\bsubhas[\s-]*chandra[\s-]*bose|netaji\b"], "article": "Subhas_Chandra_Bose", "label": "Netaji Subhas Chandra Bose"},
    {"patterns": [r"\babdul[\s-]*kalam|apj\s*abdul\s*kalam\b"], "article": "A._P._J._Abdul_Kalam", "label": "Dr. A.P.J. Abdul Kalam"},
    {"patterns": [r"\bmahatma[\s-]*gandhi|gandhi[\s-]*ji\b"], "article": "Mahatma_Gandhi", "label": "Mahatma Gandhi"},
    {"patterns": [r"\bcristiano[\s-]*ronaldo|ronaldo\b"], "article": "Cristiano_Ronaldo", "label": "Cristiano Ronaldo"},
    {"patterns": [r"\blionel[\s-]*messi|messi\b"], "article": "Lionel_Messi", "label": "Lionel Messi"},
    {"patterns": [r"\btaj[\s-]*mahal\b"], "article": "Taj_Mahal", "label": "Taj Mahal"},
    {"patterns": [r"\beiffel[\s-]*tower|effel[\s-]*tower\b"], "article": "Eiffel_Tower", "label": "Eiffel Tower"},
    {"patterns": [r"\bindia[\s-]*gate\b"], "article": "India_Gate", "label": "India Gate"},
    {"patterns": [r"\bred[\s-]*fort\b"], "article": "Red_Fort", "label": "Red Fort"}
]


async def fetch_real_web_photo(query: str, client: httpx.AsyncClient) -> Optional[dict]:
    import base64
    try:
        token_res = await client.get(f"https://duckduckgo.com/?q={httpx.URL('', params={'q': query}).params['q']}", timeout=4.0)
        if not token_res.is_success:
            return None
        m = re.search(r"vqd=[\"']?([^\"'&]+)[\"']?", token_res.text)
        if not m:
            return None
        vqd = m.group(1)

        is_logo = bool(re.search(r"\b(?:logo|emblem|icon|symbol)\b", query, re.I))
        flt = "&f=,,,type:transparent," if is_logo else "&f=,,,type:photo,"
        enc_q = httpx.URL("", params={"q": query}).params["q"]
        api_url = f"https://duckduckgo.com/i.js?l=us-en&o=json&q={enc_q}&vqd={vqd}{flt}&p=1"
        res = await client.get(api_url, headers={"Referer": "https://duckduckgo.com/"}, timeout=5.0)
        if not res.is_success:
            return None
        data = res.json()
        candidates = (data.get("results") or [])[:8]
        for item in candidates:
            img_url = item.get("image") or ""
            if not img_url.startswith("http://") and not img_url.startswith("https://"):
                continue
            try:
                img_fetch = await client.get(img_url, timeout=6.0)
                if img_fetch.is_success:
                    mime = img_fetch.headers.get("content-type", "image/jpeg").split(";")[0].strip()
                    if mime.startswith("image/"):
                        content = img_fetch.content
                        if len(content) > 5000:
                            b64 = base64.b64encode(content).decode("ascii")
                            return {
                                "images": [{"mimeType": mime, "data": b64}],
                                "text": f'Real photo for: **"{query}"**'
                            }
            except Exception:
                pass
    except Exception:
        pass
    return None


async def fetch_authentic_visual(prompt: str, client: httpx.AsyncClient) -> Optional[dict]:
    import base64
    for item in AUTHENTIC_ENTITIES:
        if any(re.search(pat, prompt, re.I) for pat in item["patterns"]):
            try:
                url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{item['article']}"
                res = await client.get(url, timeout=5.0)
                if res.is_success:
                    d = res.json()
                    img_url = (d.get("thumbnail") or {}).get("source") or (d.get("originalimage") or {}).get("source")
                    if img_url and not img_url.endswith(".svg"):
                        img_res = await client.get(img_url, timeout=8.0)
                        if img_res.is_success:
                            mime = img_res.headers.get("content-type", "image/jpeg").split(";")[0].strip()
                            b64 = base64.b64encode(img_res.content).decode("ascii")
                            return {
                                "images": [{"mimeType": mime, "data": b64}],
                                "text": f"Authentic verified visual for **{item['label']}**"
                            }
            except Exception:
                pass
    return None


def translate_hindi_to_english(text: str) -> str:
    eng = (text or "").strip()
    translations = [
        (r"\b(?:asli\s*(?:log(?:o|on)?|aadmi|insaan|manav|janta|vyakti)|real\s*(?:people|person|human(?:s)?))\b", "real Indian people smiling portrait"),
        (r"\b(?:sundar|khubsurat)\s+(?:ladki|kanya|mahila|aurat)\b", "beautiful Indian woman portrait"),
        (r"\b(?:ladki|kanya)\b", "beautiful Indian girl portrait"),
        (r"\b(?:aurat|mahila)\b", "Indian woman portrait"),
        (r"\b(?:ladka)\b", "handsome Indian boy portrait"),
        (r"\b(?:aadmi|purush)\b", "handsome Indian man portrait"),
        (r"\b(?:billi)\b", "cute domestic cat"),
        (r"\b(?:kutta|kutte)\b", "friendly dog puppy"),
        (r"\b(?:sher)\b", "royal bengal tiger"),
        (r"\b(?:hathi)\b", "majestic elephant"),
        (r"\b(?:ghoda)\b", "majestic galloping horse"),
        (r"\b(?:gadi|gaadi|car)\b", "luxury modern sports car"),
        (r"\b(?:pahad|parvat)\b", "majestic snow mountain landscape"),
        (r"\b(?:nadi)\b", "scenic river landscape"),
        (r"\b(?:samundar|samudra)\b", "beautiful ocean beach sunset"),
        (r"\b(?:suraj)\b", "golden glowing sun"),
        (r"\b(?:chand|chanda)\b", "radiant moon in starry night sky"),
        (r"\b(?:ped|paudhe)\b", "lush green tree landscape"),
        (r"\b(?:phool|gulab)\b", "vibrant blossoming flowers"),
        (r"\b(?:barish)\b", "dramatic rain aesthetic"),
        (r"\b(?:asli)\b", "real authentic"),
        (r"\b(?:sundar|khubsurat)\b", "beautiful stunning"),
        (r"\b(?:achhi|achi|badhiya|mast)\b", "stunning high quality")
    ]
    for pat, rep in translations:
        eng = re.sub(pat, rep, eng, flags=re.I)
    return re.sub(r"\s+", " ", eng).strip()


def clean_image_prompt(p: str) -> str:
    s = (p or "").strip()
    s = re.sub(r"^(?:bhai|bro|please|kripya|can you|hey|hello|assistant|are|yaar|sun|suno)\s+", "", s, flags=re.I)
    s = re.sub(r"^(?:mujhe|humko|hame|mere ko)\s+", "", s, flags=re.I)
    s = re.sub(r"^(?:that\s+(?:the|teh)\s+)?(?:chatbot\s+)?", "", s, flags=re.I)
    s = re.sub(r"^(?:(?:generate|gen(?:er|ar)ate|gem[\W_]*nerate|create|draw|make|render|paint|sketch|show(?:\s+me)?|give(?:\s+me)?|send(?:\s+me)?)\s+(?:the\s+)?(?:an?\s+)?(?:image|imag|picture|photo|illustration|artwork|pic|pics|wallpaper)\s*(?:e?of|about|depicting|for)?\s*)", "", s, flags=re.I)
    s = re.sub(r"^(?:an?\s+)?(?:image|photo|picture|pic|pics|wallpaper)\s+(?:of|for|about)\s+", "", s, flags=re.I)
    s = re.sub(r"^(?:(?:ek\s+)?(?:achi\s+|achhi\s+|badhiya\s+|sundar\s+|mast\s+)?(?:si\s+)?)?(?:image|photo|picture|tasveer|pic)\s*(?:banao|dikhao|generate\s*karo|bhejo|do|de\s*do|chahiye)\s*(?:ki|ka|ke|of)?\s*", "", s, flags=re.I)
    s = re.sub(r"\s*(?:ke|ki|ka)?\s*(?:image|photo|picture|tasveer|chitra|pic|pics|wallpaper)\s*(?:generate\s*karke\s*(?:do|de|bhejo)?|generate\s*karo|banao|dikhao|bana\s*(?:do|de|o)|bhej\s*(?:do|de|o)|bhejo|do|de\s*do|chahiye|mangta|karo)\s*$", "", s, flags=re.I)
    s = re.sub(r"\s*(?:ki|ka|ke)\s*(?:image|photo|picture|tasveer|pic|pics)\s*$", "", s, flags=re.I)
    s = re.sub(r"\s+(?:image|photo|picture|pic|pics)$", "", s, flags=re.I)
    s = re.sub(r"\s+(?:generate\s*karke\s*(?:do|de|bhejo)?|generate\s*karo|banao|dikhao|bana\s*(?:do|de|o)|bhej\s*(?:do|de|o)|bhejo|do|de\s*do|chahiye|mangta|karo)\s*$", "", s, flags=re.I)
    s = re.sub(r"\s+(?:ki|ka|ke)\s*$", "", s, flags=re.I)
    s = re.sub(r"^(?:ki|ka|ke)\s+", "", s, flags=re.I)
    s = re.sub(r"^(?:draw|paint|sketch)\s+(?:a|an|me|the)?\s+", "", s, flags=re.I)
    s = re.sub(r"^(?:(?:ek\s+)?(?:achi\s+|achhi\s+|badhiya\s+|sundar\s+|mast\s+)?(?:si\s+)?)", "", s, flags=re.I)
    s = re.sub(r"^[\s:;,.-]+|[\s:;,.-]+$", "", s).strip()
    return s or "beautiful vibrant artwork"


async def generate_high_quality_image(prompt: str, api_key: Optional[str] = None, attachments: Optional[List[Attachment]] = None) -> dict:
    import random
    import base64
    import asyncio

    clean_prompt = clean_image_prompt(prompt)

    async with httpx.AsyncClient(timeout=35.0, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}) as client:
        # Check authentic verified visual database first
        authentic = await fetch_authentic_visual(prompt + " " + clean_prompt, client)
        if authentic:
            return authentic

        # Prompt Enrichment
        enriched_prompt = clean_prompt
        is_real_person = False
        is_logo = False

        is_real_people_query = bool(
            re.search(r"\b(?:asli\s*(?:log(?:o|on)?|aadmi|insaan|manav|janta|vyakti|aurat|ladki|ladka)|real\s*(?:people|person|human(?:s)?|man|woman|portrait|face)|indian\s*(?:people|man|woman|girl|boy))\b", clean_prompt, re.I) or
            re.search(r"\b(?:asli\s*(?:log(?:o|on)?|aadmi|insaan|manav|janta|vyakti|aurat|ladki|ladka)|real\s*(?:people|person|human(?:s)?|man|woman|portrait|face))\b", prompt, re.I)
        )

        if is_real_people_query and not re.search(r"\b(?:brand|company|vector|graphic)\b", clean_prompt, re.I):
            is_real_person = True
            enriched_prompt = "photorealistic portrait of authentic real people with genuine warm smiles, highly detailed natural skin texture with visible pores, realistic eyes and hair, professional 85mm portrait photography, soft studio lighting, sharp focus, 8k resolution, photorealism masterpiece"
        elif re.search(r"\b(?:logo|emblem|symbol|crest|icon)\b", clean_prompt, re.I):
            is_logo = True
            enriched_prompt = f"{clean_prompt}, clean minimalist modern vector emblem design, sharp edges, iconic branding, centered, solid clean background, 4k high resolution"
        else:
            eng = clean_prompt
            translations = [
                (r"\b(?:sundar|khubsurat)\s+(?:ladki|kanya|mahila|aurat)\b", "beautiful Indian woman"),
                (r"\b(?:ladki|kanya)\b", "Indian girl"),
                (r"\b(?:aurat|mahila)\b", "Indian woman"),
                (r"\b(?:ladka)\b", "Indian boy"),
                (r"\b(?:aadmi|purush)\b", "Indian man"),
                (r"\b(?:billi)\b", "cute domestic cat"),
                (r"\b(?:kutta|kutte)\b", "friendly dog"),
                (r"\b(?:sher)\b", "majestic lion"),
                (r"\b(?:hathi)\b", "majestic elephant"),
                (r"\b(?:ghoda)\b", "majestic galloping horse"),
                (r"\b(?:gadi|gaadi)\b", "luxury modern car"),
                (r"\b(?:pahad|parvat)\b", "majestic snow-capped mountains"),
                (r"\b(?:nadi)\b", "serene flowing river landscape"),
                (r"\b(?:samundar|samudra)\b", "beautiful ocean waves beach at sunset"),
                (r"\b(?:suraj)\b", "golden glowing sun"),
                (r"\b(?:chand|chanda)\b", "radiant full moon in starry night sky"),
                (r"\b(?:ped|paudhe)\b", "lush green ancient tree"),
                (r"\b(?:phool|gulab)\b", "vibrant blossoming red rose flower"),
                (r"\b(?:barish)\b", "dramatic rain drops aesthetic"),
                (r"\b(?:asli)\b", "photorealistic real authentic"),
                (r"\b(?:sundar|khubsurat)\b", "beautiful breathtaking"),
                (r"\b(?:achhi|achi|badhiya|mast)\b", "stunning high quality")
            ]
            for pat, rep in translations:
                eng = re.sub(pat, rep, eng, flags=re.I)
            eng = re.sub(r"\s+", " ", eng).strip()

            has_style = re.search(r"\b(photo(?:realistic|graph)?|realistic|cinematic|anime|cartoon|illustration|painting|watercolor|sketch|pixel art|3d render|vector|comic|oil paint)\b", eng, flags=re.I)
            if has_style:
                enriched_prompt = f"{eng}, masterpiece, sharp focus, 8k resolution, highly detailed"
            else:
                enriched_prompt = f"{eng}, photorealistic, cinematic lighting, lifelike details, vibrant colors, sharp focus, high resolution 8k"

        # Real High-Definition Web Photo Engine
        search_query = (
            ("beautiful Indian woman smiling portrait" if re.search(r"ladki|woman|girl", clean_prompt, re.I) else ("Indian handsome man portrait" if re.search(r"aadmi|man|boy", clean_prompt, re.I) else "real Indian people smiling"))
            if is_real_people_query
            else (clean_prompt if is_logo else translate_hindi_to_english(clean_prompt))
        )
        real_photo = await fetch_real_web_photo(search_query, client)
        if real_photo:
            return real_photo

        # Tier 1: Gemini Image API
        if api_key:
            try:
                model_input = [{"type": "text", "text": enriched_prompt}]
                for att in (attachments or [])[:10]:
                    data_url = att.data or ""
                    mime = att.mimeType or ""
                    if mime in {"image/png", "image/jpeg", "image/webp"} and data_url.startswith(f"data:{mime};base64,"):
                        model_input.append({"type": "image", "mime_type": mime, "data": data_url.split(",", 1)[1]})
                for model in ("gemini-3.1-flash-image", "gemini-nano-banana-2.1", "gemini-3.1-flash-lite-image"):
                    response = await client.post(
                        "https://generativelanguage.googleapis.com/v1beta/interactions",
                        headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
                        json={"model": model, "input": model_input, "response_format": {"type": "image", "aspect_ratio": "1:1", "image_size": "1K"}},
                        timeout=6.0
                    )
                    if response.is_success:
                        result = response.json()
                        out_img = result.get("output_image") or next((out for out in result.get("outputs", []) if out.get("type") == "image"), {})
                        img_data = out_img.get("data") or (out_img.get("image") or {}).get("data")
                        if img_data:
                            return {"images": [{"mimeType": out_img.get("mime_type", "image/png"), "data": img_data}], "text": f'Generated image for: **"{clean_prompt}"**'}
            except Exception:
                pass

        # Tier 2: Pollinations Engine (Fast 3.5s check)
        try:
            seed = random.randint(1, 2147483640)
            enc_prompt = httpx.URL("", params={"q": enriched_prompt}).params["q"]
            poll_url = f"https://image.pollinations.ai/prompt/{enc_prompt}?width=768&height=768&seed={seed}&nologo=true"
            res = await client.get(poll_url, timeout=3.5)
            content_type = res.headers.get("content-type", "")
            if res.is_success and "image/" in content_type:
                mime = content_type.split(";")[0].strip()
                b64 = base64.b64encode(res.content).decode("ascii")
                return {"images": [{"mimeType": mime, "data": b64}], "text": f'Generated image for: **"{clean_prompt}"**'}
        except Exception:
            pass

        # Tier 3: AI Horde Diffusion Engine with Photorealism Models
        try:
            horde_models = (
                ["ICBINP - I Can't Believe It's Not Photography", "AbsoluteReality", "Deliberate", "stable_diffusion"]
                if is_real_person
                else (["Deliberate", "stable_diffusion"] if is_logo else ["AbsoluteReality", "Deliberate", "stable_diffusion"])
            )
            neg_prompt = (
                "deformed, disfigured, bad anatomy, poorly drawn face, mutated, extra limbs, blurry, low quality, distorted, cartoon, 3d render, anime, painting, bad eyes, missing fingers, extra fingers, doll, plastic skin, wax figure, artifact"
                if is_real_person
                else ("photorealistic human, photo, textured background, complex 3d noise, blurry, low quality, watermark, text distortion" if is_logo else "deformed, low quality, blurry, distorted, antique 1925 vintage car, cartoon, extra limbs")
            )
            post_res = await client.post(
                "https://aihorde.net/api/v2/generate/async",
                headers={"Content-Type": "application/json", "apikey": "0000000000", "Client-Agent": "mm-chatbot:1.0:user@example.com"},
                json={
                    "prompt": enriched_prompt,
                    "params": {"steps": 25, "width": 512, "height": 512, "sampler_name": "k_euler", "cfg_scale": 7.5, "negative_prompt": neg_prompt},
                    "models": horde_models
                },
                timeout=10.0
            )
            if post_res.is_success:
                job_id = post_res.json().get("id")
                start = asyncio.get_event_loop().time()
                while asyncio.get_event_loop().time() - start < 35.0:
                    await asyncio.sleep(1.8)
                    check = await client.get(f"https://aihorde.net/api/v2/generate/status/{job_id}", timeout=6.0)
                    if check.is_success:
                        status_data = check.json()
                        if status_data.get("done") and status_data.get("generations"):
                            img_url = status_data["generations"][0].get("img")
                            if img_url:
                                img_res = await client.get(img_url, timeout=12.0)
                                if img_res.is_success:
                                    mime = img_res.headers.get("content-type", "image/webp").split(";")[0].strip()
                                    b64 = base64.b64encode(img_res.content).decode("ascii")
                                    return {"images": [{"mimeType": mime, "data": b64}], "text": f'Generated image for: **"{clean_prompt}"**'}
        except Exception:
            pass

    raise HTTPException(status_code=502, detail="All image generation engines are currently busy. Please retry in a few moments.")


@app.post("/api/generate-image")
async def generate_image(req: ImageGenerationRequest):
    prompt = (req.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Describe the image you want to generate.")
    safety_issue = check_safety_violation(prompt)
    if safety_issue:
        raise HTTPException(status_code=400, detail=safety_issue)
    api_key = get_api_key(req.apiKey)
    return await generate_high_quality_image(prompt, api_key, req.attachments)


def build_gemini_contents(messages: List[ChatMessage], attachments: List[Attachment]):
    transcript = []
    for index, message in enumerate(messages):
        if message.role not in {"user", "assistant", "model"}:
            continue
        role = "Assistant" if message.role in {"assistant", "model"} else "User"
        if message.content and message.content.strip():
            transcript.append(f"{role}: {message.content.strip()}")
    input_items = [{"type": "text", "text": "\n\n".join(transcript) or "User: Hello"}]
    latest = messages[-1] if messages else None
    if latest and latest.role == "user":
        for attachment in attachments:
            data_url = attachment.data or ""
            if not data_url.startswith("data:") or "," not in data_url:
                continue
            mime = attachment.mimeType or "application/octet-stream"
            encoded = data_url.split(",", 1)[1]
            if mime.startswith("image/"):
                input_items.append({"type": "image", "mime_type": mime, "data": encoded})
            elif mime.startswith(("audio/", "application/pdf")):
                input_items.append({"type": "text", "text": f"[Attached {mime} file: {attachment.name or 'file'} is not available in this interaction.]"})
            else:
                try:
                    text = base64.b64decode(encoded).decode("utf-8")
                    input_items.append({"type": "text", "text": f"\n[Attached file: {attachment.name or 'document'}]\n{text}"})
                except Exception:
                    continue
    return input_items


@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    api_key = get_api_key(req.apiKey)
    selected_model = req.model if req.model in MODEL_IDS else "gemini-3.6-flash"

    async def event_generator():
        yield sse({"type": "start", "model": selected_model})
        if not api_key:
            yield sse({"type": "error", "error": "Add your Gemini API key in Settings or set GEMINI_API_KEY on the server."})
            return

        latest_user = next((m for m in reversed(req.messages or []) if m.role == "user"), None)
        latest_text = latest_user.content if latest_user and latest_user.content else ""

        safety_issue = check_safety_violation(latest_text)
        if safety_issue:
            yield sse({"type": "chunk", "text": safety_issue})
            yield sse({"type": "done", "stats": {"live": True, "model": "safety-guardrail"}})
            return

        if is_image_generation_request_text(latest_text):
            try:
                img_res = await generate_high_quality_image(latest_text, api_key, req.attachments)
                first_img = img_res.get("images", [{}])[0]
                if first_img and first_img.get("data"):
                    clean_p = clean_image_prompt(latest_text)
                    data_uri = f"data:{first_img.get('mimeType', 'image/jpeg')};base64,{first_img['data']}"
                    md = f"Yeh lijiye aapki image for **\"{clean_p}\"**:\n\n![{clean_p}]({data_uri})\n\n[📥 Download Image]({data_uri})\n\n"
                    yield sse({"type": "chunk", "text": md})
                    yield sse({"type": "done", "stats": {"live": True, "model": "image-engine"}})
                    return
            except Exception as e:
                pass

        payload = {"model": selected_model, "input": build_gemini_contents(req.messages, req.attachments), "stream": True}
        base_instruction = "You are Zenith Assistant, an intelligent, articulate, helpful, and friendly multimodal AI assistant. Provide thoughtful, well-structured, accurate, and comprehensive responses. If the user writes or speaks in Hindi or Hinglish, reply naturally and accurately in Hindi/Hinglish. Use clear markdown formatting with bold headings, bullet points, and code blocks where helpful. Never tell the user to go to Google Images, Pinterest, or external search engines to find photos. You are a multimodal assistant that can generate and perceive visuals directly."
        effective_instruction = f"{base_instruction}\n\nAdditional user guidelines: {req.systemInstruction.strip()}" if (req.systemInstruction and req.systemInstruction.strip()) else base_instruction
        payload["input"].insert(0, {"type": "text", "text": "System instruction: " + effective_instruction})
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=20.0)) as client:
                candidates = list(dict.fromkeys([selected_model, "gemini-3.6-flash", "gemini-3.5-flash-lite"]))
                for candidate_index, candidate in enumerate(candidates):
                    async with client.stream("POST", "https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse", headers={"x-goog-api-key": api_key, "Content-Type": "application/json"}, json={**payload, "model": candidate}) as response:
                        if not response.is_success:
                            raw = await response.aread()
                            try:
                                detail = json.loads(raw).get("error", {}).get("message", f"Gemini API returned HTTP {response.status_code}")
                            except Exception:
                                detail = f"Gemini API returned HTTP {response.status_code}"
                            if response.status_code in {429, 503} and candidate_index < len(candidates) - 1:
                                continue
                            yield sse({"type": "error", "error": detail})
                            return
                        async for line in response.aiter_lines():
                            if not line.startswith("data:"):
                                continue
                            try:
                                event = json.loads(line[5:].strip())
                            except json.JSONDecodeError:
                                continue
                            delta = event.get("delta") or event.get("data", {}).get("delta") or {}
                            text = delta.get("text") if delta.get("type") == "text" else event.get("delta_text")
                            if text:
                                yield sse({"type": "chunk", "text": text})
                            error_value = event.get("error")
                            if isinstance(error_value, dict):
                                error_value = error_value.get("message")
                            provider_error = error_value or (event.get("message") if "error" in event.get("event_type", "") or "failed" in event.get("event_type", "") else None)
                            if provider_error:
                                yield sse({"type": "error", "error": provider_error})
                                return
                    yield sse({"type": "done", "stats": {"live": True, "model": candidate}})
                    return
        except Exception as exc:
            yield sse({"type": "error", "error": f"Gemini request failed: {exc}"})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


public_dir = Path(__file__).parent / "public"
if public_dir.exists():
    app.mount("/", StaticFiles(directory=str(public_dir), html=True), name="public")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3000))
    print(f"Zenith Assistant Python server starting at http://localhost:{port}")
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)
