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
    return False


def clean_image_prompt(p: str) -> str:
    s = (p or "").strip()
    s = re.sub(r"^(?:bhai|bro|please|kripya|can you|hey|hello|assistant)\s+", "", s, flags=re.I)
    s = re.sub(r"^(?:mujhe|humko|hame)\s+", "", s, flags=re.I)
    s = re.sub(r"^(?:(?:that\s+(?:the|teh)\s+)?(?:chatbot\s+)?(?:gem[\W_]*nerate|gen(?:er|ar)ate|generate|create|draw|make|render|paint|sketch|show(?:\s+me)?|give(?:\s+me)?|send(?:\s+me)?)\s+(?:the\s+)?(?:an?\s+)?(?:image|imag|picture|photo|illustration|artwork|pic|pics|wallpaper)\s*(?:e?of|about|depicting|for)?\s*)", "", s, flags=re.I)
    s = re.sub(r"^(?:an?\s+)?(?:image|photo|picture|pic|pics|wallpaper)\s+(?:of|for|about)\s+", "", s, flags=re.I)
    s = re.sub(r"^(?:(?:ek\s+)?(?:achi\s+|achhi\s+|badhiya\s+|sundar\s+|mast\s+)?(?:si\s+)?)?(?:image|photo|picture|tasveer|pic)\s*(?:banao|dikhao|generate\s*karo|bhejo|do|de\s*do|chahiye)\s*(?:ki|ka|ke|of)?\s*", "", s, flags=re.I)
    s = re.sub(r"\s*(?:ki|ka|ke)?\s*(?:image|photo|picture|tasveer|chitra|pic|pics|wallpaper)\s*(?:banao|generate\s*karo|dikhao|bana\s*(?:do|de|o)|bhej\s*(?:do|de|o)|bhejo|do|de\s*do|chahiye|mangta|karo)\s*$", "", s, flags=re.I)
    s = re.sub(r"\s*(?:ki|ka|ke)\s*(?:image|photo|picture|tasveer|pic|pics)\s*$", "", s, flags=re.I)
    s = re.sub(r"\s+(?:image|photo|picture|pic|pics)$", "", s, flags=re.I)
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

    lower = clean_prompt.lower()
    is_character = False
    if "shinchan" in lower or "shin chan" in lower or "shin-chan" in lower:
        enriched_prompt = "Crayon Shin-chan (Shinnosuke Nohara) anime character, official anime art style, vibrant colors, joyful pose, clean studio illustration, high quality"
        is_character = True
    elif "doraemon" in lower:
        enriched_prompt = "Doraemon cute blue robotic cat anime character, official studio anime art style, happy expression, vibrant colors, high quality masterpiece"
        is_character = True
    elif "naruto" in lower:
        enriched_prompt = "Naruto Uzumaki anime character, official studio anime art style, vibrant colors, high quality masterpiece"
        is_character = True
    elif "goku" in lower or "dragon ball" in lower:
        enriched_prompt = "Son Goku Dragon Ball anime character, high quality studio anime art style, dynamic pose, vibrant colors"
        is_character = True
    elif "pikachu" in lower or "pokemon" in lower:
        enriched_prompt = "Pikachu cute Pokémon character, official anime style, bright yellow, cheerful pose, high quality"
        is_character = True
    else:
        has_style = re.search(r"\b(photo(?:realistic|graph)?|realistic|cinematic|anime|cartoon|illustration|painting|watercolor|sketch|pixel art|3d render|vector|comic|oil paint)\b", clean_prompt, flags=re.I)
        if has_style:
            enriched_prompt = f"{clean_prompt}, masterpiece, sharp focus, 8k resolution, highly detailed"
        else:
            enriched_prompt = f"{clean_prompt}, cinematic lighting, photorealistic, lifelike details, vibrant colors, sharp focus, high resolution 8k"

    async with httpx.AsyncClient(timeout=30.0, headers={"User-Agent": "Mozilla/5.0"}) as client:
        # Tier 1: Gemini Image API (if key available and has quota)
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
                        timeout=8.0
                    )
                    if response.is_success:
                        result = response.json()
                        out_img = result.get("output_image") or next((out for out in result.get("outputs", []) if out.get("type") == "image"), {})
                        img_data = out_img.get("data") or (out_img.get("image") or {}).get("data")
                        if img_data:
                            return {"images": [{"mimeType": out_img.get("mime_type", "image/png"), "data": img_data}], "text": f'Generated image for: **"{clean_prompt}"**'}
            except Exception:
                pass

        # Tier 2: Pollinations FLUX Engine
        try:
            seed = random.randint(1, 2147483640)
            enc_prompt = httpx.URL("", params={"q": enriched_prompt}).params["q"]
            poll_url = f"https://image.pollinations.ai/prompt/{enc_prompt}?width=1024&height=1024&seed={seed}&nologo=true&model=flux"
            res = await client.get(poll_url, timeout=18.0)
            if res.is_success:
                mime = res.headers.get("content-type", "image/jpeg").split(";")[0].strip()
                b64 = base64.b64encode(res.content).decode("ascii")
                return {"images": [{"mimeType": mime, "data": b64}], "text": f'Generated image for: **"{clean_prompt}"**'}
        except Exception:
            pass

        # Tier 3: Media Archive (for known characters & iconic subjects)
        if is_character or len(clean_prompt.split()) <= 4:
            try:
                variations = [clean_prompt, clean_prompt.replace(" ", "_")]
                if "shinchan" in lower:
                    variations = ["Shin-chan", "Crayon_Shin-chan"] + variations
                if "doraemon" in lower:
                    variations = ["Doraemon"] + variations

                for v in variations:
                    summary_res = await client.get(f"https://en.wikipedia.org/api/rest_v1/page/summary/{v}", timeout=5.0)
                    if summary_res.is_success:
                        data = summary_res.json()
                        img_url = (data.get("originalimage") or {}).get("source") or (data.get("thumbnail") or {}).get("source")
                        if img_url and not img_url.endswith(".svg"):
                            img_res = await client.get(img_url, timeout=10.0)
                            if img_res.is_success:
                                mime = img_res.headers.get("content-type", "image/jpeg").split(";")[0].strip()
                                b64 = base64.b64encode(img_res.content).decode("ascii")
                                return {"images": [{"mimeType": mime, "data": b64}], "text": f'Generated visual for: **"{clean_prompt}"**'}
            except Exception:
                pass

        # Tier 4: AI Horde Diffusion Engine
        try:
            post_res = await client.post(
                "https://aihorde.net/api/v2/generate/async",
                headers={"Content-Type": "application/json", "apikey": "0000000000", "Client-Agent": "mm-chatbot:1.0:user@example.com"},
                json={"prompt": enriched_prompt, "params": {"steps": 20, "width": 512, "height": 512, "sampler_name": "k_euler"}},
                timeout=10.0
            )
            if post_res.is_success:
                job_id = post_res.json().get("id")
                start = asyncio.get_event_loop().time()
                while asyncio.get_event_loop().time() - start < 30.0:
                    await asyncio.sleep(2.0)
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
